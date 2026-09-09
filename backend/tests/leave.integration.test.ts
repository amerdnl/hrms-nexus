import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { once } from "node:events";
import { test } from "node:test";
import jwt from "jsonwebtoken";
import pg from "pg";
import { loadMigrations, runMigrations } from "../src/database/migrations.js";

// Explicit opt-in; the only permitted host is the isolated, internal Docker lab.
// Every write below happens in a disposable clone, never in the source database.
test("Leave balances: migration 0006 and the authenticated leave workflow", {
  skip: process.env.HR_NEXUS_LEAVE_LAB !== "1", timeout: 180_000,
}, async (t) => {
  const suffix = randomBytes(5).toString("hex");
  const host = "hr-nexus-v2-migration-lab";
  const admin = new pg.Pool({ host, user: "postgres", database: "postgres" });
  const database = `hr_nexus_leave_${suffix}`;
  let pool: pg.Pool | undefined;
  let appPool: pg.Pool | undefined;
  let server: ReturnType<import("express").Express["listen"]> | undefined;

  try {
    await admin.query(`CREATE DATABASE "${database}" TEMPLATE hr_nexus_v2_settings_baseline`);
    pool = new pg.Pool({ host, user: "postgres", database });
    const db = pool;

    const orphansBefore = (await db.query(
      `SELECT id, employee_id FROM public.attendance a
       WHERE NOT EXISTS (SELECT 1 FROM public.employees e WHERE e.id = a.employee_id) ORDER BY id`,
    )).rows;

    const migrations = await loadMigrations();
    const sixth = migrations.find((migration) => migration.version === "0006")!;
    assert.equal(sixth.filename, "0006_leave_balances.sql");

    await t.test("0006 applies additively and leaves existing data untouched", async () => {
      // This milestone's own step; later reviewed migrations may follow 0006.
      assert.ok(
        (await runMigrations(db, { mode: "apply", database })).newlyApplied.includes("0006"),
      );

      assert.deepEqual(
        (await db.query(
          `SELECT id, employee_id FROM public.attendance a
           WHERE NOT EXISTS (SELECT 1 FROM public.employees e WHERE e.id = a.employee_id) ORDER BY id`,
        )).rows,
        orphansBefore,
      );

      // No leave row gains balance metadata by being migrated.
      assert.equal((await db.query(
        `SELECT count(*)::integer FROM public.leave_requests
         WHERE working_days IS NOT NULL OR leave_year IS NOT NULL OR cancelled_at IS NOT NULL`,
      )).rows[0].count, 0);

      const tables = (await db.query(
        `SELECT tablename FROM pg_tables WHERE schemaname='public'
           AND tablename LIKE 'leave_%' ORDER BY tablename`,
      )).rows.map((row) => row.tablename);
      assert.deepEqual(tables, ["leave_entitlements", "leave_policies", "leave_requests"]);

      // The widened status set accepts cancellation and still refuses nonsense.
      const definition = (await db.query(
        `SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint
         WHERE conname = 'leave_requests_status_check'`,
      )).rows[0].def;
      assert.match(definition, /cancelled/);
    });

    await t.test("repeat apply is a no-op with exactly one 0006 ledger row", async () => {
      assert.deepEqual((await runMigrations(db, { mode: "apply", database })).newlyApplied, []);
      assert.equal((await db.query(
        "SELECT count(*)::integer FROM schema_migrations WHERE version='0006'",
      )).rows[0].count, 1);
    });

    await t.test("seeded policy is company configuration, not a statutory claim", async () => {
      const policies = (await db.query(
        "SELECT leave_type, default_annual_days, deducts_balance, is_paid FROM leave_policies ORDER BY leave_type",
      )).rows;
      assert.equal(policies.length, 4);

      const unpaid = policies.find((row) => row.leave_type === "unpaid");
      // Unpaid leave never limits by balance and is what payroll deducts against.
      assert.equal(unpaid.deducts_balance, false);
      assert.equal(unpaid.is_paid, false);

      const comment = (await db.query(
        "SELECT obj_description('public.leave_policies'::regclass) AS note",
      )).rows[0].note;
      assert.match(comment, /not statutory entitlements/i);
    });

    await t.test("the database refuses impossible entitlements", async () => {
      const client = await db.connect();
      try {
        await client.query("BEGIN");
        await client.query(
          `INSERT INTO employees (id, employee_number, full_name, employment_status)
           VALUES (9500, 'LEAVE-CHK', 'Constraint Probe', 'active')`,
        );
        for (const sql of [
          "INSERT INTO leave_entitlements (employee_id, leave_year, leave_type, entitled_days) VALUES (9500, 2026, 'annual', -1)",
          "INSERT INTO leave_entitlements (employee_id, leave_year, leave_type, entitled_days) VALUES (9500, 2026, 'annual', 400)",
          "INSERT INTO leave_entitlements (employee_id, leave_year, leave_type, entitled_days, adjustment_days) VALUES (9500, 2026, 'annual', 1, -5)",
          "INSERT INTO leave_entitlements (employee_id, leave_year, leave_type) VALUES (9500, 1800, 'annual')",
        ]) {
          await client.query("SAVEPOINT probe");
          await assert.rejects(client.query(sql), { code: "23514" }, sql);
          await client.query("ROLLBACK TO SAVEPOINT probe");
        }
        // An unknown leave type is refused by the policy foreign key.
        await client.query("SAVEPOINT probe");
        await assert.rejects(
          client.query("INSERT INTO leave_entitlements (employee_id, leave_year, leave_type) VALUES (9500, 2026, 'sabbatical')"),
          (error: { code?: string }) => ["23503", "23514"].includes(error.code ?? ""),
        );
        await client.query("ROLLBACK TO SAVEPOINT probe");

        // One grant per employee, year and type.
        await client.query("INSERT INTO leave_entitlements (employee_id, leave_year, leave_type) VALUES (9500, 2026, 'annual')");
        await assert.rejects(
          client.query("INSERT INTO leave_entitlements (employee_id, leave_year, leave_type) VALUES (9500, 2026, 'annual')"),
          { code: "23505" },
        );
      } finally {
        await client.query("ROLLBACK");
        client.release();
      }
    });

    // ---------------------------------------------------- authenticated setup

    await db.query(
      `INSERT INTO public.departments (name, description) VALUES ('Engineering','Lab')
         ON CONFLICT (name) DO NOTHING;
       INSERT INTO public.employees (id, employee_number, full_name, department_id, employment_status)
       VALUES (9600, 'LV-1', 'Aisyah Rahman',
               (SELECT id FROM public.departments WHERE name='Engineering'), 'active'),
              (9601, 'LV-2', 'Daniel Tan',
               (SELECT id FROM public.departments WHERE name='Engineering'), 'active');
       INSERT INTO public.users (id, employee_id, email, password_hash, role, is_active)
       VALUES (9600, NULL, 'leave-admin@example.invalid', 'unusable-lab-hash', 'admin', TRUE),
              (9601, 9600, 'leave-one@example.invalid', 'unusable-lab-hash', 'employee', TRUE),
              (9602, 9601, 'leave-two@example.invalid', 'unusable-lab-hash', 'employee', TRUE);
       UPDATE public.company_settings
         SET timezone='Asia/Kuala_Lumpur', working_days=ARRAY[1,2,3,4,5]::smallint[] WHERE id=1;`,
    );

    process.env.DATABASE_URL = `postgresql://postgres@${host}/${database}`;
    process.env.JWT_SECRET = randomBytes(32).toString("hex");
    const { default: app } = await import("../src/app.js");
    ({ default: appPool } = await import("../src/config/db.js"));
    server = app.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const base = `http://127.0.0.1:${address.port}/api/leaves`;

    const adminToken = jwt.sign({ role: "admin", employeeId: null }, process.env.JWT_SECRET, {
      subject: "9600", expiresIn: "30m",
    });
    const employeeToken = jwt.sign({ role: "employee", employeeId: 9600 }, process.env.JWT_SECRET, {
      subject: "9601", expiresIn: "30m",
    });
    const otherToken = jwt.sign({ role: "employee", employeeId: 9601 }, process.env.JWT_SECRET, {
      subject: "9602", expiresIn: "30m",
    });

    const call = async (method: string, endpoint: string, body?: unknown, token: string | null = employeeToken) => {
      const response = await fetch(`${base}${endpoint}`, {
        method,
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      const text = await response.text();
      return { status: response.status, body: text ? JSON.parse(text) : {} };
    };

    // A year far enough ahead that every date is in the future and cancellable.
    const YEAR = new Date().getUTCFullYear() + 1;

    // Ranges are derived from real weekdays rather than hard-coded, so the suite
    // does not silently change meaning when the calendar shifts year to year.
    const iso = (date: Date) => date.toISOString().slice(0, 10);
    const addDays = (dateIso: string, days: number) => {
      const date = new Date(`${dateIso}T00:00:00Z`);
      date.setUTCDate(date.getUTCDate() + days);
      return iso(date);
    };
    const mondayOnOrAfter = (dateIso: string) => {
      const date = new Date(`${dateIso}T00:00:00Z`);
      while (date.getUTCDay() !== 1) date.setUTCDate(date.getUTCDate() + 1);
      return iso(date);
    };
    /** Monday of the Nth distinct week starting from March of the test year. */
    const week = (index: number) => addDays(mondayOnOrAfter(`${YEAR}-03-02`), index * 7);
    const clearLeave = () => db.query("DELETE FROM public.leave_requests WHERE employee_id IN (9600, 9601)");
    const apply = (start: string, end: string, leaveType = "annual", token = employeeToken) =>
      call("POST", "", { leaveType, startDate: start, endDate: end, reason: "Lab request" }, token);

    await t.test("a new employee sees the company default grant, not zeros", async () => {
      const result = await call("GET", `/me/balances?year=${YEAR}`);
      assert.equal(result.status, 200, JSON.stringify(result.body));
      const annual = result.body.data.balances.find((b: { leaveType: string }) => b.leaveType === "annual");
      assert.equal(annual.entitledDays, 12);
      assert.equal(annual.usedDays, 0);
      assert.equal(annual.remainingDays, 12);

      const unpaid = result.body.data.balances.find((b: { leaveType: string }) => b.leaveType === "unpaid");
      assert.equal(unpaid.deductsBalance, false);
    });

    await t.test("duration uses the configured working week, not calendar days", async () => {
      await clearLeave();
      // Monday to Sunday: five working days on a Mon-Fri week.
      const monday = week(0);
      const sunday = addDays(monday, 6);
      const created = await apply(monday, sunday);
      assert.equal(created.status, 201, JSON.stringify(created.body));
      assert.equal(Number(created.body.data.leave.working_days), 5);
      assert.equal(created.body.data.leave.leave_year, YEAR);

      // Switch the company to a six-day week and the same range costs more.
      await clearLeave();
      await db.query("UPDATE company_settings SET working_days=ARRAY[1,2,3,4,5,6]::smallint[] WHERE id=1");
      const sixDay = await apply(monday, sunday);
      assert.equal(Number(sixDay.body.data.leave.working_days), 6);
      await db.query("UPDATE company_settings SET working_days=ARRAY[1,2,3,4,5]::smallint[] WHERE id=1");
      await clearLeave();
    });

    await t.test("a weekend-only request is refused as having no working days", async () => {
      await clearLeave();
      const weekend = await apply(addDays(week(0), 5), addDays(week(0), 6));
      assert.equal(weekend.status, 400);
      assert.equal(weekend.body.code, "no_working_days");
      assert.equal((await db.query("SELECT count(*)::integer FROM leave_requests WHERE employee_id=9600")).rows[0].count, 0);
    });

    await t.test("a request spanning two leave years is refused", async () => {
      const crossing = await apply(`${YEAR}-12-28`, `${YEAR + 1}-01-05`);
      assert.equal(crossing.status, 400);
      assert.match(JSON.stringify(crossing.body.errors), /two leave years/i);
    });

    await t.test("overlapping requests are refused, including against a pending one", async () => {
      await clearLeave();
      const base = week(4);
      assert.equal((await apply(base, addDays(base, 2))).status, 201);

      for (const [start, end] of [
        [base, addDays(base, 2)],
        [addDays(base, 2), addDays(base, 4)],
        [addDays(base, -3), addDays(base, 1)],
        [addDays(base, 1), addDays(base, 1)],
      ]) {
        const clash = await apply(start!, end!);
        assert.equal(clash.status, 409, `${start}..${end}`);
        assert.equal(clash.body.code, "overlap");
      }

      // A range that merely touches the edges without overlapping is fine.
      assert.equal((await apply(addDays(base, 3), addDays(base, 4))).status, 201);
      // Another employee's dates are irrelevant.
      assert.equal((await apply(base, addDays(base, 2), "annual", otherToken)).status, 201);
      await clearLeave();
    });

    await t.test("insufficient balance is refused, counting pending requests", async () => {
      await clearLeave();
      // 12 annual days: take 8, leaving 4 pending-adjusted.
      const eightDays = week(8);
      assert.equal((await apply(eightDays, addDays(eightDays, 9))).status, 201);

      const balances = (await call("GET", `/me/balances?year=${YEAR}`)).body.data.balances;
      const annual = balances.find((b: { leaveType: string }) => b.leaveType === "annual");
      assert.equal(annual.pendingDays, 8);
      // Pending is not deducted from remaining, but is withheld from availability.
      assert.equal(annual.remainingDays, 12);
      assert.equal(annual.availableDays, 4);

      const tooMuch = await apply(week(12), addDays(week(12), 4));
      assert.equal(tooMuch.status, 409);
      assert.equal(tooMuch.body.code, "insufficient_balance");
      assert.match(tooMuch.body.message, /already awaiting a decision/);

      // Unpaid leave has no balance to exceed.
      assert.equal((await apply(week(12), addDays(week(12), 4), "unpaid")).status, 201);
      await clearLeave();
    });

    await t.test("approval deducts once and cannot be repeated", async () => {
      await clearLeave();
      const created = await apply(week(16), addDays(week(16), 2));
      const leaveId = created.body.data.leave.id;

      const approved = await call("PUT", `/${leaveId}/status`, { status: "approved" }, adminToken);
      assert.equal(approved.status, 200);

      let annual = (await call("GET", `/me/balances?year=${YEAR}`)).body.data.balances
        .find((b: { leaveType: string }) => b.leaveType === "annual");
      assert.equal(annual.usedDays, 3);
      assert.equal(annual.remainingDays, 9);

      // Approving again must not deduct a second time.
      const again = await call("PUT", `/${leaveId}/status`, { status: "approved" }, adminToken);
      assert.equal(again.status, 409);
      assert.equal(again.body.code, "already_decided");

      annual = (await call("GET", `/me/balances?year=${YEAR}`)).body.data.balances
        .find((b: { leaveType: string }) => b.leaveType === "annual");
      assert.equal(annual.usedDays, 3, "a repeated approval must not double-deduct");

      // A decided request cannot be flipped to rejected either.
      assert.equal((await call("PUT", `/${leaveId}/status`, { status: "rejected" }, adminToken)).status, 409);
    });

    await t.test("two simultaneous approvals decide the request exactly once", async () => {
      await clearLeave();
      const created = await apply(week(18), addDays(week(18), 2));
      const leaveId = created.body.data.leave.id;

      const [first, second] = await Promise.all([
        call("PUT", `/${leaveId}/status`, { status: "approved" }, adminToken),
        call("PUT", `/${leaveId}/status`, { status: "approved" }, adminToken),
      ]);
      assert.deepEqual([first.status, second.status].sort(), [200, 409]);

      const annual = (await call("GET", `/me/balances?year=${YEAR}`)).body.data.balances
        .find((b: { leaveType: string }) => b.leaveType === "annual");
      assert.equal(annual.usedDays, 3);
    });

    await t.test("rejection consumes nothing and frees the dates", async () => {
      await clearLeave();
      const rejectRange = week(20);
      const created = await apply(rejectRange, addDays(rejectRange, 4));
      const leaveId = created.body.data.leave.id;
      assert.equal((await call("PUT", `/${leaveId}/status`, { status: "rejected", adminComment: "Peak period" }, adminToken)).status, 200);

      const annual = (await call("GET", `/me/balances?year=${YEAR}`)).body.data.balances
        .find((b: { leaveType: string }) => b.leaveType === "annual");
      assert.equal(annual.usedDays, 0);
      assert.equal(annual.pendingDays, 0);
      assert.equal(annual.remainingDays, 12);

      // The same dates can now be requested again.
      assert.equal((await apply(rejectRange, addDays(rejectRange, 4))).status, 201);
      await clearLeave();
    });

    await t.test("cancellation releases days and keeps the record", async () => {
      await clearLeave();
      const created = await apply(week(24), addDays(week(24), 4));
      const leaveId = created.body.data.leave.id;
      assert.equal((await call("PUT", `/${leaveId}/status`, { status: "approved" }, adminToken)).status, 200);

      let annual = (await call("GET", `/me/balances?year=${YEAR}`)).body.data.balances
        .find((b: { leaveType: string }) => b.leaveType === "annual");
      assert.equal(annual.usedDays, 5);

      const cancelled = await call("POST", `/${leaveId}/cancel`, {});
      assert.equal(cancelled.status, 200, JSON.stringify(cancelled.body));

      annual = (await call("GET", `/me/balances?year=${YEAR}`)).body.data.balances
        .find((b: { leaveType: string }) => b.leaveType === "annual");
      assert.equal(annual.usedDays, 0, "cancelling must return the days");

      // The row survives, marked, rather than being deleted.
      const row = (await db.query("SELECT status, cancelled_at, cancelled_by FROM leave_requests WHERE id=$1", [leaveId])).rows[0];
      assert.equal(row.status, "cancelled");
      assert.ok(row.cancelled_at);
      assert.equal(row.cancelled_by, 9601);

      assert.equal((await call("POST", `/${leaveId}/cancel`, {})).status, 409);
    });

    await t.test("an employee cannot cancel someone else's leave", async () => {
      await clearLeave();
      const created = await apply(week(28), addDays(week(28), 1));
      const leaveId = created.body.data.leave.id;

      // Reported as not found rather than forbidden, so the request's existence
      // is not confirmed to a stranger.
      assert.equal((await call("POST", `/${leaveId}/cancel`, {}, otherToken)).status, 404);
      // An administrator may cancel on the employee's behalf.
      assert.equal((await call("POST", `/${leaveId}/cancel`, {}, adminToken)).status, 200);
    });

    await t.test("leave that has already started cannot be cancelled", async () => {
      await clearLeave();
      await db.query(
        `INSERT INTO leave_requests (employee_id, leave_type, start_date, end_date, reason,
                                     status, working_days, leave_year)
         VALUES (9600, 'annual', CURRENT_DATE - 2, CURRENT_DATE + 2, 'Started', 'approved', 3, $1)`,
        [new Date().getUTCFullYear()],
      );
      const started = (await db.query("SELECT id FROM leave_requests WHERE employee_id=9600")).rows[0];
      const refused = await call("POST", `/${started.id}/cancel`, {});
      assert.equal(refused.status, 409);
      assert.equal(refused.body.code, "already_started");
      await clearLeave();
    });

    await t.test("unpaid leave is reported for payroll without touching a balance", async () => {
      await clearLeave();
      const unpaidStart = week(32);
      const created = await apply(unpaidStart, addDays(unpaidStart, 4), "unpaid");
      const leaveId = created.body.data.leave.id;
      assert.equal((await call("PUT", `/${leaveId}/status`, { status: "approved" }, adminToken)).status, 200);

      const unpaid = (await call("GET", `/me/balances?year=${YEAR}`)).body.data.balances
        .find((b: { leaveType: string }) => b.leaveType === "unpaid");
      assert.equal(unpaid.entitledDays, 0);
      assert.equal(unpaid.usedDays, 5);
      // Availability is meaningless for a type that does not deduct.
      assert.equal(unpaid.deductsBalance, false);

      const summary = await call(
        "GET", `/employees/9600/unpaid?startDate=${unpaidStart}&endDate=${addDays(unpaidStart, 6)}`,
        undefined, adminToken,
      );
      assert.equal(summary.status, 200);
      assert.equal(summary.body.data.unpaidLeaveDays, 5);

      // Paid leave must never appear in the unpaid figure.
      const paidWindow = await call(
        "GET", `/employees/9600/unpaid?startDate=${week(16)}&endDate=${addDays(week(16), 6)}`,
        undefined, adminToken,
      );
      assert.equal(paidWindow.body.data.unpaidLeaveDays, 0);
      await clearLeave();
    });

    await t.test("an administrator can set entitlements and change policy", async () => {
      const set = await call("PUT", "/employees/9600/entitlements", {
        leaveYear: YEAR, leaveType: "annual", entitledDays: 20,
        carriedForwardDays: 3, adjustmentDays: -1, note: "Negotiated",
      }, adminToken);
      assert.equal(set.status, 200, JSON.stringify(set.body));

      const view = await call("GET", `/employees/9600/balances?year=${YEAR}`, undefined, adminToken);
      const annual = view.body.data.balances.find((b: { leaveType: string }) => b.leaveType === "annual");
      assert.equal(annual.entitledDays, 22);

      // A grant can never be driven negative.
      const negative = await call("PUT", "/employees/9600/entitlements", {
        leaveYear: YEAR, leaveType: "annual", entitledDays: 1, adjustmentDays: -5,
      }, adminToken);
      assert.equal(negative.status, 400);

      const policy = await call("PUT", "/policies/annual", { defaultAnnualDays: 15 }, adminToken);
      assert.equal(policy.status, 200);
      // Changing the default must not restate a grant already issued.
      const after = await call("GET", `/employees/9600/balances?year=${YEAR}`, undefined, adminToken);
      assert.equal(after.body.data.balances.find((b: { leaveType: string }) => b.leaveType === "annual").entitledDays, 22);

      await call("PUT", "/policies/annual", { defaultAnnualDays: 12 }, adminToken);
      await call("PUT", "/employees/9600/entitlements", {
        leaveYear: YEAR, leaveType: "annual", entitledDays: 12,
      }, adminToken);
    });

    await t.test("leave endpoints enforce their roles", async () => {
      const cases: Array<[string, string, string | null, number]> = [
        ["GET", "/me/balances", null, 401],
        ["GET", "/me/balances", adminToken, 403],
        ["GET", "/policies", employeeToken, 403],
        ["PUT", "/policies/annual", employeeToken, 403],
        ["GET", "/employees/9600/balances", employeeToken, 403],
        ["PUT", "/employees/9600/entitlements", employeeToken, 403],
        ["GET", "/employees/9600/unpaid", employeeToken, 403],
        ["GET", "", employeeToken, 403],
        ["POST", "", adminToken, 403],
      ];
      for (const [method, endpoint, token, expected] of cases) {
        const result = await call(method, endpoint, method === "POST" || method === "PUT" ? {} : undefined, token);
        assert.equal(result.status, expected, `${method} ${endpoint}`);
      }
    });

    await t.test("the protected orphan attendance rows are untouched by the whole suite", async () => {
      assert.deepEqual(
        (await db.query(
          `SELECT id, employee_id FROM public.attendance a
           WHERE NOT EXISTS (SELECT 1 FROM public.employees e WHERE e.id = a.employee_id) ORDER BY id`,
        )).rows,
        orphansBefore,
      );
    });
  } finally {
    if (server) await new Promise<void>((resolve) => server!.close(() => resolve()));
    if (appPool) await appPool.end();
    if (pool) await pool.end();
    await admin.end();
  }
});
