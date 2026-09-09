import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { once } from "node:events";
import { mkdtemp, readFile, writeFile, rm, copyFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { mock, test } from "node:test";
import pg from "pg";
import { dropLabClones } from "./labClones.js";
import jwt from "jsonwebtoken";
import {
  defaultMigrationDirectory, loadMigrations, MIGRATION_LOCK, runMigrations as runVersionedMigrations,
} from "../src/database/migrations.js";

// Deliberately opt-in and fixed to the isolated Docker network's laboratory host.
// No DATABASE_URL fallback, no live database selection, no seeds, no volume resets.
test("isolated PostgreSQL migration rehearsal", {
  skip: process.env.HR_NEXUS_MIGRATION_LAB !== "1", timeout: 60_000,
}, async (t) => {
  const suffix = randomBytes(5).toString("hex");
  const admin = new pg.Pool({ host: "hr-nexus-v2-migration-lab", user: "postgres", database: "postgres" });
  const pools: pg.Pool[] = [];
  const directories: string[] = [];
  async function database(label: string, template = "template0") {
    const name = `hr_nexus_v2_${label}_${suffix}`;
    // Both identifiers come exclusively from the fixed labels and random hex above.
    assert.match(name, /^hr_nexus_v2_[a-z0-9_]+$/);
    assert.ok(["template0", "hr_nexus_v2_upgrade"].includes(template));
    await admin.query(`CREATE DATABASE "${name}" TEMPLATE "${template}"`);
    const pool = new pg.Pool({ host: "hr-nexus-v2-migration-lab", user: "postgres", database: name });
    pools.push(pool);
    return { pool, name };
  }
  async function directory(files: Record<string, string>) {
    const dir = await mkdtemp(path.join(os.tmpdir(), "hr-nexus-lab-"));
    directories.push(dir);
    for (const [name, contents] of Object.entries(files)) await writeFile(path.join(dir, name), contents);
    return dir;
  }
  async function fingerprint(pool: pg.Pool) {
    const result: Record<string, unknown> = {};
    for (const table of ["departments", "employees", "users", "leave_requests", "attendance"]) {
      result[table] = (await pool.query(
        `SELECT COUNT(*)::integer AS count, md5(COALESCE(jsonb_agg(to_jsonb(t) ORDER BY id)::text, '[]')) AS digest FROM public.${table} t`,
      )).rows[0];
    }
    result.columns = (await pool.query(`SELECT table_name, column_name, data_type, column_default
      FROM information_schema.columns WHERE table_schema = 'public'
      AND table_name IN ('departments','employees','users','leave_requests','attendance')
      ORDER BY table_name, ordinal_position`)).rows;
    result.sequences = (await pool.query(`SELECT sequencename, data_type, last_value FROM pg_sequences
      WHERE schemaname = 'public' ORDER BY sequencename`)).rows;
    return result;
  }
  async function probe(pool: pg.Pool, fn: (client: pg.PoolClient) => Promise<void>) {
    const client = await pool.connect();
    await client.query("BEGIN");
    try { await fn(client); } finally { await client.query("ROLLBACK"); client.release(); }
  }
  async function rejected(client: pg.PoolClient, sql: string, code: string) {
    await client.query("SAVEPOINT rejected_write");
    await assert.rejects(client.query(sql), { code });
    await client.query("ROLLBACK TO SAVEPOINT rejected_write");
  }
  // This historical suite intentionally exercises only immutable migration 0001.
  // New migrations have their own upgrade/fresh tests and must not change its cases.
  const retentionDirectory = await directory({});
  await copyFile(new URL("0001_employee_history_retention.sql", defaultMigrationDirectory),
    path.join(retentionDirectory, "0001_employee_history_retention.sql"));
  const runMigrations = (pool: pg.Pool, options: Parameters<typeof runVersionedMigrations>[1]) =>
    runVersionedMigrations(pool, { directory: retentionDirectory, ...options });
  let suiteCompleted = false;
  try {
    const upgrade = await database("upgrade", "hr_nexus_v2_upgrade");
    const before = await fingerprint(upgrade.pool);
    const orphanBefore = (await upgrade.pool.query(`SELECT id::text, employee_id::text, attendance_date::text,
      md5(to_jsonb(a)::text) AS digest FROM public.attendance a
      WHERE NOT EXISTS (SELECT 1 FROM public.employees e WHERE e.id = a.employee_id) ORDER BY id`)).rows;

    await t.test("status is read-only, target confirmation is required, and five copied orphans are visible", async () => {
      const status = await runMigrations(upgrade.pool, { mode: "status", database: upgrade.name });
      assert.equal(status.migrations[0]?.status, "pending");
      assert.deepEqual(status.orphanAttendance?.map((row) => row.id), ["1", "3", "4", "5", "6"]);
      assert.equal((await upgrade.pool.query("SELECT to_regclass('public.schema_migrations') AS name")).rows[0].name, null);
      await assert.rejects(runMigrations(upgrade.pool, { mode: "apply", database: "wrong_database" }), { code: "TARGET_MISMATCH" });
      assert.deepEqual(await fingerprint(upgrade.pool), before);
    });

    await t.test("upgrade preserves all rows, INTEGER IDs, sequences and each complete orphan row", async () => {
      const result = await runMigrations(upgrade.pool, { mode: "apply", database: upgrade.name });
      assert.deepEqual(result.newlyApplied, ["0001"]);
      assert.deepEqual(await fingerprint(upgrade.pool), before);
      const after = (await upgrade.pool.query(`SELECT id::text, employee_id::text, attendance_date::text,
        md5((to_jsonb(a) - 'integrity_issue')::text) AS digest
        FROM public.attendance_integrity_exceptions a ORDER BY id`)).rows;
      assert.deepEqual(after, orphanBefore);
      assert.equal((await upgrade.pool.query("SELECT is_updatable FROM information_schema.views WHERE table_schema='public' AND table_name='attendance_integrity_exceptions'")).rows[0].is_updatable, "NO");
      const fks = (await upgrade.pool.query(`SELECT conname, confdeltype, confupdtype, convalidated
        FROM pg_constraint WHERE conname IN ('users_employee_id_fkey','leave_requests_employee_id_fkey','attendance_employee_id_fkey') ORDER BY conname`)).rows;
      assert.deepEqual(fks, [
        { conname: "attendance_employee_id_fkey", confdeltype: "r", confupdtype: "r", convalidated: false },
        { conname: "leave_requests_employee_id_fkey", confdeltype: "r", confupdtype: "r", convalidated: true },
        { conname: "users_employee_id_fkey", confdeltype: "r", confupdtype: "r", convalidated: true },
      ]);
      t.diagnostic(`Upgrade table fingerprints preserved: ${JSON.stringify(Object.fromEntries(Object.entries(before).filter(([key]) => !["columns", "sequences"].includes(key))))}`);
      t.diagnostic(`All orphan row fingerprints preserved: ${JSON.stringify(orphanBefore)}`);
    });

    await t.test("repeated apply is a no-op with one checksum/history row", async () => {
      assert.deepEqual((await runMigrations(upgrade.pool, { mode: "apply", database: upgrade.name })).newlyApplied, []);
      assert.equal((await upgrade.pool.query("SELECT COUNT(*)::integer AS count FROM public.schema_migrations")).rows[0].count, 1);
      assert.deepEqual(await fingerprint(upgrade.pool), before);
    });

    await t.test("FK and ownership guards reject new orphans, parent deletion and silent reassignment", async () => {
      await probe(upgrade.pool, async (client) => {
        await client.query(`INSERT INTO public.employees (id, employee_number, full_name)
          VALUES (1000, 'LAB-ATTENDANCE', 'Isolated Attendance Fixture'),
            (1001, 'LAB-USER', 'Isolated User Fixture'), (1002, 'LAB-LEAVE', 'Isolated Leave Fixture');
          INSERT INTO public.attendance (id, employee_id, attendance_date) VALUES (1000,1000,'2026-09-08');
          INSERT INTO public.users (id,employee_id,email,password_hash,role) VALUES (1000,1001,'lab@example.invalid','unusable-fixture-hash','employee');
          INSERT INTO public.leave_requests (id,employee_id,leave_type,start_date,end_date,reason)
            VALUES (1000,1002,'annual','2026-09-08','2026-09-08','Isolated fixture');`);
        await client.query(`INSERT INTO public.employees (id,employee_number,full_name)
          VALUES (1000,'LAB-ATTENDANCE','Updated isolated fixture')
          ON CONFLICT (id) DO UPDATE SET full_name=EXCLUDED.full_name`);
        await rejected(client, "INSERT INTO public.attendance (id,employee_id,attendance_date) VALUES (1001,999999,'2026-09-08')", "23503");
        await rejected(client, "UPDATE public.attendance SET employee_id = 999999 WHERE id = 1000", "23503");
        for (const id of [1000, 1001, 1002]) {
          await rejected(client, `DELETE FROM public.employees WHERE id = ${id}`, "23503");
          await rejected(client, `UPDATE public.employees SET id = ${id + 100} WHERE id = ${id}`, "23503");
        }
        await rejected(client, "INSERT INTO public.employees (id,employee_number,full_name) VALUES (1,'LAB-REUSE','No adoption')", "23514");
        await rejected(client, "UPDATE public.employees SET id = 2 WHERE id = 1000", "23514");
        await rejected(client, "UPDATE public.attendance SET employee_id = 3 WHERE id = 1", "23514");
        await rejected(client, "ALTER TABLE public.attendance VALIDATE CONSTRAINT attendance_employee_id_fkey", "23503");
        await client.query("UPDATE public.attendance SET employee_id = employee_id, admin_note = 'Isolated correction' WHERE id = 1");
        assert.equal((await client.query("SELECT COUNT(*)::integer AS count FROM public.attendance_integrity_exceptions")).rows[0].count, 5);
      });
      assert.deepEqual(await fingerprint(upgrade.pool), before);
    });

    await t.test("NOT VALID alone permits unchanged-key edits and parent-key adoption", async () => {
      const client = await upgrade.pool.connect();
      try {
        // Commit the legacy fixture before adding the constraint, matching a real
        // pre-existing row rather than one inserted in the current transaction.
        await client.query(`CREATE TEMP TABLE fk_parent (id integer PRIMARY KEY);
          CREATE TEMP TABLE fk_child (id integer PRIMARY KEY, employee_id bigint NOT NULL, note text);
          INSERT INTO fk_child VALUES (1,42,'legacy');`);
        await client.query("ALTER TABLE fk_child ADD CONSTRAINT demo_fk FOREIGN KEY (employee_id) REFERENCES fk_parent(id) ON DELETE RESTRICT NOT VALID");
        await client.query("BEGIN");
        await client.query("UPDATE fk_child SET note = 'allowed' WHERE id = 1");
        await rejected(client, "INSERT INTO fk_child VALUES (2,43,'new orphan')", "23503");
        await rejected(client, "ALTER TABLE fk_child VALIDATE CONSTRAINT demo_fk", "23503");
        await client.query("INSERT INTO fk_parent VALUES (42)");
        assert.equal((await client.query("SELECT COUNT(*)::integer AS count FROM fk_child c JOIN fk_parent p ON p.id=c.employee_id")).rows[0].count, 1);
      } finally {
        await client.query("ROLLBACK");
        client.release(true);
      }
    });

    const fresh = await database("fresh");
    await t.test("fresh initialization from schema.sql without seeds uses the same migration", async () => {
      await fresh.pool.query(await readFile(new URL("../../database/schema.sql", import.meta.url), "utf8"));
      const baseline = await fingerprint(fresh.pool);
      assert.deepEqual((await runMigrations(fresh.pool, { mode: "apply", database: fresh.name })).newlyApplied, ["0001"]);
      assert.deepEqual(await fingerprint(fresh.pool), baseline);
      const fks = (await fresh.pool.query("SELECT convalidated FROM pg_constraint WHERE conname = 'attendance_employee_id_fkey'")).rows;
      assert.equal(fks[0].convalidated, true);
      assert.equal((await fresh.pool.query("SELECT COUNT(*)::integer AS count FROM public.attendance_integrity_exceptions")).rows[0].count, 0);
    });

    await t.test("unexpected additional cascading FK fails closed without partial constraint changes", async () => {
      const db = await database("unexpected_fk", "hr_nexus_v2_upgrade");
      await db.pool.query("ALTER TABLE public.attendance ADD CONSTRAINT unexpected_fk FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON DELETE CASCADE NOT VALID");
      await assert.rejects(runMigrations(db.pool, { mode: "apply", database: db.name }), { code: "P0001" });
      assert.equal((await db.pool.query("SELECT to_regclass('public.schema_migrations') AS name")).rows[0].name, null);
      assert.equal((await db.pool.query("SELECT confdeltype FROM pg_constraint WHERE conname='users_employee_id_fkey'")).rows[0].confdeltype, "c");
    });

    await t.test("failed first migration leaves neither data, DDL nor history table", async () => {
      const db = await database("bootstrap_failure");
      const dir = await directory({ "0001_failure.sql": "CREATE TABLE public.leaked (id integer); SELECT 1/0;" });
      await assert.rejects(runMigrations(db.pool, { mode: "apply", database: db.name, directory: dir }), { code: "22012" });
      const row = (await db.pool.query("SELECT to_regclass('public.leaked') AS leaked, to_regclass('public.schema_migrations') AS history")).rows[0];
      assert.deepEqual(row, { leaked: null, history: null });
    });

    await t.test("later failure rolls back that migration, preserves earlier work, and supports corrected retry", async () => {
      const db = await database("failure");
      const first = "CREATE TABLE public.probe (id integer PRIMARY KEY);";
      const dir = await directory({
        "0001_probe.sql": first,
        "0002_failure.sql": "INSERT INTO public.probe VALUES (1); CREATE TABLE public.leaked (id integer); SELECT 1/0;",
      });
      await assert.rejects(runMigrations(db.pool, { mode: "apply", database: db.name, directory: dir }), { code: "22012" });
      assert.equal((await db.pool.query("SELECT COUNT(*)::integer AS count FROM public.probe")).rows[0].count, 0);
      assert.equal((await db.pool.query("SELECT to_regclass('public.leaked') AS name")).rows[0].name, null);
      assert.deepEqual((await db.pool.query("SELECT version FROM public.schema_migrations")).rows, [{ version: "0001" }]);
      await writeFile(path.join(dir, "0002_failure.sql"), "INSERT INTO public.probe VALUES (2);");
      assert.deepEqual((await runMigrations(db.pool, { mode: "apply", database: db.name, directory: dir })).newlyApplied, ["0002"]);
      await writeFile(path.join(dir, "0001_probe.sql"), first + "\n-- changed applied bytes");
      for (const mode of ["status", "apply"] as const) {
        await assert.rejects(runMigrations(db.pool, { mode, database: db.name, directory: dir }), { code: "HISTORY_MISMATCH" });
      }
      await writeFile(path.join(dir, "0001_probe.sql"), first);
      await rm(path.join(dir, "0002_failure.sql"));
      await assert.rejects(runMigrations(db.pool, { mode: "apply", database: db.name, directory: dir }), { code: "HISTORY_MISMATCH" });
    });

    await t.test("concurrent runners cannot apply twice and the lock is released", async () => {
      const db = await database("locking");
      const dir = await directory({ "0001_once.sql": "SELECT pg_sleep(0.3); CREATE TABLE public.once_only (id integer); INSERT INTO public.once_only VALUES (1);" });
      const first = runMigrations(db.pool, { mode: "apply", database: db.name, directory: dir });
      let observed = false;
      for (let attempt = 0; attempt < 100; attempt++) {
        const locks = await db.pool.query("SELECT 1 FROM pg_locks WHERE locktype='advisory' AND classid=$1 AND objid=$2 AND granted AND database=(SELECT oid FROM pg_database WHERE datname=current_database())", [...MIGRATION_LOCK]);
        if (locks.rowCount) { observed = true; break; }
        await new Promise((resolve) => setTimeout(resolve, 5));
      }
      assert.equal(observed, true);
      await assert.rejects(runMigrations(db.pool, { mode: "apply", database: db.name, directory: dir }), { code: "MIGRATION_BUSY" });
      assert.deepEqual((await first).newlyApplied, ["0001"]);
      assert.deepEqual((await runMigrations(db.pool, { mode: "apply", database: db.name, directory: dir })).newlyApplied, []);
      assert.equal((await db.pool.query("SELECT COUNT(*)::integer AS count FROM public.once_only")).rows[0].count, 1);
    });

    await t.test("lost commit acknowledgement is reported as unknown and status prevents duplicate apply", async () => {
      const db = await database("commit_ack");
      const dir = await directory({ "0001_once.sql": "CREATE TABLE public.committed (id integer); INSERT INTO public.committed VALUES (1);" });
      const connect = db.pool.connect.bind(db.pool);
      const connectionMock = mock.method(db.pool, "connect", async () => {
        const client = await connect();
        const query = client.query.bind(client);
        mock.method(client, "query", async (sql: string, values?: unknown[]) => {
          if (sql === "ROLLBACK") throw new Error("Simulated unavailable connection during cleanup");
          const result = await query(sql, values);
          if (sql === "COMMIT") throw new Error("Simulated lost acknowledgement after actual commit");
          return result;
        });
        return client;
      });
      try {
        await assert.rejects(runMigrations(db.pool, { mode: "apply", database: db.name, directory: dir }), { code: "COMMIT_UNKNOWN" });
      } finally { connectionMock.mock.restore(); }
      const status = await runMigrations(db.pool, { mode: "status", database: db.name, directory: dir });
      assert.equal(status.migrations[0]?.status, "applied");
      assert.deepEqual((await runMigrations(db.pool, { mode: "apply", database: db.name, directory: dir })).newlyApplied, []);
      assert.equal((await db.pool.query("SELECT COUNT(*)::integer AS count FROM public.committed")).rows[0].count, 1);
    });

    await t.test("busy application table causes a bounded timeout and complete migration rollback", async () => {
      const db = await database("lock_timeout", "hr_nexus_v2_upgrade");
      const blocker = await db.pool.connect();
      try {
        await blocker.query("BEGIN; LOCK TABLE public.attendance IN ACCESS SHARE MODE");
        await assert.rejects(runMigrations(db.pool, { mode: "apply", database: db.name }), { code: "55P03" });
        assert.equal((await db.pool.query("SELECT to_regclass('public.schema_migrations') AS name")).rows[0].name, null);
        assert.equal((await db.pool.query("SELECT COUNT(*)::integer AS count FROM pg_constraint WHERE conname='attendance_employee_id_fkey'")).rows[0].count, 0);
      } finally { await blocker.query("ROLLBACK"); blocker.release(); }
    });

    await t.test("actual admin API preserves history through 409, deactivation and reactivation", async () => {
      const db = await database("workflow", "hr_nexus_v2_upgrade");
      await runMigrations(db.pool, { mode: "apply", database: db.name });
      // Synthetic accounts only in this isolated copy; never use source account credentials.
      await db.pool.query(`INSERT INTO employees (id,employee_number,full_name) VALUES (1000,'LAB-LIFECYCLE','Isolated Lifecycle Fixture');
        INSERT INTO users (id,employee_id,email,password_hash,role) VALUES
          (1000,NULL,'lab-admin@example.invalid','unusable-fixture-hash','admin'),
          (1001,1000,'lab-employee@example.invalid','unusable-fixture-hash','employee');
        INSERT INTO attendance (id,employee_id,attendance_date) VALUES (1000,1000,'2026-09-08');
        INSERT INTO leave_requests (id,employee_id,leave_type,start_date,end_date,reason) VALUES (1000,1000,'annual','2026-09-09','2026-09-09','Isolated fixture');`);
      process.env.DATABASE_URL = `postgresql://postgres@hr-nexus-v2-migration-lab/${db.name}`;
      process.env.JWT_SECRET = randomBytes(32).toString("hex");
      const { default: app } = await import("../src/app.js");
      const { default: appPool } = await import("../src/config/db.js");
      const server = app.listen(0, "127.0.0.1");
      try {
        await once(server, "listening");
        const address = server.address();
        assert.ok(address && typeof address !== "string");
        const adminToken = jwt.sign({ role: "admin", employeeId: null }, process.env.JWT_SECRET, { subject: "1000", expiresIn: "5m" });
        const employeeToken = jwt.sign({ role: "employee", employeeId: 1000 }, process.env.JWT_SECRET, { subject: "1001", expiresIn: "5m" });
        const call = (method: string, endpoint: string, token = adminToken) => fetch(`http://127.0.0.1:${address.port}/api${endpoint}`, {
          method, headers: { Authorization: `Bearer ${token}` },
        });
        const initial = await fingerprint(db.pool);
        assert.equal((await call("DELETE", "/employees/1000/permanent")).status, 409);
        assert.deepEqual(await fingerprint(db.pool), initial);
        assert.equal((await call("DELETE", "/employees/1000")).status, 200);
        assert.equal((await db.pool.query("SELECT is_active FROM users WHERE id=1001")).rows[0].is_active, false);
        assert.equal((await call("GET", "/attendance/today", employeeToken)).status, 401);
        assert.equal((await call("PATCH", "/employees/1000/reactivate")).status, 200);
        assert.equal((await db.pool.query("SELECT is_active FROM users WHERE id=1001")).rows[0].is_active, true);
        assert.equal((await call("GET", "/attendance/today", employeeToken)).status, 200);
        const after = await fingerprint(db.pool);
        for (const table of ["attendance", "leave_requests"]) assert.deepEqual(after[table], initial[table]);
        assert.equal((await db.pool.query("SELECT COUNT(*)::integer AS count FROM attendance_integrity_exceptions")).rows[0].count, 5);
      } finally {
        await new Promise<void>((resolve) => server.close(() => resolve()));
        await appPool.end();
      }
    });

    await t.test("review-only legacy compensation restores original constraints and all data while retaining migration history", async () => {
      const db = await database("compensation", "hr_nexus_v2_upgrade");
      const initial = await fingerprint(db.pool);
      const constraintQuery = "SELECT conrelid::regclass::text AS table_name, conname, pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE connamespace='public'::regnamespace AND conrelid <> COALESCE(to_regclass('public.schema_migrations'), 0) ORDER BY 1,2";
      const constraints = (await db.pool.query(constraintQuery)).rows;
      const dir = await directory({});
      await copyFile(new URL("0001_employee_history_retention.sql", defaultMigrationDirectory), path.join(dir, "0001_employee_history_retention.sql"));
      await copyFile(new URL("../../docs/sql/rollback_0001_legacy.sql", import.meta.url), path.join(dir, "0002_compensate_legacy.sql"));
      assert.deepEqual((await runMigrations(db.pool, { mode: "apply", database: db.name, directory: dir })).newlyApplied, ["0001", "0002"]);
      assert.deepEqual(await fingerprint(db.pool), initial);
      assert.deepEqual((await db.pool.query(constraintQuery)).rows, constraints);
      assert.equal((await db.pool.query("SELECT COUNT(*)::integer AS count FROM public.schema_migrations")).rows[0].count, 2);
      assert.equal((await db.pool.query("SELECT to_regclass('public.attendance_integrity_exceptions') AS name")).rows[0].name, null);
    });

    t.diagnostic(`Isolated database suffix: ${suffix}; copied baseline was never mutated.`);
    t.diagnostic(`Proposed migration checksums: ${JSON.stringify((await loadMigrations()).map(({ version, checksum }) => ({ version, checksum })))}`);
    suiteCompleted = true;
  } finally {
    await Promise.all(pools.map((pool) => pool.end()));
    await dropLabClones(admin, suffix, suiteCompleted, t);
    await admin.end();
    for (const dir of directories) await rm(dir, { recursive: true });
  }
});
