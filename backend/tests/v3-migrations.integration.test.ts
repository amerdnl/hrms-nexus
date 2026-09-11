import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { access, readFile } from "node:fs/promises";
import { test } from "node:test";
import pg from "pg";
import { loadMigrations, runMigrations } from "../src/database/migrations.js";
import { dropLabClones } from "./labClones.js";
import { applyMigrationsUpTo, businessSnapshot, LAB_HOST, withLab } from "./labHarness.js";

/** Every V3 migration comes after the protected V2 chain, 0001-0009. */
const FIRST_V3 = "0010";

const rollbackFor = (filename: string) =>
  new URL(`../../docs/sql/rollback_${filename}`, import.meta.url);

/** The previous version number, zero-padded, e.g. "0011" -> "0010". */
const previous = (version: string) => String(Number(version) - 1).padStart(4, "0");

// Explicit opt-in; the only permitted host is the isolated, internal Docker lab.
test("V3 migrations: each is additive, idempotent and reversible by its reviewed rollback", {
  skip: process.env.HR_NEXUS_V3_LAB !== "1", timeout: 300_000,
}, async (t) => {
  const v3 = (await loadMigrations()).filter((migration) => migration.version >= FIRST_V3);
  assert.ok(v3.length > 0);

  for (const migration of v3) {
    await t.test(`${migration.filename}`, async (st) => {
      await withLab(st, { label: `v3_mig_${migration.version}`, migrate: false, withApp: false }, async (lab) => {
        const { db, database } = lab;
        await applyMigrationsUpTo(db, database, previous(migration.version));
        const before = await businessSnapshot(db);
        const protectedBefore = await lab.protectedRows();
        const objectsBefore = (await db.query(
          `SELECT c.relname, c.relkind FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
           WHERE n.nspname = 'public' ORDER BY 1`,
        )).rows;

        // Additive against the state immediately before it.
        const applied = await applyMigrationsUpTo(db, database, migration.version);
        assert.deepEqual(applied, [migration.version]);
        assert.deepEqual(await businessSnapshot(db, before), before, "no business row, value or sequence may change");
        assert.deepEqual(await lab.protectedRows(), protectedBefore, "the protected rows are untouched");
        assert.deepEqual(
          (await db.query("SELECT filename, checksum FROM public.schema_migrations WHERE version = $1", [migration.version])).rows,
          [{ filename: migration.filename, checksum: migration.checksum }],
        );

        // Idempotent.
        assert.deepEqual(await applyMigrationsUpTo(db, database, migration.version), []);

        // Its reviewed rollback removes exactly what it added, and nothing else.
        await access(rollbackFor(migration.filename));
        const rollback = await readFile(rollbackFor(migration.filename), "utf8");
        const client = await db.connect();
        try {
          await client.query("BEGIN");
          await client.query(rollback);
          const objectsAfter = (await client.query(
            `SELECT c.relname, c.relkind FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
             WHERE n.nspname = 'public' ORDER BY 1`,
          )).rows;
          assert.deepEqual(objectsAfter, objectsBefore, "the rollback leaves exactly the relations that existed before");
          assert.equal((await client.query(
            "SELECT count(*)::int AS c FROM public.schema_migrations WHERE version = $1", [migration.version],
          )).rows[0].c, 0);
        } finally {
          await client.query("ROLLBACK");
          client.release();
        }
      });
    });
  }

  await t.test("the whole chain applies to a fresh schema.sql database without seeds", async () => {
    const suffix = randomBytes(5).toString("hex");
    const admin = new pg.Pool({ host: LAB_HOST, user: "postgres", database: "postgres" });
    const name = `hr_nexus_v3_fresh_${suffix}`;
    let completed = false;
    const pool = new pg.Pool({ host: LAB_HOST, user: "postgres", database: name });
    try {
      await admin.query(`CREATE DATABASE "${name}" TEMPLATE template0`);
      await pool.query(await readFile(new URL("../../database/schema.sql", import.meta.url), "utf8"));
      const result = await runMigrations(pool, { mode: "apply", database: name });
      assert.deepEqual(result.newlyApplied, (await loadMigrations()).map((m) => m.version));
      // The fresh baseline uses BIGINT employee ids; the V3 references still work.
      await pool.query(`INSERT INTO public.departments (name) VALUES ('Fresh');
        INSERT INTO public.employees (employee_number, full_name, department_id)
          VALUES ('F-1', 'Fresh One', 1), ('F-2', 'Fresh Two', 1);
        UPDATE public.employees SET manager_id = 1 WHERE id = 2;`);
      completed = true;
    } finally {
      await pool.end();
      await dropLabClones(admin, suffix, completed, t);
      await admin.end();
    }
  });
});
