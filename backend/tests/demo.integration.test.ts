import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { test } from "node:test";
import pg from "pg";
import { runMigrations } from "../src/database/migrations.js";
import {
  DEMO_ID_MAX,
  DEMO_ID_MIN,
  DEMO_PAYROLL_MONTH,
  DEMO_PAYROLL_YEAR,
  demoDepartments,
  demoEmployees,
} from "../src/database/demoData.js";
import { dropLabClones } from "./labClones.js";

const run = promisify(execFile);

// Explicit opt-in; the only permitted host is the isolated, internal Docker lab.
test("Demo data: reproducible, isolated and safe for protected rows", {
  skip: process.env.HR_NEXUS_DEMO_LAB !== "1", timeout: 300_000,
}, async (t) => {
  const suffix = randomBytes(5).toString("hex");
  const host = "hr-nexus-v2-migration-lab";
  const admin = new pg.Pool({ host, user: "postgres", database: "postgres" });
  const database = `hr_nexus_demo_${suffix}`;
  let pool: pg.Pool | undefined;

  const seedScript = fileURLToPath(new URL("../src/database/seedDemo.ts", import.meta.url));

  /** Runs the real seeding script exactly as an operator would. */
  const seed = async (extraArgs: string[] = [], environment: Record<string, string> = {}) =>
    run("npx", ["tsx", seedScript, "--database", database, ...extraArgs], {
      env: {
        ...process.env,
        DEMO_DATABASE_URL: `postgresql://postgres@${host}/${database}`,
        DEMO_PASSWORD: "demo-lab-password",
        ...environment,
      },
    });

  let suiteCompleted = false;
  try {
    await admin.query(`CREATE DATABASE "${database}" TEMPLATE hr_nexus_v2_settings_baseline`);
    pool = new pg.Pool({ host, user: "postgres", database });
    const db = pool;

    const orphansBefore = (await db.query(
      `SELECT id, employee_id FROM public.attendance a
       WHERE NOT EXISTS (SELECT 1 FROM public.employees e WHERE e.id = a.employee_id) ORDER BY id`,
    )).rows;
    const outsideBefore = (await db.query(
      `SELECT id, employee_number, full_name FROM public.employees
       WHERE id < $1 OR id > $2 ORDER BY id`,
      [DEMO_ID_MIN, DEMO_ID_MAX],
    )).rows;

    await runMigrations(db, { mode: "apply", database });

    // ------------------------------------------------------------- refusals

    await t.test("the seeder refuses to run without an explicit target", async () => {
      await assert.rejects(
        () => run("npx", ["tsx", seedScript, "--database", database], {
          env: { ...process.env, DEMO_DATABASE_URL: "" },
        }),
        /DEMO_DATABASE_URL is required/,
      );

      await assert.rejects(
        () => run("npx", ["tsx", seedScript], {
          env: {
            ...process.env,
            DEMO_DATABASE_URL: `postgresql://postgres@${host}/${database}`,
          },
        }),
        /--database <name> is required/,
      );
    });

    await t.test("a mismatched --database is refused rather than redirected", async () => {
      await assert.rejects(
        () => run("npx", ["tsx", seedScript, "--database", "some_other_database"], {
          env: {
            ...process.env,
            DEMO_DATABASE_URL: `postgresql://postgres@${host}/${database}`,
          },
        }),
        /but --database said/,
      );
    });

    await t.test("the application's own database needs an explicit flag", async () => {
      await assert.rejects(
        () => run("npx", ["tsx", seedScript, "--database", database], {
          env: {
            ...process.env,
            DEMO_DATABASE_URL: `postgresql://postgres@${host}/${database}`,
            // Pretend this target IS the configured application database.
            DATABASE_URL: `postgresql://postgres@${host}/${database}`,
          },
        }),
        /is the application's configured database/,
      );
    });

    // ------------------------------------------------------------- the load

    await t.test("a first run loads the whole fictional company", async () => {
      const { stdout } = await seed();
      const report = JSON.parse(stdout.slice(stdout.indexOf("{"), stdout.lastIndexOf("}") + 1));

      assert.equal(report.database, database);
      assert.equal(report.departments, demoDepartments.length);
      assert.equal(report.employees, demoEmployees.length);

      assert.equal(
        (await db.query(
          "SELECT count(*)::int AS c FROM public.employees WHERE id BETWEEN $1 AND $2",
          [DEMO_ID_MIN, DEMO_ID_MAX],
        )).rows[0].c,
        demoEmployees.length,
      );
      assert.ok(demoEmployees.length >= 20, "the brief asks for 20+ employees");
      assert.ok(
        demoDepartments.length >= 5 && demoDepartments.length <= 8,
        "the brief asks for roughly 5-8 departments",
      );

      // The demo has to make reports and dashboards worth looking at.
      const counts = (await db.query(
        `SELECT
           (SELECT count(*)::int FROM public.attendance WHERE employee_id BETWEEN $1 AND $2) AS attendance,
           (SELECT count(*)::int FROM public.leave_requests WHERE employee_id BETWEEN $1 AND $2) AS leave,
           (SELECT count(*)::int FROM public.leave_entitlements WHERE employee_id BETWEEN $1 AND $2) AS entitlements,
           (SELECT count(*)::int FROM public.employee_compensation WHERE employee_id BETWEEN $1 AND $2) AS compensation,
           (SELECT count(*)::int FROM public.payroll_records WHERE employee_id BETWEEN $1 AND $2) AS payslips,
           (SELECT count(*)::int FROM public.audit_events) AS audit`,
        [DEMO_ID_MIN, DEMO_ID_MAX],
      )).rows[0];

      assert.ok(counts.attendance > 100, `attendance history is thin: ${counts.attendance}`);
      assert.ok(counts.leave >= 8, `not enough leave requests: ${counts.leave}`);
      assert.ok(counts.entitlements > 0);
      assert.ok(counts.compensation >= 20);
      assert.ok(counts.payslips >= 20, `not enough payslips: ${counts.payslips}`);
      assert.ok(counts.audit > 0, "the demo should show audit activity");

      // A mix of statuses, so the workforce report is not one flat bar.
      const statuses = (await db.query(
        `SELECT employment_status, count(*)::int AS c FROM public.employees
         WHERE id BETWEEN $1 AND $2 GROUP BY 1`,
        [DEMO_ID_MIN, DEMO_ID_MAX],
      )).rows;
      assert.ok(statuses.length >= 3, "the demo needs a realistic mix of statuses");

      // Both leave states are present.
      const leaveStatuses = (await db.query(
        `SELECT DISTINCT status FROM public.leave_requests
         WHERE employee_id BETWEEN $1 AND $2 ORDER BY status`,
        [DEMO_ID_MIN, DEMO_ID_MAX],
      )).rows.map((row) => row.status);
      assert.ok(leaveStatuses.includes("approved"));
      assert.ok(leaveStatuses.includes("pending"));

      // Lateness, so the attendance report has something to report.
      assert.ok((await db.query(
        `SELECT count(*)::int AS c FROM public.attendance
         WHERE employee_id BETWEEN $1 AND $2 AND status = 'late'`,
        [DEMO_ID_MIN, DEMO_ID_MAX],
      )).rows[0].c > 0);
    });

    await t.test("the payroll period is approved with payslips, and is not September", async () => {
      const period = (await db.query(
        "SELECT period_year, period_month, status FROM public.payroll_periods",
      )).rows;
      assert.equal(period.length, 1);
      assert.equal(period[0].period_year, DEMO_PAYROLL_YEAR);
      assert.equal(period[0].period_month, DEMO_PAYROLL_MONTH);
      assert.equal(period[0].status, "approved");

      // September 2026 is reserved: the source database holds a draft period for
      // that month, and payroll periods are unique per month.
      assert.notEqual(DEMO_PAYROLL_MONTH, 9);
    });

    // -------------------------------------------------------- reproducibility

    await t.test("two freshly seeded databases hold byte-identical companies", async () => {
      const fingerprint = async (target: pg.Pool) => (await target.query(
        `SELECT
           (SELECT md5(COALESCE(jsonb_agg(to_jsonb(e) - 'created_at' - 'updated_at' ORDER BY e.id)::text,''))
            FROM public.employees e WHERE e.id BETWEEN $1 AND $2) AS employees,
           (SELECT md5(COALESCE(jsonb_agg(to_jsonb(a) - 'id' - 'created_at' - 'updated_at'
                                          ORDER BY a.employee_id, a.attendance_date)::text,''))
            FROM public.attendance a WHERE a.employee_id BETWEEN $1 AND $2) AS attendance,
           (SELECT md5(COALESCE(jsonb_agg(to_jsonb(l) - 'id' - 'created_at' - 'updated_at' - 'reviewed_at'
                                          - 'cancelled_at' ORDER BY l.employee_id, l.start_date)::text,''))
            FROM public.leave_requests l WHERE l.employee_id BETWEEN $1 AND $2) AS leave,
           (SELECT md5(COALESCE(jsonb_agg(to_jsonb(c) - 'id' - 'created_at' - 'updated_at'
                                          ORDER BY c.employee_id)::text,''))
            FROM public.employee_compensation c WHERE c.employee_id BETWEEN $1 AND $2) AS compensation,
           (SELECT COALESCE(SUM(net_sen), 0)::text FROM public.payroll_records) AS net`,
        [DEMO_ID_MIN, DEMO_ID_MAX],
      )).rows[0];

      // Determinism is "same input, same output on a fresh database". It is
      // deliberately NOT tested by re-running over an approved demo payroll:
      // approved payroll is immutable, and the seeder refuses rather than
      // working around a guarantee the product makes.
      const second = `hr_nexus_demo_twin_${suffix}`;
      await admin.query(`CREATE DATABASE "${second}" TEMPLATE hr_nexus_v2_settings_baseline`);
      const twin = new pg.Pool({ host, user: "postgres", database: second });

      try {
        await runMigrations(twin, { mode: "apply", database: second });
        await run("npx", ["tsx", seedScript, "--database", second], {
          env: {
            ...process.env,
            DEMO_DATABASE_URL: `postgresql://postgres@${host}/${second}`,
            DEMO_PASSWORD: "demo-lab-password",
          },
        });

        assert.deepEqual(
          await fingerprint(twin), await fingerprint(db),
          "the same dataset must appear on every freshly seeded database",
        );
      } finally {
        await twin.end();
      }
    });

    await t.test("re-seeding over approved demo payroll is refused, not worked around", async () => {
      await assert.rejects(() => seed(), /approved payroll is immutable by design/i);

      // And the refusal changed nothing.
      assert.equal(
        (await db.query(
          "SELECT count(*)::int AS c FROM public.employees WHERE id BETWEEN $1 AND $2",
          [DEMO_ID_MIN, DEMO_ID_MAX],
        )).rows[0].c,
        demoEmployees.length,
      );
    });

    // -------------------------------------------------------------- safety

    await t.test("nothing outside the demo range is touched, orphans included", async () => {
      assert.deepEqual(
        (await db.query(
          `SELECT id, employee_id FROM public.attendance a
           WHERE NOT EXISTS (SELECT 1 FROM public.employees e WHERE e.id = a.employee_id) ORDER BY id`,
        )).rows,
        orphansBefore,
      );
      assert.deepEqual(
        (await db.query(
          `SELECT id, employee_number, full_name FROM public.employees
           WHERE id < $1 OR id > $2 ORDER BY id`,
          [DEMO_ID_MIN, DEMO_ID_MAX],
        )).rows,
        outsideBefore,
      );
    });

    await t.test("no plaintext password is stored, and the data is clearly fictional", async () => {
      const accounts = (await db.query(
        "SELECT email, password_hash FROM public.users WHERE id BETWEEN $1 AND $2",
        [DEMO_ID_MIN, DEMO_ID_MAX],
      )).rows;
      assert.ok(accounts.length >= 2, "the demo needs an admin and an employee account");

      for (const account of accounts) {
        assert.notEqual(account.password_hash, "demo-lab-password");
        assert.match(account.password_hash, /^\$2[aby]\$\d\d\$/, "only a bcrypt hash may be stored");
        // RFC 2606 reserves .invalid so it can never resolve to a real mailbox.
        assert.match(account.email, /@[a-z0-9.-]+\.invalid$/);
      }

      // No placeholder names of the kind the brief rules out.
      const names = (await db.query(
        "SELECT full_name FROM public.employees WHERE id BETWEEN $1 AND $2",
        [DEMO_ID_MIN, DEMO_ID_MAX],
      )).rows.map((row) => row.full_name);
      for (const name of names) {
        assert.doesNotMatch(name, /^(test|user|asdf|foo|bar)\b/i, `placeholder name: ${name}`);
        assert.doesNotMatch(name, /^\d+$/);
        assert.ok(name.trim().split(/\s+/).length >= 2, `not a realistic name: ${name}`);
      }
    });

    await t.test("the seed refuses a database that has not been migrated far enough", async () => {
      const bare = `hr_nexus_demo_bare_${suffix}`;
      await admin.query(`CREATE DATABASE "${bare}" TEMPLATE hr_nexus_v2_settings_baseline`);
      await assert.rejects(
        () => run("npx", ["tsx", seedScript, "--database", bare], {
          env: {
            ...process.env,
            DEMO_DATABASE_URL: `postgresql://postgres@${host}/${bare}`,
            DEMO_PASSWORD: "demo-lab-password",
          },
        }),
        /missing migration 0007/,
      );
    });

    suiteCompleted = true;
  } finally {
    if (pool) await pool.end();
    await dropLabClones(admin, suffix, suiteCompleted, t);
    await admin.end();
  }
});
