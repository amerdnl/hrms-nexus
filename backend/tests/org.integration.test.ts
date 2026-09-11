import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { loadMigrations, runMigrations } from "../src/database/migrations.js";
import { applyMigrationsUpTo, businessSnapshot, UNUSABLE_HASH, withLab } from "./labHarness.js";

/** A weekday at least `offset` days from today (UTC), so leave has working days. */
function weekdayFrom(offset: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + offset);
  while ([0, 6].includes(date.getUTCDay())) date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

// Explicit opt-in; the only permitted host is the isolated, internal Docker lab.
test("M1 org structure: migration 0010, manager scope and cross-role authorization", {
  skip: process.env.HR_NEXUS_V3_LAB !== "1", timeout: 240_000,
}, async (t) => {
  await withLab(t, { label: "v3_org", migrate: false }, async (lab) => {
    const { db, database } = lab;

    // ------------------------------------------------------------ migration
    await applyMigrationsUpTo(db, database, "0009");
    const before = await businessSnapshot(db);
    const protectedBefore = await lab.protectedRows();

    await t.test("0010 applies additively: no business row, value or sequence changes", async () => {
      const result = await runMigrations(db, { mode: "apply", database });
      assert.ok(result.newlyApplied.includes("0010"));
      assert.deepEqual(await businessSnapshot(db, before), before);
      assert.deepEqual(await lab.protectedRows(), protectedBefore);

      const tenth = (await loadMigrations()).find((migration) => migration.version === "0010")!;
      assert.deepEqual(
        (await db.query("SELECT filename, checksum FROM public.schema_migrations WHERE version='0010'")).rows,
        [{ filename: tenth.filename, checksum: tenth.checksum }],
      );
      // Every existing employee starts with no manager: nothing was back-filled.
      assert.equal((await db.query("SELECT count(*)::int AS c FROM public.employees WHERE manager_id IS NOT NULL")).rows[0].c, 0);
    });

    await t.test("repeat apply is a no-op", async () => {
      assert.deepEqual((await runMigrations(db, { mode: "apply", database })).newlyApplied, []);
    });

    await t.test("the review-only rollback removes exactly what 0010 added", async () => {
      const rollback = await readFile(new URL("../../docs/sql/rollback_0010_org_structure.sql", import.meta.url), "utf8");
      const client = await db.connect();
      try {
        await client.query("BEGIN");
        await client.query(rollback);
        const column = await client.query(
          "SELECT 1 FROM information_schema.columns WHERE table_name='employees' AND column_name='manager_id'",
        );
        assert.equal(column.rowCount, 0);
        assert.equal((await client.query("SELECT to_regprocedure('public.prevent_manager_cycle()') AS f")).rows[0].f, null);
        assert.equal((await client.query("SELECT count(*)::int AS c FROM public.schema_migrations WHERE version='0010'")).rows[0].c, 0);
      } finally {
        await client.query("ROLLBACK");
        client.release();
      }
      // Rolled back inside the probe, so the clone is still at the full chain.
      assert.equal((await db.query("SELECT count(*)::int AS c FROM public.schema_migrations WHERE version='0010'")).rows[0].c, 1);
    });

    // ------------------------------------------------------------- fixtures
    await db.query(
      `INSERT INTO public.departments (name, description) VALUES ('Org Lab', 'Lab') ON CONFLICT (name) DO NOTHING;
       INSERT INTO public.employees (id, employee_number, full_name, department_id, employment_status, job_title)
       SELECT v.id, v.num, v.name, (SELECT id FROM public.departments WHERE name='Org Lab'), v.status, v.title
       FROM (VALUES
         (9700, 'ORG-MAYA', 'Maya Lim', 'active', 'Team Lead'),
         (9701, 'ORG-BEN',  'Ben Aziz', 'active', 'Engineer'),
         (9702, 'ORG-CARA', 'Cara Tan', 'probation', 'Engineer'),
         (9703, 'ORG-DEV',  'Dev Nair', 'active', 'Analyst'),
         (9704, 'ORG-OMAR', 'Omar Said', 'active', 'Team Lead'),
         (9705, 'ORG-IVY',  'Ivy Wong', 'inactive', 'Engineer')
       ) AS v(id, num, name, status, title);
       INSERT INTO public.users (id, employee_id, email, password_hash, role, is_active) VALUES
         (9790, NULL, 'org-admin@example.invalid', '${UNUSABLE_HASH}', 'admin', TRUE),
         (9791, 9700, 'maya@example.invalid', '${UNUSABLE_HASH}', 'employee', TRUE),
         (9792, 9701, 'ben@example.invalid', '${UNUSABLE_HASH}', 'employee', TRUE),
         (9793, 9702, 'cara@example.invalid', '${UNUSABLE_HASH}', 'employee', TRUE),
         (9794, 9703, 'dev@example.invalid', '${UNUSABLE_HASH}', 'employee', TRUE),
         (9795, 9704, 'omar@example.invalid', '${UNUSABLE_HASH}', 'employee', TRUE);`,
    );

    const admin = lab.sign(9790, "admin", null);
    const maya = lab.sign(9791, "employee", 9700);
    const ben = lab.sign(9792, "employee", 9701);
    const dev = lab.sign(9794, "employee", 9703);
    const omar = lab.sign(9795, "employee", 9704);

    /** Sets a reporting line through the real admin API, as HR would. */
    const assignManager = async (employeeId: number, managerId: number | null) => {
      const current = (await lab.json<{ data: Record<string, unknown> }>("GET", `/employees/${employeeId}`, admin)).body.data;
      return lab.json("PUT", `/employees/${employeeId}`, admin, {
        full_name: current.full_name,
        department_id: Number(current.department_id),
        employment_status: current.employment_status,
        manager_id: managerId,
      });
    };

    // --------------------------------------------------- database guards
    await t.test("the database refuses a self-manager and loops of two and three", async () => {
      // The BEFORE trigger sees the one-person loop first; the CHECK is a
      // second, independent layer that holds even if the trigger were disabled.
      await assert.rejects(
        db.query("UPDATE public.employees SET manager_id = 9701 WHERE id = 9701"),
        { code: "23514", constraint: "employees_manager_cycle" },
      );
      const client = await db.connect();
      try {
        await client.query("BEGIN");
        await client.query("ALTER TABLE public.employees DISABLE TRIGGER prevent_manager_cycle");
        await assert.rejects(
          client.query("UPDATE public.employees SET manager_id = 9701 WHERE id = 9701"),
          { code: "23514", constraint: "employees_manager_not_self" },
        );
      } finally {
        await client.query("ROLLBACK");
        client.release();
      }
      await db.query("UPDATE public.employees SET manager_id = 9700 WHERE id = 9701");
      await assert.rejects(
        db.query("UPDATE public.employees SET manager_id = 9701 WHERE id = 9700"),
        { code: "23514", constraint: "employees_manager_cycle" },
      );
      await db.query("UPDATE public.employees SET manager_id = 9701 WHERE id = 9702");
      await assert.rejects(
        db.query("UPDATE public.employees SET manager_id = 9702 WHERE id = 9700"),
        { code: "23514", constraint: "employees_manager_cycle" },
      );
      await db.query("UPDATE public.employees SET manager_id = NULL WHERE id IN (9701, 9702)");
    });

    // ------------------------------------------------------ admin API
    await t.test("an administrator records reporting lines through the employee API", async () => {
      for (const [employee, manager] of [[9701, 9700], [9702, 9700], [9703, 9704]] as const) {
        const result = await assignManager(employee, manager);
        assert.equal(result.status, 200, result.text);
      }
      // A former employee keeps their history: set directly, as an old record would be.
      await db.query("UPDATE public.employees SET manager_id = 9700 WHERE id = 9705");

      const detail = await lab.json<{ data: { direct_reports: Array<{ id: number }> } }>("GET", "/employees/9700", admin);
      assert.deepEqual(detail.body.data.direct_reports.map((report) => Number(report.id)).sort(), [9701, 9702, 9705]);
      const ben = await lab.json<{ data: { manager_id: number; manager_name: string } }>("GET", "/employees/9701", admin);
      assert.equal(Number(ben.body.data.manager_id), 9700);
      assert.equal(ben.body.data.manager_name, "Maya Lim");
    });

    await t.test("the API explains refused reporting lines instead of failing", async () => {
      const loop = await assignManager(9700, 9701);
      assert.equal(loop.status, 409);
      assert.equal((loop.body as { code: string }).code, "reporting_cycle");

      const self = await assignManager(9701, 9701);
      assert.equal(self.status, 400);
      const inactive = await assignManager(9701, 9705);
      assert.equal(inactive.status, 400);
      assert.match(JSON.stringify(inactive.body), /active or probation/);
      const missing = await assignManager(9701, 999999);
      assert.equal(missing.status, 400);
      // And nothing moved.
      assert.equal(Number((await db.query("SELECT manager_id FROM public.employees WHERE id = 9701")).rows[0].manager_id), 9700);
    });

    await t.test("a reporting-line change is audited as its own event", async () => {
      const events = (await db.query(
        "SELECT entity_id, actor_role, changes FROM public.audit_events WHERE action = 'MANAGER_CHANGED' ORDER BY id",
      )).rows;
      assert.equal(events.length, 3);
      assert.deepEqual(events[0].changes, { manager_id: { before: null, after: 9700 } });
      assert.equal(events[0].actor_role, "admin");
    });

    // ------------------------------------------------------ session scope
    await t.test("manager is derived from reporting lines and reported by /auth/me", async () => {
      assert.equal((await lab.json<{ data: { user: { isManager: boolean } } }>("GET", "/auth/me", maya)).body.data.user.isManager, true);
      assert.equal((await lab.json<{ data: { user: { isManager: boolean } } }>("GET", "/auth/me", ben)).body.data.user.isManager, false);
    });

    await t.test("the team layer is for managers only, and never company-wide", async () => {
      assert.equal((await lab.call("GET", "/team")).status, 401);
      const notManager = await lab.json("GET", "/team", ben);
      assert.equal(notManager.status, 403);
      assert.equal((notManager.body as { code: string }).code, "not_a_manager");
      assert.equal((await lab.call("GET", "/team", admin)).status, 403, "an admin is not a manager by role");
      // A manager has no admin reach at all.
      for (const path of ["/employees", "/employees/9701", "/leaves", "/reports/workforce", "/payroll/periods", "/audit"]) {
        assert.equal((await lab.call("GET", path, maya)).status, 403, path);
      }
    });

    await t.test("a manager's team is exactly their current active and probation reports", async () => {
      const overview = await lab.json<{ data: { members: Array<{ id: number }>; counts: { members: number } } }>("GET", "/team", maya);
      assert.equal(overview.status, 200);
      assert.deepEqual(overview.body.data.members.map((member) => member.id), [9701, 9702]);
      assert.equal((await lab.call("GET", "/team/members/9701", maya)).status, 200);
      assert.equal((await lab.call("GET", "/team/members/9703", maya)).status, 404, "another manager's report");
      assert.equal((await lab.call("GET", "/team/members/9705", maya)).status, 404, "a former report");
      assert.equal((await lab.call("GET", "/team/members/9700", maya)).status, 404, "themselves");
    });

    await t.test("the team layer carries no pay and no location", async () => {
      const today = (await db.query("SELECT (now() AT TIME ZONE 'UTC')::date::text AS d")).rows[0].d;
      await db.query(
        `INSERT INTO public.attendance (employee_id, attendance_date, check_in_time, status, late_minutes,
           verification_method, verification_status, check_in_latitude, check_in_longitude,
           check_in_accuracy_meters, check_in_distance_meters)
         VALUES (9701, $1, '09:12', 'late', 12, 'QR_LOCATION', 'verified', 3.1987654, 101.7123456, 17.25, 43.5)`,
        [today],
      );
      await db.query(
        `INSERT INTO public.employee_compensation (employee_id, basic_salary_sen, allowance_sen, effective_from)
         VALUES (9701, 765432, 11111, '2026-01-01')`,
      );
      for (const path of ["/team", "/team/attendance", "/team/members/9701", "/team/attendance/summary"]) {
        const { status, text } = await lab.json("GET", path, maya);
        assert.equal(status, 200, path);
        for (const forbidden of ["3.1987654", "101.7123456", "17.25", "43.5", "765432", "7654.32", "11111",
          "latitude", "longitude", "accuracy", "distance", "salary", "password", "date_of_birth", "address"]) {
          assert.equal(text.includes(forbidden), false, `${path} leaked ${forbidden}`);
        }
      }
      const day = await lab.json<{ data: { members: Array<{ id: number; day: { status: string; lateMinutes: number } }> } }>(
        "GET", "/team/attendance", maya,
      );
      const benToday = day.body.data.members.find((member) => member.id === 9701)!;
      assert.equal(benToday.day.status, "late");
      assert.equal(benToday.day.lateMinutes, 12);
    });

    // ------------------------------------------------------ leave decisions
    const submit = async (token: string, date: string) => {
      const result = await lab.json<{ data: { leave: { id: number } } }>("POST", "/leaves", token, {
        leaveType: "annual", startDate: date, endDate: date, reason: "Lab leave",
      });
      assert.equal(result.status, 201, result.text);
      return result.body.data.leave.id;
    };
    const decide = (token: string, id: number, status: "approved" | "rejected") =>
      lab.json("PUT", `/leaves/${id}/status`, token, { status, adminComment: "Lab decision" });

    await t.test("a manager decides a direct report's leave, recorded as a manager decision", async () => {
      const id = await submit(ben, weekdayFrom(20));
      const pending = await lab.json<{ data: { leaves: Array<{ id: number; availableDays: number }> } }>("GET", "/team/leave?status=pending", maya);
      const listed = pending.body.data.leaves.find((leave) => leave.id === id)!;
      assert.ok(listed, "the request is in the manager's queue");
      assert.equal(listed.availableDays, 12, "measured against the grant, not against itself");

      const result = await decide(maya, id, "approved");
      assert.equal(result.status, 200, result.text);
      const audit = (await db.query(
        "SELECT actor_role, actor_label FROM public.audit_events WHERE action='LEAVE_APPROVED' AND entity_id=$1",
        [String(id)],
      )).rows[0];
      assert.equal(audit.actor_role, "manager");
      assert.equal(audit.actor_label, "maya@example.invalid");
    });

    await t.test("a manager cannot decide for someone outside their team", async () => {
      const devLeave = await submit(dev, weekdayFrom(21));
      assert.equal((await decide(maya, devLeave, "approved")).status, 404);
      assert.equal((await db.query("SELECT status FROM public.leave_requests WHERE id=$1", [devLeave])).rows[0].status, "pending");
      assert.equal((await decide(omar, devLeave, "rejected")).status, 200, "their own manager can");
    });

    await t.test("nobody decides their own request, and a non-manager decides nothing", async () => {
      const own = await submit(maya, weekdayFrom(22));
      const refused = await decide(maya, own, "approved");
      assert.equal(refused.status, 403);
      assert.equal((refused.body as { code: string }).code, "own_request");
      assert.equal((await decide(ben, own, "approved")).status, 403);
      assert.equal((await decide(admin, own, "approved")).status, 200, "HR decides a manager's own request");
    });

    await t.test("a stale reporting line keeps no access, from the very next request", async () => {
      const staleToken = maya; // minted while Maya managed Ben and Cara
      const benLeave = await submit(ben, weekdayFrom(23));

      assert.equal((await assignManager(9701, 9704)).status, 200);
      // Still a manager (Cara), but Ben is no longer hers.
      assert.equal((await lab.call("GET", "/team/members/9701", staleToken)).status, 404);
      assert.equal((await decide(staleToken, benLeave, "approved")).status, 404);
      assert.equal((await decide(omar, benLeave, "approved")).status, 200, "the new manager can");

      assert.equal((await assignManager(9702, null)).status, 200);
      // No reports left: the scope is gone without any token being reissued.
      assert.equal((await lab.call("GET", "/team", staleToken)).status, 403);
      const caraLeave = await submit(lab.sign(9793, "employee", 9702), weekdayFrom(24));
      assert.equal((await decide(staleToken, caraLeave, "approved")).status, 403);
      assert.equal((await lab.json<{ data: { user: { isManager: boolean } } }>("GET", "/auth/me", staleToken)).body.data.user.isManager, false);
    });

    await t.test("a deactivated manager's session ends, and their reports keep their records", async () => {
      assert.equal((await lab.call("GET", "/team", omar)).status, 200);
      assert.equal((await lab.call("DELETE", "/employees/9704", admin)).status, 200);
      assert.equal((await lab.call("GET", "/team", omar)).status, 401);
      assert.equal(Number((await db.query("SELECT manager_id FROM public.employees WHERE id = 9701")).rows[0].manager_id), 9704);
    });

    await t.test("the protected rows are untouched by everything above", async () => {
      assert.deepEqual(await lab.protectedRows(), protectedBefore);
    });
  });
});
