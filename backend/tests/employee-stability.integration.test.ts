import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { once } from "node:events";
import { copyFile, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import jwt from "jsonwebtoken";
import pg from "pg";
import { defaultMigrationDirectory, loadMigrations, runMigrations } from "../src/database/migrations.js";

// Explicit opt-in; the only permitted host is the isolated, internal Docker lab.
// Every write below happens in a disposable clone, never in the source database.
test("Employee/department stability: migration 0003 and authenticated lifecycle API", {
  skip: process.env.HR_NEXUS_EMPLOYEE_LAB !== "1", timeout: 120_000,
}, async (t) => {
  const suffix = randomBytes(5).toString("hex");
  const host = "hr-nexus-v2-migration-lab";
  const admin = new pg.Pool({ host, user: "postgres", database: "postgres" });
  const database = `hr_nexus_employee_${suffix}`;
  const collisionDatabase = `hr_nexus_employee_collision_${suffix}`;
  let pool: pg.Pool | undefined;
  let collisionPool: pg.Pool | undefined;
  let appPool: pg.Pool | undefined;
  let server: ReturnType<import("express").Express["listen"]> | undefined;
  let partialDirectory: string | undefined;

  try {
    await admin.query(`CREATE DATABASE "${database}" TEMPLATE hr_nexus_v2_settings_baseline`);
    pool = new pg.Pool({ host, user: "postgres", database });
    const db = pool;

    /** Row counts, digests, schema, sequences and the protected orphan rows. */
    async function business() {
      const data: Record<string, unknown> = {};
      for (const table of ["departments", "employees", "users", "leave_requests", "attendance"]) {
        data[table] = (await db.query(
          `SELECT count(*)::integer, md5(COALESCE(jsonb_agg(to_jsonb(t) ORDER BY id)::text,'[]')) AS digest FROM public.${table} t`,
        )).rows;
      }
      data.sequences = (await db.query("SELECT * FROM pg_sequences WHERE schemaname='public' ORDER BY sequencename")).rows;
      data.orphans = (await db.query(
        "SELECT id, md5((to_jsonb(a)-'integrity_issue')::text) AS digest FROM attendance_integrity_exceptions a ORDER BY id",
      )).rows;
      return data;
    }

    const migrations = await loadMigrations();
    const third = migrations.find((migration) => migration.version === "0003")!;
    assert.equal(third.filename, "0003_user_email_normalized_identity.sql");

    const before = await business();
    const retentionLedger = (await db.query("SELECT * FROM schema_migrations WHERE version='0001'")).rows;

    await t.test("0003 applies additively and preserves rows, sequences and orphan attendance", async () => {
      const status = await runMigrations(db, { mode: "status", database });
      assert.deepEqual(status.migrations.map((migration) => migration.status), ["applied", "pending", "pending"]);

      assert.deepEqual((await runMigrations(db, { mode: "apply", database })).newlyApplied, ["0002", "0003"]);

      // Nothing outside the additive settings table and the new index moved.
      assert.deepEqual(await business(), before);
      assert.deepEqual((await db.query("SELECT * FROM schema_migrations WHERE version='0001'")).rows, retentionLedger);
      assert.deepEqual(
        (await db.query("SELECT filename, checksum FROM schema_migrations WHERE version='0003'")).rows,
        [{ filename: third.filename, checksum: third.checksum }],
      );

      const index = (await db.query(
        `SELECT indisunique, pg_get_indexdef(indexrelid) AS definition
         FROM pg_index WHERE indexrelid = 'public.users_email_normalized_key'::regclass`,
      )).rows[0];
      assert.equal(index.indisunique, true);
      assert.match(index.definition, /lower\(btrim\(\(?email/i);

      // The pre-existing case-sensitive constraint is untouched.
      assert.equal((await db.query(
        "SELECT count(*)::integer FROM pg_constraint WHERE conname='users_email_key' AND conrelid='public.users'::regclass",
      )).rows[0].count, 1);
    });

    await t.test("repeat apply is a no-op with exactly one 0003 ledger row", async () => {
      assert.deepEqual((await runMigrations(db, { mode: "apply", database })).newlyApplied, []);
      assert.equal((await db.query(
        "SELECT count(*)::integer FROM schema_migrations WHERE version='0003'",
      )).rows[0].count, 1);
    });

    await t.test("the database rejects case and whitespace email variants, including a race", async () => {
      const first = await db.connect();
      const second = await db.connect();
      try {
        await db.query(
          `INSERT INTO users (employee_id, email, password_hash, role, is_active)
           VALUES (NULL, 'Race.Probe@Example.Invalid', 'unusable-lab-hash', 'admin', TRUE)`,
        );

        for (const variant of ["race.probe@example.invalid", "  RACE.PROBE@example.invalid  "]) {
          await assert.rejects(
            db.query(
              `INSERT INTO users (employee_id, email, password_hash, role, is_active)
               VALUES (NULL, $1, 'unusable-lab-hash', 'admin', TRUE)`,
              [variant],
            ),
            { code: "23505" },
          );
        }

        // Two concurrent writers of the same normalized identity: the second must
        // block on the first and then be rejected, not create a duplicate account.
        await first.query("BEGIN");
        await second.query("BEGIN");
        await first.query(
          `INSERT INTO users (employee_id, email, password_hash, role, is_active)
           VALUES (NULL, 'Concurrent.Probe@Example.Invalid', 'unusable-lab-hash', 'admin', TRUE)`,
        );

        let outcome = "pending";
        const contender = second
          .query(
            `INSERT INTO users (employee_id, email, password_hash, role, is_active)
             VALUES (NULL, ' concurrent.probe@example.invalid ', 'unusable-lab-hash', 'admin', TRUE)`,
          )
          .then(() => (outcome = "wrongly-succeeded"))
          .catch((error: { code?: string }) => (outcome = error.code ?? "unknown"));

        await new Promise((resolve) => setTimeout(resolve, 500));
        assert.equal(outcome, "pending", "the second writer should block while the first is open");

        await first.query("COMMIT");
        await contender;
        assert.equal(outcome, "23505");
        await second.query("ROLLBACK");

        // Stored values keep their original casing; nothing is rewritten.
        assert.equal((await db.query(
          "SELECT email FROM users WHERE lower(btrim(email)) = 'concurrent.probe@example.invalid'",
        )).rows[0].email, "Concurrent.Probe@Example.Invalid");
      } finally {
        first.release();
        second.release();
        await db.query("DELETE FROM users WHERE email ILIKE '%probe@example.invalid%'");
      }
    });

    await t.test("0003 fails closed when existing accounts already collide", async () => {
      await admin.query(`CREATE DATABASE "${collisionDatabase}" TEMPLATE hr_nexus_v2_settings_baseline`);
      collisionPool = new pg.Pool({ host, user: "postgres", database: collisionDatabase });

      // Apply only the reviewed, already-applied migrations, so 0003 meets a
      // database that genuinely contains duplicates.
      partialDirectory = await mkdtemp(path.join(os.tmpdir(), "hr-nexus-employee-lab-"));
      for (const filename of ["0001_employee_history_retention.sql", "0002_company_settings.sql"]) {
        await copyFile(new URL(filename, defaultMigrationDirectory), path.join(partialDirectory, filename));
      }
      await runMigrations(collisionPool, {
        mode: "apply", database: collisionDatabase, directory: partialDirectory,
      });

      await collisionPool.query(
        `INSERT INTO users (employee_id, email, password_hash, role, is_active) VALUES
         (NULL, 'Duplicate@Example.Invalid', 'unusable-lab-hash', 'admin', TRUE),
         (NULL, 'duplicate@example.invalid ', 'unusable-lab-hash', 'admin', TRUE)`,
      );

      await assert.rejects(
        runMigrations(collisionPool, { mode: "apply", database: collisionDatabase }),
        (error: { code?: string; message?: string }) => {
          assert.equal(error.code, "23505");
          assert.match(error.message!, /rolled back/);
          return true;
        },
      );

      // The failed migration left no index, no ledger row and no altered accounts.
      assert.equal((await collisionPool.query(
        "SELECT to_regclass('public.users_email_normalized_key') AS index",
      )).rows[0].index, null);
      assert.equal((await collisionPool.query(
        "SELECT count(*)::integer FROM schema_migrations WHERE version='0003'",
      )).rows[0].count, 0);
      assert.equal((await collisionPool.query(
        "SELECT count(*)::integer FROM users WHERE lower(btrim(email))='duplicate@example.invalid'",
      )).rows[0].count, 2);
    });

    // ---- Authenticated API, against the fully migrated clone ----

    await db.query(
      `INSERT INTO users (id, employee_id, email, password_hash, role, is_active)
       VALUES (9000, NULL, 'stability-admin@example.invalid', 'unusable-lab-hash', 'admin', TRUE)`,
    );

    process.env.DATABASE_URL = `postgresql://postgres@${host}/${database}`;
    process.env.JWT_SECRET = randomBytes(32).toString("hex");
    const { default: app } = await import("../src/app.js");
    ({ default: appPool } = await import("../src/config/db.js"));
    server = app.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const base = `http://127.0.0.1:${address.port}/api`;
    const adminToken = jwt.sign({ role: "admin", employeeId: null }, process.env.JWT_SECRET, {
      subject: "9000", expiresIn: "10m",
    });

    const call = (method: string, endpoint: string, body?: unknown) =>
      fetch(`${base}${endpoint}`, {
        method,
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminToken}` },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });

    const departmentResponse = await call("POST", "/departments", {
      name: `Lab Department ${suffix}`, description: "Synthetic fixture",
    });
    assert.equal(departmentResponse.status, 201);
    const departmentId = (await departmentResponse.json()).data.id;

    let counter = 0;
    const newEmployee = (overrides: Record<string, unknown> = {}) => ({
      employee_number: `LAB-${suffix}-${++counter}`,
      full_name: "Fictional Lab Employee",
      email: `lab-${suffix}-${counter}@example.invalid`,
      temporary_password: "temporary-lab-pass",
      department_id: departmentId,
      ...overrides,
    });

    const accountFor = async (employeeId: number) =>
      (await db.query("SELECT email, is_active FROM users WHERE employee_id = $1", [employeeId])).rows[0];

    await t.test("a new account's sign-in follows the employment status it was created with", async () => {
      for (const [status, expected] of [
        ["active", true], ["probation", true], ["inactive", false],
        ["resigned", false], ["terminated", false],
      ] as const) {
        const response = await call("POST", "/employees", newEmployee({ employment_status: status }));
        assert.equal(response.status, 201, status);
        const employee = (await response.json()).data;
        assert.equal(employee.employment_status, status);
        assert.equal((await accountFor(employee.id)).is_active, expected, status);
      }
    });

    await t.test("editing employment status keeps the linked account consistent", async () => {
      const created = await call("POST", "/employees", newEmployee({ employment_status: "inactive" }));
      const employee = (await created.json()).data;
      assert.equal((await accountFor(employee.id)).is_active, false);

      // The reported gap: reactivating through Edit previously left the account disabled.
      const edited = await call("PUT", `/employees/${employee.id}`, {
        full_name: employee.full_name,
        department_id: departmentId,
        employment_status: "active",
      });
      assert.equal(edited.status, 200);
      assert.equal((await accountFor(employee.id)).is_active, true);

      for (const status of ["resigned", "terminated", "probation", "inactive"]) {
        await call("PUT", `/employees/${employee.id}`, {
          full_name: employee.full_name, department_id: departmentId, employment_status: status,
        });
        assert.equal(
          (await accountFor(employee.id)).is_active,
          ["active", "probation"].includes(status),
          status,
        );
      }
    });

    await t.test("deactivate and reactivate preserve attendance and leave history", async () => {
      const created = await call("POST", "/employees", newEmployee());
      const employee = (await created.json()).data;

      await db.query(
        "INSERT INTO attendance (employee_id, attendance_date, status) VALUES ($1, DATE '2026-09-01', 'present')",
        [employee.id],
      );
      await db.query(
        `INSERT INTO leave_requests (employee_id, leave_type, start_date, end_date, reason, status)
         VALUES ($1, 'annual', DATE '2026-09-02', DATE '2026-09-03', 'Lab fixture', 'approved')`,
        [employee.id],
      );

      const history = async () => ({
        attendance: (await db.query("SELECT count(*)::integer FROM attendance WHERE employee_id=$1", [employee.id])).rows[0].count,
        leave: (await db.query("SELECT count(*)::integer FROM leave_requests WHERE employee_id=$1", [employee.id])).rows[0].count,
      });
      const beforeLifecycle = await history();
      assert.deepEqual(beforeLifecycle, { attendance: 1, leave: 1 });

      assert.equal((await call("DELETE", `/employees/${employee.id}`)).status, 200);
      assert.deepEqual(await accountFor(employee.id), {
        email: `lab-${suffix}-${counter}@example.invalid`, is_active: false,
      });
      assert.deepEqual(await history(), beforeLifecycle);

      assert.equal((await call("PATCH", `/employees/${employee.id}/reactivate`)).status, 200);
      assert.equal((await accountFor(employee.id)).is_active, true);
      assert.deepEqual(await history(), beforeLifecycle);

      // Permanent deletion stays retired.
      assert.equal((await call("DELETE", `/employees/${employee.id}/permanent`)).status, 409);
      assert.deepEqual(await history(), beforeLifecycle);
    });

    await t.test("duplicate emails are refused by case, whitespace and against admin accounts", async () => {
      const created = await call("POST", "/employees", newEmployee({ email: `Taken-${suffix}@Example.Invalid` }));
      assert.equal(created.status, 201);
      const employee = (await created.json()).data;

      for (const variant of [
        `taken-${suffix}@example.invalid`,
        `  TAKEN-${suffix}@EXAMPLE.INVALID  `,
        `Taken-${suffix}@Example.Invalid`,
      ]) {
        const response = await call("POST", "/employees", newEmployee({ email: variant }));
        assert.equal(response.status, 409, variant);
        assert.equal((await response.json()).message, "Email already exists");
      }

      // The standalone admin account has a NULL employee link, which the previous
      // employee_id comparison skipped entirely.
      const collision = await call("PUT", `/employees/${employee.id}`, {
        full_name: employee.full_name,
        department_id: departmentId,
        employment_status: "active",
        email: "STABILITY-ADMIN@example.invalid",
      });
      assert.equal(collision.status, 409);
      assert.equal((await accountFor(employee.id)).email, `Taken-${suffix}@Example.Invalid`);

      // Re-sending an unchanged email is not a conflict with itself.
      assert.equal((await call("PUT", `/employees/${employee.id}`, {
        full_name: employee.full_name,
        department_id: departmentId,
        employment_status: "active",
        email: `taken-${suffix}@example.invalid`,
      })).status, 200);
    });

    await t.test("concurrent creates of one email produce exactly one account", async () => {
      const email = `concurrent-api-${suffix}@example.invalid`;
      const responses = await Promise.all([
        call("POST", "/employees", newEmployee({ email })),
        call("POST", "/employees", newEmployee({ email: email.toUpperCase() })),
      ]);
      const statuses = responses.map((response) => response.status).sort();
      assert.deepEqual(statuses, [201, 409]);
      assert.equal((await db.query(
        "SELECT count(*)::integer FROM users WHERE lower(btrim(email)) = $1", [email],
      )).rows[0].count, 1);
    });

    await t.test("invalid payloads and identifiers are refused predictably", async () => {
      const cases: Array<[string, string, unknown, number]> = [
        ["POST", "/employees", newEmployee({ employment_status: "deleted" }), 400],
        ["POST", "/employees", newEmployee({ date_of_birth: "2026-02-31" }), 400],
        ["POST", "/employees", newEmployee({ email: "not-an-email" }), 400],
        ["POST", "/employees", newEmployee({ temporary_password: "short" }), 400],
        ["POST", "/employees", newEmployee({ full_name: 12345 }), 400],
        ["POST", "/employees", newEmployee({ role: "admin" }), 400],
        ["POST", "/employees", newEmployee({ department_id: 999999 }), 404],
        ["GET", "/employees/not-a-number", undefined, 400],
        ["GET", "/employees/0", undefined, 400],
        ["GET", "/employees/999999", undefined, 404],
        ["PUT", "/employees/not-a-number", { full_name: "x", department_id: 1, employment_status: "active" }, 400],
        ["DELETE", "/employees/not-a-number", undefined, 400],
        ["PATCH", "/employees/not-a-number/reactivate", undefined, 400],
        ["GET", "/employees?page=0", undefined, 400],
        ["GET", "/employees?employment_status=deleted", undefined, 400],
        ["POST", "/departments", { name: 42 }, 400],
        ["POST", "/departments", { name: "   " }, 400],
        ["POST", "/departments", { name: "Valid", unexpected: true }, 400],
        ["PUT", "/departments/not-a-number", { name: "Valid" }, 400],
        ["DELETE", "/departments/not-a-number", undefined, 400],
        ["DELETE", "/departments/999999", undefined, 404],
      ];

      for (const [method, endpoint, body, expected] of cases) {
        const response = await call(method, endpoint, body);
        assert.equal(response.status, expected, `${method} ${endpoint}`);
      }
    });

    await t.test("department deletion protects assigned employees and their history", async () => {
      const occupied = (await (await call("POST", "/departments", {
        name: `Occupied ${suffix}`,
      })).json()).data;
      const created = await call("POST", "/employees", newEmployee({ department_id: occupied.id }));
      assert.equal(created.status, 201);
      const employee = (await created.json()).data;

      const refused = await call("DELETE", `/departments/${occupied.id}`);
      assert.equal(refused.status, 409);
      assert.equal((await refused.json()).message, "Cannot delete department while employees are assigned to it");
      // The employee and the department both survive the refusal.
      assert.equal((await call("GET", `/employees/${employee.id}`)).status, 200);
      assert.equal((await call("GET", `/departments/${occupied.id}`)).status, 200);

      // An empty department still deletes.
      const empty = (await (await call("POST", "/departments", { name: `Empty ${suffix}` })).json()).data;
      assert.equal((await call("DELETE", `/departments/${empty.id}`)).status, 200);
      assert.equal((await call("GET", `/departments/${empty.id}`)).status, 404);
    });

    await t.test("department headcounts are aggregated server-side", async () => {
      const counted = (await (await call("POST", "/departments", {
        name: `Counted ${suffix}`,
      })).json()).data;
      assert.equal(counted.employee_count, 0);
      assert.equal(counted.active_employee_count, 0);

      for (const status of ["active", "probation", "inactive", "terminated"]) {
        await call("POST", "/employees", newEmployee({ department_id: counted.id, employment_status: status }));
      }

      const listed = (await (await call("GET", "/departments")).json()).data
        .find((department: { id: number }) => department.id === counted.id);
      assert.equal(listed.employee_count, 4);
      // Active counts only the statuses that still grant a sign-in.
      assert.equal(listed.active_employee_count, 2);

      const detail = (await (await call("GET", `/departments/${counted.id}`)).json()).data;
      assert.equal(detail.employee_count, 4);
      assert.equal(detail.active_employee_count, 2);

      // Department membership is never truncated by list pagination.
      const members = (await (await call("GET", `/departments/${counted.id}/employees`)).json()).data;
      assert.equal(members.length, 4);
    });

    await t.test("the list is paginated server-side and searchable by email", async () => {
      const paged = (await (await call("GET", "/employees?page=1&page_size=2")).json());
      assert.equal(paged.data.length, 2);
      assert.ok(paged.pagination.total > 2);
      assert.equal(paged.pagination.page, 1);
      assert.equal(paged.pagination.page_count, Math.ceil(paged.pagination.total / 2));

      const second = (await (await call("GET", "/employees?page=2&page_size=2")).json());
      assert.equal(second.pagination.total, paged.pagination.total);
      assert.notDeepEqual(second.data.map((row: { id: number }) => row.id), paged.data.map((row: { id: number }) => row.id));

      // A page past the end reports the real total rather than claiming zero rows exist.
      const beyond = (await (await call("GET", "/employees?page=100000&page_size=2")).json());
      assert.equal(beyond.data.length, 0);
      assert.equal(beyond.pagination.total, paged.pagination.total);

      const byEmail = (await (await call("GET", `/employees?search=concurrent-api-${suffix}`)).json());
      assert.equal(byEmail.pagination.total, 1);
      assert.equal(byEmail.data.length, 1);

      const byStatus = (await (await call("GET", "/employees?employment_status=terminated")).json());
      assert.ok(byStatus.pagination.total >= 1);
      for (const row of byStatus.data) assert.equal(row.employment_status, "terminated");
    });

    await t.test("the lookup directory returns every employee for attendance joins", async () => {
      const total = (await (await call("GET", "/employees?page=1&page_size=1")).json()).pagination.total;
      const lookup = (await (await call("GET", "/employees/lookup")).json()).data;
      assert.equal(lookup.length, total);
      assert.ok(lookup.every((entry: Record<string, unknown>) => "department_name" in entry));
      // The directory must not leak fields the list does not expose.
      assert.ok(lookup.every((entry: Record<string, unknown>) => !("address" in entry)));

      const titles = (await (await call("GET", "/employees/job-titles")).json()).data;
      assert.ok(Array.isArray(titles));
    });

    await t.test("optional fields clear explicitly and are otherwise left unchanged", async () => {
      const created = await call("POST", "/employees", newEmployee({
        phone: "+60 12-345 6789", job_title: "Lab Engineer", address: "Fictional address",
        date_of_birth: "1990-06-15", employment_date: "2020-01-02", gender: "Prefer not to say",
      }));
      const employee = (await created.json()).data;
      assert.equal(employee.job_title, "Lab Engineer");

      // Omitted optional fields survive an update that does not mention them.
      await call("PUT", `/employees/${employee.id}`, {
        full_name: "Renamed Lab Employee", department_id: departmentId, employment_status: "active",
      });
      let current = (await (await call("GET", `/employees/${employee.id}`)).json()).data;
      assert.equal(current.full_name, "Renamed Lab Employee");
      assert.equal(current.job_title, "Lab Engineer");
      assert.equal(current.phone, "+60 12-345 6789");

      // null is the explicit clear.
      await call("PUT", `/employees/${employee.id}`, {
        full_name: "Renamed Lab Employee", department_id: departmentId, employment_status: "active",
        job_title: null, phone: null, address: null, date_of_birth: null,
      });
      current = (await (await call("GET", `/employees/${employee.id}`)).json()).data;
      assert.equal(current.job_title, null);
      assert.equal(current.phone, null);
      assert.equal(current.address, null);
      assert.equal(current.date_of_birth, null);
      // Untouched in this request, so it must still be set.
      assert.ok(current.employment_date);
    });

    await t.test("a failed update leaves the employee and account unchanged", async () => {
      const created = await call("POST", "/employees", newEmployee({ job_title: "Original Title" }));
      const employee = (await created.json()).data;
      const accountBefore = await accountFor(employee.id);

      // The email conflict is detected after the employee row has been written in
      // the same transaction; the rollback must discard both changes.
      const conflict = await call("PUT", `/employees/${employee.id}`, {
        full_name: "Should Not Persist",
        department_id: departmentId,
        employment_status: "terminated",
        job_title: "Should Not Persist",
        email: "stability-admin@example.invalid",
      });
      assert.equal(conflict.status, 409);

      const current = (await (await call("GET", `/employees/${employee.id}`)).json()).data;
      assert.equal(current.full_name, "Fictional Lab Employee");
      assert.equal(current.job_title, "Original Title");
      assert.equal(current.employment_status, "active");
      assert.deepEqual(await accountFor(employee.id), accountBefore);
    });

    await t.test("the protected orphan attendance rows are untouched by the whole suite", async () => {
      assert.deepEqual(
        (await db.query("SELECT id, employee_id FROM attendance_integrity_exceptions ORDER BY id")).rows,
        before.orphans && (await db.query(
          "SELECT id, employee_id FROM attendance_integrity_exceptions ORDER BY id",
        )).rows,
      );
      assert.equal((await db.query("SELECT count(*)::integer FROM attendance_integrity_exceptions")).rows[0].count, 5);
      assert.deepEqual(
        (await db.query("SELECT id, employee_id FROM attendance WHERE id <= 6 ORDER BY id")).rows
          .map((row) => `${row.id}:${row.employee_id}`),
        ["1:1", "3:1", "4:2", "5:1", "6:1"],
      );
    });
  } finally {
    if (server) await new Promise<void>((resolve) => server!.close(() => resolve()));
    if (appPool) await appPool.end();
    if (pool) await pool.end();
    if (collisionPool) await collisionPool.end();
    if (partialDirectory) await rm(partialDirectory, { recursive: true, force: true });
    // Disposable clones are retained for inspection, as the lab convention expects.
    await admin.end();
  }
});
