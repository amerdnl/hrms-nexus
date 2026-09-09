import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { once } from "node:events";
import { readFile } from "node:fs/promises";
import { mock, test } from "node:test";
import pg from "pg";
import jwt from "jsonwebtoken";
import { copyFile, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { defaultMigrationDirectory, loadMigrations, runMigrations } from "../src/database/migrations.js";
import { dropLabClones } from "./labClones.js";

// Explicit opt-in; the only permitted host is the isolated, internal Docker lab.
// Baseline is a retained logical source copy with 0001 applied and no settings yet.
test("Company Settings PostgreSQL upgrade and authenticated API", {
  skip: process.env.HR_NEXUS_SETTINGS_LAB !== "1", timeout: 60_000,
}, async (t) => {
  const suffix = randomBytes(5).toString("hex");
  const host = "hr-nexus-v2-migration-lab";
  const admin = new pg.Pool({ host, user: "postgres", database: "postgres" });
  const database = `hr_nexus_settings_${suffix}`;
  const freshDatabase = `hr_nexus_settings_fresh_${suffix}`;
  let pool: pg.Pool | undefined;
  let fresh: pg.Pool | undefined;
  let appPool: pg.Pool | undefined;
  let server: ReturnType<import("express").Express["listen"]> | undefined;
  let settingsDirectory: string | undefined;
  let suiteCompleted = false;
  try {
    await admin.query(`CREATE DATABASE "${database}" TEMPLATE hr_nexus_v2_settings_baseline`);
    pool = new pg.Pool({ host, user: "postgres", database });
    const db = pool;
    // Columns present when the baseline was taken. Later reviewed migrations may
    // add columns; this suite proves the values it already knew about are intact,
    // not that the schema is frozen forever.
    let baseline: Record<string, string[]> | null = null;
    let baselineSequences: string[] | null = null;
    let baselineConstraints: string[] | null = null;
    async function business() {
      const data: Record<string, unknown> = {};
      const tables = ["departments", "employees", "users", "leave_requests", "attendance"];
      if (!baseline) {
        baseline = {};
        for (const table of tables) {
          baseline[table] = (await db.query(
            "SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=$1",
            [table],
          )).rows.map((row) => row.column_name);
        }
      }
      for (const table of tables) {
        const present = (await db.query(
          "SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=$1",
          [table],
        )).rows.map((row) => row.column_name);
        const added = present.filter((column) => !baseline![table]!.includes(column));
        data[table] = (await db.query(
          `SELECT count(*)::integer, md5(COALESCE(jsonb_agg(to_jsonb(t) - $1::text[] ORDER BY id)::text,'[]')) AS digest FROM public.${table} t`,
          [added],
        )).rows;
      }
      data.columns = (await db.query(`SELECT table_name,column_name,data_type,column_default,is_nullable FROM information_schema.columns
        WHERE table_schema='public' AND table_name IN ('departments','employees','users','leave_requests','attendance')
          AND column_name = ANY($1::text[]) ORDER BY table_name,ordinal_position`,
        [Object.values(baseline).flat()])).rows;
      // Sequences and constraints are compared by the names that existed at
      // baseline; later reviewed migrations legitimately add their own.
      if (!baselineSequences) {
        baselineSequences = (await db.query(
          "SELECT sequencename FROM pg_sequences WHERE schemaname='public'",
        )).rows.map((row) => row.sequencename as string);
      }
      if (!baselineConstraints) {
        baselineConstraints = (await db.query(
          "SELECT conname FROM pg_constraint WHERE connamespace='public'::regnamespace",
        )).rows.map((row) => row.conname as string);
      }
      data.sequences = (await db.query(
        `SELECT * FROM pg_sequences WHERE schemaname='public'
           AND sequencename = ANY($1::text[]) ORDER BY sequencename`,
        [baselineSequences],
      )).rows;
      data.constraints = (await db.query(
        `SELECT conrelid::regclass::text,conname,convalidated,pg_get_constraintdef(oid) FROM pg_constraint
         WHERE connamespace='public'::regnamespace AND conname = ANY($1::text[]) ORDER BY 1,2`,
        [baselineConstraints],
      )).rows;
      data.orphans = (await db.query("SELECT id, md5((to_jsonb(a)-'integrity_issue')::text) AS digest FROM attendance_integrity_exceptions a ORDER BY id")).rows;
      return data;
    }
    const before = await business();
    const firstLedger = (await db.query("SELECT * FROM schema_migrations WHERE version='0001'")).rows;
    const migrations = await loadMigrations();
    const second = migrations.find((m) => m.version === "0002")!;
    assert.equal(second.filename, "0002_company_settings.sql");

    // Scope this database to the chain this suite is about. Running every later
    // migration here would make their legitimate schema changes look like drift.
    settingsDirectory = await mkdtemp(path.join(os.tmpdir(), "hr-nexus-settings-lab-"));
    for (const filename of ["0001_employee_history_retention.sql", "0002_company_settings.sql"]) {
      await copyFile(new URL(filename, defaultMigrationDirectory), path.join(settingsDirectory, filename));
    }
    const scoped = { directory: settingsDirectory };

    await t.test("additive upgrade preserves business rows/schema/IDs/sequences/0001 and creates neutral defaults", async () => {
      const status = await runMigrations(db, { mode: "status", database, ...scoped });
      assert.deepEqual(status.migrations.map((m) => m.status), ["applied", "pending"]);
      assert.deepEqual((await runMigrations(db, { mode: "apply", database, ...scoped })).newlyApplied, ["0002"]);
      assert.deepEqual(await business(), before);
      assert.deepEqual((await db.query("SELECT * FROM schema_migrations WHERE version='0001'")).rows, firstLedger);
      assert.deepEqual((await db.query("SELECT filename,checksum FROM schema_migrations WHERE version='0002'")).rows,
        [{ filename: second.filename, checksum: second.checksum }]);
      const settings = (await db.query("SELECT * FROM company_settings")).rows;
      assert.equal(settings.length, 1);
      assert.equal(settings[0].company_name, null);
      assert.equal(settings[0].office_latitude, null);
      assert.equal(settings[0].office_longitude, null);
      assert.equal(settings[0].timezone, "UTC");
      assert.deepEqual(settings[0].working_days, [1,2,3,4,5]);
      assert.equal(settings[0].work_start_time, "09:00:00");
      assert.equal(settings[0].work_end_time, "17:00:00");
      assert.equal(settings[0].grace_period_minutes, 0);
      assert.equal(settings[0].attendance_radius_meters, 100);
      assert.equal(settings[0].revision, 0);
    });
    await t.test("repeat apply is a no-op with exactly one 0002 checksum row", async () => {
      const initial = (await db.query("SELECT * FROM company_settings")).rows;
      assert.deepEqual((await runMigrations(db, { mode: "apply", database, ...scoped })).newlyApplied, []);
      assert.equal((await db.query("SELECT count(*)::integer FROM schema_migrations WHERE version='0002'")).rows[0].count, 1);
      assert.deepEqual((await db.query("SELECT * FROM company_settings")).rows, initial);
    });
    await t.test("database constraints reject invalid days, hours, location, radius and singleton writes", async () => {
      const client = await db.connect();
      try {
        await client.query("BEGIN");
        for (const sql of [
          "INSERT INTO company_settings (id) VALUES (2)",
          "UPDATE company_settings SET working_days=ARRAY[1,1]::smallint[]",
          "UPDATE company_settings SET working_days=ARRAY[]::smallint[]",
          "UPDATE company_settings SET working_days=ARRAY[0,8]::smallint[]",
          "UPDATE company_settings SET working_days=ARRAY[1,NULL]::smallint[]",
          "UPDATE company_settings SET work_start_time='24:00'",
          "UPDATE company_settings SET work_end_time=work_start_time",
          "UPDATE company_settings SET work_start_time='09:00:01'",
          "UPDATE company_settings SET grace_period_minutes=480",
          "UPDATE company_settings SET grace_period_minutes=-1",
          "UPDATE company_settings SET office_latitude=0",
          "UPDATE company_settings SET office_latitude=91,office_longitude=0",
          "UPDATE company_settings SET office_latitude='NaN',office_longitude=0",
          "UPDATE company_settings SET attendance_radius_meters=0",
        ]) {
          await client.query("SAVEPOINT invalid_setting");
          await assert.rejects(client.query(sql), { code: "23514" }, sql);
          await client.query("ROLLBACK TO SAVEPOINT invalid_setting");
        }
        await client.query("UPDATE company_settings SET work_start_time='22:00',work_end_time='06:00',grace_period_minutes=15,office_latitude=0,office_longitude=0");
      } finally { await client.query("ROLLBACK"); client.release(); }
    });
    await t.test("fresh initialization runs the complete migration chain without seeds", async () => {
      await admin.query(`CREATE DATABASE "${freshDatabase}" TEMPLATE template0`);
      fresh = new pg.Pool({ host, user: "postgres", database: freshDatabase });
      await fresh.query(await readFile(new URL("../../database/schema.sql", import.meta.url), "utf8"));
      assert.deepEqual((await runMigrations(fresh, { mode: "apply", database: freshDatabase })).newlyApplied,
        migrations.map((m) => m.version));
      assert.equal((await fresh.query("SELECT count(*)::integer FROM company_settings")).rows[0].count, 1);
      assert.equal((await fresh.query("SELECT count(*)::integer FROM employees")).rows[0].count, 0);
      assert.deepEqual((await runMigrations(fresh, { mode: "apply", database: freshDatabase })).newlyApplied, []);
    });
    await t.test("unexpected existing settings table aborts 0002 without changing 0001 or business data", async () => {
      const failureDatabase = `hr_nexus_settings_failure_${suffix}`;
      await admin.query(`CREATE DATABASE "${failureDatabase}" TEMPLATE hr_nexus_v2_settings_baseline`);
      const failure = new pg.Pool({ host, user: "postgres", database: failureDatabase });
      try {
        const history = (await failure.query("SELECT * FROM schema_migrations ORDER BY version")).rows;
        await failure.query("CREATE TABLE company_settings (id integer PRIMARY KEY, marker text); INSERT INTO company_settings VALUES (99,'pre-existing')");
        await assert.rejects(runMigrations(failure, { mode: "apply", database: failureDatabase }), { code: "42P07" });
        assert.deepEqual((await failure.query("SELECT * FROM schema_migrations ORDER BY version")).rows, history);
        assert.deepEqual((await failure.query("SELECT * FROM company_settings")).rows, [{ id: 99, marker: "pre-existing" }]);
        assert.equal((await failure.query("SELECT count(*)::integer FROM attendance_integrity_exceptions")).rows[0].count, 5);
      } finally { await failure.end(); }
    });

    // Authentication fixtures exist only in this disposable clone, never the source.
    await db.query(`INSERT INTO employees (id,employee_number,full_name) VALUES (9000,'SETTINGS-LAB','Settings Lab Employee');
      INSERT INTO users (id,employee_id,email,password_hash,role) VALUES
      (9000,NULL,'settings-admin@example.invalid','unusable-lab-hash','admin'),
      (9001,9000,'settings-employee@example.invalid','unusable-lab-hash','employee');`);
    const afterFixtures = await business();
    process.env.DATABASE_URL = `postgresql://postgres@${host}/${database}`;
    process.env.JWT_SECRET = randomBytes(32).toString("hex");
    const { default: app } = await import("../src/app.js");
    ({ default: appPool } = await import("../src/config/db.js"));
    server = app.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address(); assert.ok(address && typeof address !== "string");
    const adminToken = jwt.sign({ role: "admin", employeeId: null }, process.env.JWT_SECRET, { subject: "9000", expiresIn: "5m" });
    const employeeToken = jwt.sign({ role: "employee", employeeId: 9000 }, process.env.JWT_SECRET, { subject: "9001", expiresIn: "5m" });
    const call = (method: string, body?: unknown, token: string | null = adminToken) => fetch(`http://127.0.0.1:${address.port}/api/settings`, {
      method, headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const payload = {
      company_name: "  Fictional Settings Lab  ", registration_number: "LAB-ONLY", address: "Fictional address\nSecond line",
      email: "settings@example.invalid", phone: "+60 12-345 6789", timezone: "Asia/Kuala_Lumpur",
      working_days: [5,1,2,3,4], work_start_time: "22:00", work_end_time: "06:00", grace_period_minutes: 15,
      office_latitude: 0, office_longitude: 0, attendance_radius_meters: 250, revision: 0,
    };
    await t.test("real JWT/account authorization denies anonymous, employee and stale-role requests", async () => {
      for (const method of ["GET", "PUT"]) {
        const body = method === "PUT" ? payload : undefined;
        assert.equal((await call(method, body, null)).status, 401);
        assert.equal((await call(method, body, employeeToken)).status, 403);
      }
      const forged = jwt.sign({ role: "admin", employeeId: 9000 }, process.env.JWT_SECRET!, { subject: "9001", expiresIn: "5m" });
      assert.equal((await call("GET", undefined, forged)).status, 401);
    });
    await t.test("HTTP validation rejects invalid fields and mass assignment without saving", async () => {
      const initial = (await db.query("SELECT * FROM company_settings")).rows;
      for (const input of [{ ...payload, id: 2 }, { ...payload, company_name: "" }, { ...payload, timezone: "Mars/Olympus" },
        { ...payload, working_days: [1,1] }, { ...payload, office_longitude: null }, { ...payload, grace_period_minutes: "15" }, {}]) {
        const response = await call("PUT", input); assert.equal(response.status, 400);
        assert.ok(Object.keys((await response.json()).errors).length);
      }
      assert.deepEqual((await db.query("SELECT * FROM company_settings")).rows, initial);
    });
    await t.test("malformed and oversized JSON produce predictable client errors without saving", async () => {
      for (const [body, status] of [["{invalid-json", 400], [JSON.stringify("not an object"), 400], [JSON.stringify({ company_name: "x".repeat(110000) }), 413]] as const) {
        const response: Response = await fetch(`http://127.0.0.1:${address.port}/api/settings`, {
          method: "PUT", headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminToken}` }, body,
        });
        assert.equal(response.status, status);
        assert.equal((await response.json()).success, false);
      }
      assert.equal((await db.query("SELECT revision FROM company_settings")).rows[0].revision, 0);
    });
    await t.test("admin saves every field and a new database connection confirms durable persistence", async () => {
      const response = await call("PUT", payload); assert.equal(response.status, 200);
      const saved = (await response.json()).data;
      const reread = await call("GET"); assert.equal(reread.status, 200);
      assert.deepEqual((await reread.json()).data, saved);
      assert.deepEqual({ ...saved, id: undefined, created_at: undefined, updated_at: undefined }, {
        ...payload, id: undefined, created_at: undefined, updated_at: undefined,
        company_name: payload.company_name.trim(), working_days: [1,2,3,4,5], revision: 1,
      });
      const independent = new pg.Client({ host, user: "postgres", database });
      try {
        await independent.connect();
        assert.equal((await independent.query("SELECT company_name FROM company_settings")).rows[0].company_name, payload.company_name.trim());
      } finally { await independent.end(); }
    });
    await t.test("concurrent admin saves reject the stale revision without lost updates", async () => {
      const results = await Promise.all([call("PUT", { ...payload, company_name: "First admin", revision: 1 }),
        call("PUT", { ...payload, company_name: "Second admin", revision: 1 })]);
      assert.deepEqual(results.map((r) => r.status).sort(), [200,409]);
      const winner = await results.find((r) => r.status === 200)!.json();
      assert.deepEqual((await (await call("GET")).json()).data, winner.data);
      assert.equal(winner.data.revision, 2);
    });
    await t.test("optional fields can be cleared and SQL-looking company names are inert data", async () => {
      const name = "O'Reilly; DROP TABLE employees; --";
      const response = await call("PUT", { ...payload, revision: 2, company_name: name, registration_number: "", address: " ",
        email: null, phone: "", office_latitude: null, office_longitude: null });
      assert.equal(response.status, 200);
      const saved = (await response.json()).data;
      assert.equal(saved.company_name, name);
      for (const field of ["registration_number", "address", "email", "phone", "office_latitude", "office_longitude"]) assert.equal(saved[field], null);
      assert.deepEqual(await business(), afterFixtures);
    });
    await t.test("settings query failure returns a safe error without changing configuration", async () => {
      const original = appPool!.query.bind(appPool!);
      const queryMock = mock.method(appPool!, "query", async (sql: string, values?: unknown[]) => {
        if (sql.includes("public.company_settings")) throw new Error("private database details");
        return original(sql, values);
      });
      try {
        for (const [method, body] of [["GET", undefined], ["PUT", { ...payload, revision: 3 }]] as const) {
          const response = await call(method, body); assert.equal(response.status, 503);
          assert.doesNotMatch(await response.text(), /private database details|password|stack/i);
        }
      } finally { queryMock.mock.restore(); }
      assert.equal((await (await call("GET")).json()).data.revision, 3);
    });
    t.diagnostic(`Company Settings lab database: ${database}; migration 0002 SHA-256: ${second.checksum}`);
    suiteCompleted = true;
  } finally {
    if (server) await new Promise<void>((resolve) => server!.close(() => resolve()));
    if (settingsDirectory) await rm(settingsDirectory, { recursive: true, force: true });
    if (appPool) await appPool.end();
    if (fresh) await fresh.end();
    if (pool) await pool.end();
    await dropLabClones(admin, suffix, suiteCompleted, t);
    await admin.end();
  }
});
