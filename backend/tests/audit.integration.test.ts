import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { once } from "node:events";
import { test } from "node:test";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import pg from "pg";
import { loadMigrations, runMigrations } from "../src/database/migrations.js";
import { dropLabClones } from "./labClones.js";

// Explicit opt-in; the only permitted host is the isolated, internal Docker lab.
// Every write below happens in a disposable clone, never in the source database.
test("Audit Log V1: migration 0008, event capture, redaction and authorization", {
  skip: process.env.HR_NEXUS_AUDIT_LAB !== "1", timeout: 240_000,
}, async (t) => {
  const suffix = randomBytes(5).toString("hex");
  const host = "hr-nexus-v2-migration-lab";
  const admin = new pg.Pool({ host, user: "postgres", database: "postgres" });
  const database = `hr_nexus_audit_${suffix}`;
  let pool: pg.Pool | undefined;
  let appPool: pg.Pool | undefined;
  let server: ReturnType<import("express").Express["listen"]> | undefined;

  let suiteCompleted = false;
  try {
    await admin.query(`CREATE DATABASE "${database}" TEMPLATE hr_nexus_v2_settings_baseline`);
    pool = new pg.Pool({ host, user: "postgres", database });
    const db = pool;

    const orphansBefore = (await db.query(
      `SELECT id, employee_id FROM public.attendance a
       WHERE NOT EXISTS (SELECT 1 FROM public.employees e WHERE e.id = a.employee_id) ORDER BY id`,
    )).rows;

    const migrations = await loadMigrations();
    const eighth = migrations.find((migration) => migration.version === "0008")!;
    assert.equal(eighth.filename, "0008_audit_events.sql");

    await t.test("0008 applies additively and leaves existing data untouched", async () => {
      // Membership, not position: later migrations will join the chain too.
      assert.ok(
        (await runMigrations(db, { mode: "apply", database })).newlyApplied.includes("0008"),
      );
      assert.deepEqual(
        (await db.query(
          `SELECT id, employee_id FROM public.attendance a
           WHERE NOT EXISTS (SELECT 1 FROM public.employees e WHERE e.id = a.employee_id) ORDER BY id`,
        )).rows,
        orphansBefore,
      );
      assert.equal(
        (await db.query("SELECT to_regclass('public.audit_events') AS name")).rows[0].name,
        "audit_events",
      );
      assert.equal(
        (await db.query("SELECT count(*)::int AS count FROM public.audit_events")).rows[0].count, 0,
      );
    });

    await t.test("repeat apply is a no-op with exactly one 0008 ledger row", async () => {
      assert.deepEqual((await runMigrations(db, { mode: "apply", database })).newlyApplied, []);
      assert.equal((await db.query(
        "SELECT count(*)::integer FROM schema_migrations WHERE version='0008'",
      )).rows[0].count, 1);
    });

    await t.test("the log is append-only, enforced by the database", async () => {
      await db.query(
        `INSERT INTO public.audit_events (actor_label, action, entity_type, entity_id, summary)
         VALUES ('seed@example.invalid','EMPLOYEE_UPDATED','employee','1','Seed row')`,
      );
      const id = (await db.query("SELECT id FROM public.audit_events LIMIT 1")).rows[0].id;

      await assert.rejects(
        () => db.query("UPDATE public.audit_events SET summary = 'tampered' WHERE id = $1", [id]),
        /append-only/,
      );
      await assert.rejects(
        () => db.query("DELETE FROM public.audit_events WHERE id = $1", [id]),
        /append-only/,
      );

      // And the row is exactly as written.
      assert.equal(
        (await db.query("SELECT summary FROM public.audit_events WHERE id = $1", [id])).rows[0].summary,
        "Seed row",
      );
      await db.query("TRUNCATE public.audit_events RESTART IDENTITY").catch(() => {
        // TRUNCATE bypasses row triggers; if it is refused that is fine too.
      });
    });

    await t.test("the database rejects an oversized change set and an unknown outcome", async () => {
      await assert.rejects(
        () => db.query(
          `INSERT INTO public.audit_events (actor_label, action, entity_type, summary, changes)
           VALUES ('a','LOGIN','auth','s', jsonb_build_object('blob', repeat('x', 9000)))`,
        ),
        /audit_changes_bounded/,
      );
      await assert.rejects(
        () => db.query(
          `INSERT INTO public.audit_events (actor_label, action, entity_type, summary, outcome)
           VALUES ('a','LOGIN','auth','s','maybe')`,
        ),
        /audit_outcome_known/,
      );
    });

    // ---------------------------------------------------- authenticated setup

    const password = "AuditLab!2026";
    const passwordHash = await bcrypt.hash(password, 12);

    await db.query(
      `INSERT INTO public.departments (name, description) VALUES ('Audit Dept','Lab')
         ON CONFLICT (name) DO NOTHING;
       INSERT INTO public.employees (id, employee_number, full_name, department_id, employment_status, job_title)
       VALUES (9500, 'AUD-1', 'Aisyah Rahman',
               (SELECT id FROM public.departments WHERE name='Audit Dept'), 'active', 'Engineer');
       UPDATE public.company_settings
         SET timezone='Asia/Kuala_Lumpur', working_days=ARRAY[1,2,3,4,5]::smallint[] WHERE id=1;`,
    );
    await db.query(
      `INSERT INTO public.users (id, employee_id, email, password_hash, role, is_active)
       VALUES (9500, NULL, 'audit-admin@example.invalid', $1, 'admin', TRUE),
              (9501, 9500, 'audit-one@example.invalid', $1, 'employee', TRUE)`,
      [passwordHash],
    );

    process.env.DATABASE_URL = `postgresql://postgres@${host}/${database}`;
    process.env.JWT_SECRET = randomBytes(32).toString("hex");
    const { default: app } = await import("../src/app.js");
    ({ default: appPool } = await import("../src/config/db.js"));
    server = app.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const origin = `http://127.0.0.1:${address.port}/api`;

    const adminToken = jwt.sign({ role: "admin", employeeId: null }, process.env.JWT_SECRET, {
      subject: "9500", expiresIn: "40m",
    });
    const employeeToken = jwt.sign({ role: "employee", employeeId: 9500 }, process.env.JWT_SECRET, {
      subject: "9501", expiresIn: "40m",
    });

    const call = async (
      method: string, endpoint: string, body?: unknown, token: string | null = adminToken,
    ) => fetch(`${origin}${endpoint}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    const eventsFor = async (action: string) => (await db.query(
      "SELECT * FROM public.audit_events WHERE action = $1 ORDER BY id DESC", [action],
    )).rows;

    // ------------------------------------------------------------- capture

    await t.test("a successful sign-in is recorded with its actor", async () => {
      const response = await call("POST", "/auth/login", {
        email: "audit-admin@example.invalid", password,
      }, null);
      assert.equal(response.status, 200);

      const [event] = await eventsFor("LOGIN");
      assert.ok(event, "a LOGIN event must exist");
      assert.equal(event.actor_label, "audit-admin@example.invalid");
      assert.equal(event.actor_user_id, 9500);
      assert.equal(event.actor_role, "admin");
      assert.equal(event.outcome, "success");
      assert.ok(event.occurred_at instanceof Date, "the timestamp comes from the database");
    });

    await t.test("a failed sign-in is recorded without revealing the password", async () => {
      const response = await call("POST", "/auth/login", {
        email: "audit-admin@example.invalid", password: "TotallyWrong!123",
      }, null);
      assert.equal(response.status, 401);

      const [event] = await eventsFor("LOGIN_FAILED");
      assert.ok(event, "a LOGIN_FAILED event must exist");
      assert.equal(event.outcome, "failure");
      assert.equal(event.actor_label, "audit-admin@example.invalid");
      // The attempted password must appear nowhere in the row.
      assert.equal(JSON.stringify(event).includes("TotallyWrong"), false);
    });

    await t.test("an unknown address is recorded as data, not as an account", async () => {
      await call("POST", "/auth/login", {
        email: "nobody@example.invalid", password: "irrelevant",
      }, null);
      const events = await eventsFor("LOGIN_FAILED");
      const unknown = events.find((row) => row.actor_label === "nobody@example.invalid");
      assert.ok(unknown, "the attempted address is recorded");
      assert.equal(unknown.actor_user_id, null, "no account is claimed for an unknown address");
    });

    await t.test("an employee change records a before and after diff", async () => {
      const response = await call("PUT", "/employees/9500", {
        full_name: "Aisyah Binti Rahman",
        email: "audit-one@example.invalid",
        department_id: (await db.query("SELECT id FROM public.departments WHERE name='Audit Dept'")).rows[0].id,
        employment_status: "active",
        job_title: "Senior Engineer",
      });
      assert.equal(response.status, 200, await response.text());

      const [event] = await eventsFor("EMPLOYEE_UPDATED");
      assert.ok(event);
      assert.equal(event.entity_type, "employee");
      assert.equal(event.entity_id, "9500");
      assert.deepEqual(event.changes.full_name, {
        before: "Aisyah Rahman", after: "Aisyah Binti Rahman",
      });
      assert.deepEqual(event.changes.job_title, { before: "Engineer", after: "Senior Engineer" });
      // Fields that did not change are absent rather than recorded as no-ops.
      assert.equal(event.changes.department_id, undefined);
    });

    await t.test("deactivation and reactivation are distinct recorded events", async () => {
      assert.equal((await call("DELETE", "/employees/9500")).status, 200);
      assert.equal((await call("PATCH", "/employees/9500/reactivate")).status, 200);

      const [deactivated] = await eventsFor("EMPLOYEE_DEACTIVATED");
      const [reactivated] = await eventsFor("EMPLOYEE_REACTIVATED");
      assert.deepEqual(deactivated.changes.employment_status, { before: "active", after: "inactive" });
      assert.deepEqual(reactivated.changes.employment_status, { before: "inactive", after: "active" });
    });

    await t.test("department and settings changes are recorded", async () => {
      const created = await (await call("POST", "/departments", {
        name: "Audited Department", description: "Created by the audit suite",
      })).json();
      const [departmentEvent] = await eventsFor("DEPARTMENT_CREATED");
      assert.equal(departmentEvent.entity_id, String(created.data.id));

      const settings = await (await call("GET", "/settings")).json();
      // Only the writable fields: the settings endpoint rejects anything else,
      // which is the mass-assignment guard doing its job.
      const writable = [
        "company_name", "registration_number", "address", "email", "phone", "timezone",
        "working_days", "work_start_time", "work_end_time", "grace_period_minutes",
        "office_latitude", "office_longitude", "attendance_radius_meters", "revision",
      ];
      const payload = Object.fromEntries(
        writable.map((field) => [field, settings.data[field]]),
      );
      const response = await call("PUT", "/settings", {
        ...payload, company_name: "Audited Company",
      });
      assert.equal(response.status, 200, await response.text());

      const [settingsEvent] = await eventsFor("SETTINGS_CHANGED");
      assert.deepEqual(settingsEvent.changes.company_name?.after, "Audited Company");
    });

    await t.test("a rolled-back change leaves no event claiming it happened", async () => {
      const before = (await db.query("SELECT count(*)::int AS count FROM public.audit_events")).rows[0].count;
      // A duplicate department name fails inside the same request.
      assert.equal((await call("POST", "/departments", {
        name: "Audited Department", description: "duplicate",
      })).status, 409);

      const after = (await db.query("SELECT count(*)::int AS count FROM public.audit_events")).rows[0].count;
      assert.equal(after, before, "a refused change must not be audited as a success");
    });

    await t.test("a failing audit write cannot silently discard the change it describes", async () => {
      // The regression this guards: PostgreSQL aborts a transaction on the first
      // error, so an audit insert that fails inside the caller's transaction
      // turns their COMMIT into a rollback. The API answered 200 while the
      // change vanished. The savepoint in recordAudit confines the failure.
      await db.query("ALTER TABLE public.audit_events RENAME TO audit_events_hidden");
      try {
        const response = await call("DELETE", "/employees/9500");
        assert.equal(response.status, 200, "the business action still succeeds");

        // And it actually happened, rather than being rolled back underneath.
        assert.equal(
          (await db.query("SELECT employment_status FROM public.employees WHERE id = 9500")).rows[0]
            .employment_status,
          "inactive",
          "the deactivation must be committed, not silently discarded",
        );
      } finally {
        await db.query("ALTER TABLE public.audit_events_hidden RENAME TO audit_events");
      }

      // Put the fixture back for the checks that follow.
      assert.equal((await call("PATCH", "/employees/9500/reactivate")).status, 200);
    });

    await t.test("no audit row anywhere contains a credential or a coordinate", async () => {
      const rows = (await db.query("SELECT * FROM public.audit_events")).rows;
      assert.ok(rows.length > 5, `only ${rows.length} events captured`);

      const serialized = JSON.stringify(rows);
      for (const forbidden of [
        passwordHash, "$2b$", "AuditLab!2026", "TotallyWrong",
        "password_hash", "latitude", "longitude", "accuracy_meters",
      ]) {
        assert.equal(
          serialized.includes(forbidden), false,
          `"${forbidden}" must never reach the audit log`,
        );
      }
    });

    // ------------------------------------------------------- authorization

    await t.test("only an administrator can read the audit log", async () => {
      assert.equal((await call("GET", "/audit", undefined, null)).status, 401);
      assert.equal((await call("GET", "/audit", undefined, employeeToken)).status, 403);
      assert.equal((await call("GET", "/audit")).status, 200);
    });

    await t.test("a refused read leaks no audit content", async () => {
      const denied = await call("GET", "/audit", undefined, employeeToken);
      const body = await denied.text();
      assert.doesNotMatch(body, /audit-admin@example\.invalid|EMPLOYEE_UPDATED|LOGIN_FAILED/);
    });

    await t.test("there is no endpoint that writes an audit event", async () => {
      for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
        const response = await call(method, "/audit", { action: "LOGIN", summary: "forged" });
        assert.ok(response.status === 404 || response.status === 405,
          `${method} /audit returned ${response.status}`);
      }
    });

    // -------------------------------------------------------------- reading

    await t.test("the log filters by action, entity and outcome", async () => {
      const byAction = await (await call("GET", "/audit?action=LOGIN_FAILED")).json();
      assert.ok(byAction.data.events.length >= 2);
      assert.ok(byAction.data.events.every((row: { action: string }) => row.action === "LOGIN_FAILED"));

      const byOutcome = await (await call("GET", "/audit?outcome=failure")).json();
      assert.ok(byOutcome.data.events.every((row: { outcome: string }) => row.outcome === "failure"));

      const byEntity = await (await call("GET", "/audit?entityType=employee&entityId=9500")).json();
      assert.ok(byEntity.data.events.every(
        (row: { entity_type: string; entity_id: string }) =>
          row.entity_type === "employee" && row.entity_id === "9500",
      ));
    });

    await t.test("an unknown filter value is ignored rather than injected", async () => {
      const response = await call("GET", "/audit?action=DROP%20TABLE&entityType=nonsense");
      assert.equal(response.status, 200);
      assert.equal(
        (await db.query("SELECT to_regclass('public.audit_events') AS name")).rows[0].name,
        "audit_events",
      );
    });

    await t.test("the page size is capped and results are newest first", async () => {
      const body = await (await call("GET", "/audit?pageSize=5000")).json();
      assert.ok(body.data.pageSize <= 100, `page size was ${body.data.pageSize}`);

      const times = body.data.events.map((row: { occurred_at: string }) => Date.parse(row.occurred_at));
      const sorted = [...times].sort((a, b) => b - a);
      assert.deepEqual(times, sorted, "events must be returned newest first");
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

    suiteCompleted = true;
  } finally {
    if (server) await new Promise<void>((resolve) => server!.close(() => resolve()));
    if (appPool) await appPool.end();
    if (pool) await pool.end();
    await dropLabClones(admin, suffix, suiteCompleted, t);
    await admin.end();
  }
});
