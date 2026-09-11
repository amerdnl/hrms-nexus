import assert from "node:assert/strict";
import { test } from "node:test";
import bcrypt from "bcrypt";
import { loadMigrations } from "../src/database/migrations.js";
import { getZonedNow } from "../src/utils/attendanceVerification.js";
import { withLab } from "./labHarness.js";

// Explicit opt-in; the only permitted host is the isolated, internal Docker lab.
test("V3 foundation: laboratory harness and the shared company clock", {
  skip: process.env.HR_NEXUS_V3_LAB !== "1", timeout: 180_000,
}, async (t) => {
  await withLab(t, { label: "v3_foundation" }, async (lab) => {
    const { db } = lab;

    await t.test("the harness applies every migration in the chain, in order", async () => {
      const files = (await loadMigrations()).map((migration) => migration.version);
      const ledger = (await db.query("SELECT version FROM public.schema_migrations ORDER BY version"))
        .rows.map((row) => row.version);
      assert.deepEqual(ledger, files);
    });

    await t.test("the five protected orphan attendance rows survive the whole chain", async () => {
      const orphans = (await db.query(
        `SELECT id::int, employee_id::int FROM public.attendance a
         WHERE NOT EXISTS (SELECT 1 FROM public.employees e WHERE e.id = a.employee_id)
         ORDER BY id`,
      )).rows;
      assert.deepEqual(orphans, [
        { id: 1, employee_id: 1 }, { id: 3, employee_id: 1 }, { id: 4, employee_id: 2 },
        { id: 5, employee_id: 1 }, { id: 6, employee_id: 1 },
      ]);
    });

    await db.query(
      `INSERT INTO public.users (id, employee_id, email, password_hash, role, is_active)
       VALUES (9900, NULL, 'clock-admin@example.invalid', $1, 'admin', TRUE)`,
      [await bcrypt.hash("unused-lab-password", 4)],
    );
    const admin = lab.sign(9900, "admin", null);

    await t.test("dashboards use the company's configured zone, not the server's", async () => {
      // UTC+14: the zone most likely to be on a different date from the server.
      await db.query("UPDATE public.company_settings SET timezone = 'Pacific/Kiritimati' WHERE id = 1");
      const { status, body } = await lab.json<{ data: { today: string } }>("GET", "/dashboard/admin", admin);
      assert.equal(status, 200);
      assert.equal(body.data.today, getZonedNow("Pacific/Kiritimati").date);
    });

    await t.test("an unrecognised zone falls back to UTC instead of failing the read", async () => {
      // The column only requires non-empty text; the API validates on write.
      await db.query("UPDATE public.company_settings SET timezone = 'Mars/Olympus' WHERE id = 1");
      const { status, body } = await lab.json<{ data: { today: string } }>("GET", "/dashboard/admin", admin);
      assert.equal(status, 200);
      assert.equal(body.data.today, getZonedNow("UTC").date);
    });

    await t.test("the harness refuses nothing it should not: anonymous access is still 401", async () => {
      assert.equal((await lab.call("GET", "/dashboard/admin")).status, 401);
    });
  });
});
