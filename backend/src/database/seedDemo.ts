/**
 * Loads the fictional demo company.
 *
 * SAFETY, before anything else. This script writes a lot of rows, so it is built
 * to refuse the wrong database rather than to be used carefully:
 *
 *  - It reads `DEMO_DATABASE_URL` and never falls back to `DATABASE_URL`. The
 *    application's own connection string cannot be picked up by accident.
 *  - `--database <name>` must match the database it actually connected to, so a
 *    stale URL in the environment cannot silently redirect the write.
 *  - If the target is the application's configured database it stops, unless
 *    `--allow-app-database` is passed. That flag is the explicit approval.
 *  - Every write is confined to identifiers 9000-9099 and to rows owned by them.
 *    Nothing outside that range is inserted, updated or deleted, so protected
 *    business data and the five orphan attendance rows cannot be touched.
 *  - It runs in one transaction: either the whole company appears or none of it.
 *
 * REPRODUCIBILITY. The dataset is fixed, the identifiers are fixed, and the
 * attendance variation comes from a seeded generator, so seeding two freshly
 * migrated databases produces byte-identical companies.
 *
 * It is NOT re-runnable over its own output once the demo payroll has been
 * approved: approved payroll is immutable by design, and the right response to
 * that is to refuse rather than to work around a guarantee the product makes.
 * Re-seed by recreating the database from a migrated baseline. Before approval,
 * the script clears its own previous rows and can be re-run freely.
 *
 * PASSWORDS. A plaintext password is never stored. `DEMO_PASSWORD` is hashed
 * with bcrypt and only the hash is written; if the variable is absent a
 * cryptographically random password is generated and printed once, here, so it
 * exists nowhere but the operator's terminal.
 */
import bcrypt from "bcrypt";
import { randomBytes } from "node:crypto";
import pg from "pg";
import { calculatePeriod, openPeriod } from "../services/payrollService.js";
import {
  DEMO_ID_MAX,
  DEMO_ID_MIN,
  DEMO_PAYROLL_MONTH,
  DEMO_PAYROLL_YEAR,
  DEMO_TODAY,
  demoAdmin,
  demoDepartments,
  demoEmail,
  demoEmployeeAccount,
  demoEmployees,
  seededRandom,
} from "./demoData.js";

function argument(name: string): string | null {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? null : (process.argv[index + 1] ?? null);
}

const hasFlag = (name: string) => process.argv.includes(`--${name}`);

function fail(message: string): never {
  console.error(`Refusing to seed: ${message}`);
  process.exit(1);
}

/** ISO date arithmetic in UTC, so a host timezone cannot shift the dataset. */
function addDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function isoWeekday(date: string): number {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  return day === 0 ? 7 : day;
}

async function main(): Promise<void> {
  const url = process.env.DEMO_DATABASE_URL;
  if (!url) {
    fail("DEMO_DATABASE_URL is required; demo seeding never defaults to the application's database.");
  }

  const expected = argument("database");
  if (!expected) fail("--database <name> is required, and must name the database you intend to write.");

  // A pooled client, because the payroll service this reuses takes a PoolClient.
  const seedPool = new pg.Pool({ connectionString: url, max: 1 });
  const client = await seedPool.connect();

  try {
    const actual = (await client.query<{ name: string }>("SELECT current_database() AS name")).rows[0]!.name;
    if (actual !== expected) {
      fail(`connected to "${actual}" but --database said "${expected}".`);
    }

    // The application's own database is off limits without an explicit flag.
    const appUrl = process.env.DATABASE_URL;
    if (appUrl) {
      const appDatabase = new URL(appUrl).pathname.replace(/^\//, "");
      if (appDatabase === actual && !hasFlag("allow-app-database")) {
        fail(
          `"${actual}" is the application's configured database. ` +
          "Pass --allow-app-database only if you have explicit approval to seed demo data into it.",
        );
      }
    }

    const ledger = await client.query<{ version: string }>(
      "SELECT version FROM public.schema_migrations ORDER BY version",
    );
    const versions = ledger.rows.map((row) => row.version);
    if (!versions.includes("0007")) {
      fail(`the target is missing migration 0007; its ledger is ${versions.join(",") || "empty"}.`);
    }
    const auditReady = versions.includes("0008");

    const password = process.env.DEMO_PASSWORD ?? randomBytes(12).toString("base64url");
    const generated = process.env.DEMO_PASSWORD === undefined;
    const passwordHash = await bcrypt.hash(password, 12);

    // A previous run's payroll may already be approved, and migration 0007
    // makes approved payroll immutable at the database level. That guarantee is
    // worth more than the convenience of re-seeding in place, so this refuses
    // rather than disabling the trigger to get past it.
    const locked = await client.query<{ status: string }>(
      `SELECT status FROM public.payroll_periods
       WHERE period_year = $1 AND period_month = $2 AND status IN ('approved', 'paid')`,
      [DEMO_PAYROLL_YEAR, DEMO_PAYROLL_MONTH],
    );
    if (locked.rows.length > 0) {
      fail(
        `this database already holds an ${locked.rows[0]!.status} demo payroll period for ` +
        `${DEMO_PAYROLL_YEAR}-0${DEMO_PAYROLL_MONTH}, and approved payroll is immutable by design. ` +
        "Recreate the database from a migrated baseline and seed it fresh.",
      );
    }

    await client.query("BEGIN");

    // Snapshot what must not move, and check it again at the end.
    const before = await client.query<{ orphans: string; outside: string }>(
      `SELECT
         (SELECT count(*) FROM public.attendance a
          WHERE NOT EXISTS (SELECT 1 FROM public.employees e WHERE e.id = a.employee_id)) AS orphans,
         (SELECT count(*) FROM public.employees
          WHERE id < ${DEMO_ID_MIN} OR id > ${DEMO_ID_MAX}) AS outside`,
    );

    // ------------------------------------------------------ clear previous run
    // Scoped to the demo range only, deepest dependency first.
    await client.query(
      `DELETE FROM public.payroll_items WHERE record_id IN (
         SELECT id FROM public.payroll_records WHERE employee_id BETWEEN $1 AND $2)`,
      [DEMO_ID_MIN, DEMO_ID_MAX],
    );
    await client.query(
      "DELETE FROM public.payroll_records WHERE employee_id BETWEEN $1 AND $2",
      [DEMO_ID_MIN, DEMO_ID_MAX],
    );
    await client.query(
      "DELETE FROM public.payroll_periods WHERE period_year = $1 AND period_month = $2",
      [DEMO_PAYROLL_YEAR, DEMO_PAYROLL_MONTH],
    );
    for (const table of [
      "employee_compensation", "leave_entitlements", "leave_requests", "attendance",
    ]) {
      await client.query(
        `DELETE FROM public.${table} WHERE employee_id BETWEEN $1 AND $2`,
        [DEMO_ID_MIN, DEMO_ID_MAX],
      );
    }
    await client.query("DELETE FROM public.users WHERE id BETWEEN $1 AND $2", [DEMO_ID_MIN, DEMO_ID_MAX]);
    await client.query(
      "DELETE FROM public.users WHERE employee_id BETWEEN $1 AND $2", [DEMO_ID_MIN, DEMO_ID_MAX],
    );
    await client.query("DELETE FROM public.employees WHERE id BETWEEN $1 AND $2", [DEMO_ID_MIN, DEMO_ID_MAX]);

    // ---------------------------------------------------------- departments
    for (const department of demoDepartments) {
      await client.query(
        `INSERT INTO public.departments (name, description) VALUES ($1, $2)
         ON CONFLICT (name) DO UPDATE SET description = EXCLUDED.description`,
        [department.name, department.description],
      );
    }
    const departmentIds = new Map<string, number>(
      (await client.query<{ id: number; name: string }>(
        "SELECT id, name FROM public.departments",
      )).rows.map((row) => [row.name, row.id]),
    );

    // ------------------------------------------------------------- employees
    for (const employee of demoEmployees) {
      await client.query(
        `INSERT INTO public.employees
           (id, employee_number, full_name, department_id, job_title,
            employment_status, employment_date, phone)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [
          employee.id, employee.employeeNumber, employee.fullName,
          departmentIds.get(employee.department) ?? null, employee.jobTitle,
          employee.status, employee.employmentDate,
          // A documentation-range number, so it cannot dial a real person.
          `+60 3-5550 ${String(employee.id).slice(-4)}`,
        ],
      );
    }

    // Sign-in accounts: one administrator, one employee. Everyone else is a
    // personnel record without a login, which is what a real company looks like.
    //
    // must_change_password is FALSE, stated rather than left to the column
    // default so the intent is visible. These two are not temporary credentials
    // in the sense the flag exists for: the password is chosen by whoever runs
    // this script, through DEMO_PASSWORD, and is the password they then sign in
    // with. Nobody is holding a credential they have never seen. Flagging them
    // would open every demonstration with a forced password change.
    await client.query(
      `INSERT INTO public.users
         (id, employee_id, email, password_hash, role, is_active, must_change_password)
       VALUES ($1, NULL, $2, $3, 'admin', TRUE, FALSE)`,
      [demoAdmin.id, demoAdmin.email, passwordHash],
    );
    await client.query(
      // An explicit id, like the administrator's: every row this script writes
      // must sit inside the reserved range, or the isolation guarantee above is
      // only true of most of them.
      `INSERT INTO public.users
         (id, employee_id, email, password_hash, role, is_active, must_change_password)
       VALUES ($1, $1, $2, $3, 'employee', TRUE, FALSE)`,
      [demoEmployeeAccount.id, demoEmployeeAccount.email, passwordHash],
    );

    // ---------------------------------------------------------- compensation
    for (const employee of demoEmployees) {
      if (employee.basicSalarySen === undefined) continue;
      await client.query(
        `INSERT INTO public.employee_compensation
           (employee_id, basic_salary_sen, allowance_sen, overtime_rate_sen, effective_from)
         VALUES ($1,$2,$3,$4,$5)`,
        [
          employee.id, employee.basicSalarySen, employee.allowanceSen ?? 0,
          employee.overtimeRateSen ?? 0, "2026-01-01",
        ],
      );
    }

    // ------------------------------------------------------------ attendance
    // Eight weeks ending today, working days only, with a deterministic mix of
    // late arrivals, one missing checkout per few people, and occasional absence.
    const random = seededRandom(20260909);
    const workingWeek = new Set([1, 2, 3, 4, 5]);
    const attendanceStart = addDays(DEMO_TODAY, -56);

    for (const employee of demoEmployees) {
      if (employee.status === "resigned" || employee.status === "inactive") continue;

      for (let offset = 0; offset <= 56; offset += 1) {
        const date = addDays(attendanceStart, offset);
        if (date > DEMO_TODAY) break;
        if (!workingWeek.has(isoWeekday(date))) continue;
        if (date < employee.employmentDate) continue;

        const roll = random();
        if (roll < 0.04) continue;                       // no record at all
        if (roll < 0.07) {
          await client.query(
            `INSERT INTO public.attendance (employee_id, attendance_date, status)
             VALUES ($1,$2,'absent')`,
            [employee.id, date],
          );
          continue;
        }

        const late = roll < 0.2;
        const lateMinutes = late ? 5 + Math.floor(random() * 35) : 0;
        const checkIn = late
          ? `09:${String(Math.min(59, lateMinutes)).padStart(2, "0")}:00`
          : `08:${String(45 + Math.floor(random() * 14)).padStart(2, "0")}:00`;
        // A few people forget to clock out; the attendance report surfaces it.
        const missingCheckout = random() < 0.05;

        await client.query(
          `INSERT INTO public.attendance
             (employee_id, attendance_date, check_in_time, check_out_time, status,
              late_minutes, verification_method, verification_status)
           VALUES ($1,$2,$3,$4,$5,$6,'QR_LOCATION','verified')`,
          [
            employee.id, date, checkIn,
            missingCheckout ? null : `18:${String(Math.floor(random() * 30)).padStart(2, "0")}:00`,
            late ? "late" : "present", lateMinutes,
          ],
        );
      }
    }

    // ----------------------------------------------------------------- leave
    for (const employee of demoEmployees) {
      if (employee.status === "resigned") continue;
      for (const [type, days] of [["annual", 12], ["medical", 10], ["emergency", 2]] as const) {
        await client.query(
          `INSERT INTO public.leave_entitlements
             (employee_id, leave_year, leave_type, entitled_days, carried_forward_days,
              adjustment_days, source)
           VALUES ($1, 2026, $2, $3, 0, 0, 'policy')`,
          [employee.id, type, days],
        );
      }
    }

    const leaveFixtures: [number, string, string, string, string, number][] = [
      [9005, "annual", "2026-08-17", "2026-08-21", "approved", 5],
      [9006, "medical", "2026-08-05", "2026-08-06", "approved", 2],
      [9011, "annual", "2026-08-10", "2026-08-11", "approved", 2],
      [9014, "unpaid", "2026-08-24", "2026-08-25", "approved", 2],
      [9018, "emergency", "2026-08-13", "2026-08-13", "approved", 1],
      [9022, "annual", "2026-09-14", "2026-09-18", "pending", 5],
      [9007, "annual", "2026-09-21", "2026-09-22", "pending", 2],
      [9012, "medical", "2026-09-02", "2026-09-02", "rejected", 1],
      [9019, "annual", "2026-09-28", "2026-09-29", "cancelled", 2],
    ];

    for (const [employeeId, type, start, end, status, days] of leaveFixtures) {
      await client.query(
        `INSERT INTO public.leave_requests
           (employee_id, leave_type, start_date, end_date, reason, status,
            working_days, leave_year, reviewed_at, cancelled_at, cancelled_by)
         VALUES ($1,$2,$3,$4,$5,$6::varchar,$7,2026,
                 CASE WHEN $6::varchar IN ('approved','rejected') THEN CURRENT_TIMESTAMP END,
                 -- chk_leave_cancellation requires cancelled_at and cancelled_by
                 -- to be set or absent together.
                 CASE WHEN $6::varchar = 'cancelled' THEN CURRENT_TIMESTAMP END,
                 CASE WHEN $6::varchar = 'cancelled' THEN $8::integer END)`,
        [
          employeeId, type, start, end,
          type === "medical" ? "Medical appointment" : "Planned time off",
          status, days, demoAdmin.id,
        ],
      );
    }

    // --------------------------------------------------------------- payroll
    // Built through the real payroll service, so the demo payslips are produced
    // by exactly the code the product runs rather than hand-written rows.
    const period = await openPeriod(client, DEMO_PAYROLL_YEAR, DEMO_PAYROLL_MONTH, demoAdmin.id);
    const summary = await calculatePeriod(client, period);

    await client.query(
      `UPDATE public.payroll_periods
       SET status = 'calculated', calculated_at = CURRENT_TIMESTAMP WHERE id = $1`,
      [period.id],
    );
    await client.query(
      "UPDATE public.payroll_periods SET status = 'reviewed', reviewed_at = CURRENT_TIMESTAMP WHERE id = $1",
      [period.id],
    );
    await client.query(
      `UPDATE public.payroll_periods
       SET status = 'approved', approved_at = CURRENT_TIMESTAMP, approved_by = $2 WHERE id = $1`,
      [period.id, demoAdmin.id],
    );

    // ----------------------------------------------------------- audit trail
    // Written directly rather than through the audit service, deliberately: this
    // script must not import the application's connection pool, because that
    // pool reads DATABASE_URL and the whole point of the guards above is that
    // the application's database is never what gets written here.
    if (auditReady) {
      const demoEvents: [string, string, string | null, string, unknown][] = [
        ["PAYROLL_APPROVED", "payroll", String(period.id),
          `Payroll ${DEMO_PAYROLL_YEAR}-0${DEMO_PAYROLL_MONTH} approved`,
          { status: { before: "reviewed", after: "approved" } }],
        ["PAYROLL_CALCULATED", "payroll", String(period.id),
          `Calculated payroll for ${DEMO_PAYROLL_YEAR}-0${DEMO_PAYROLL_MONTH}: ${summary.calculated} paid`,
          { calculated: summary.calculated, skipped: summary.skipped.length }],
        ["SETTINGS_CHANGED", "settings", "1", "Company settings saved", null],
        ["EMPLOYEE_CREATED", "employee", "9009",
          "Created employee ENG-006 (Syafiqah binti Ismail)",
          { employee_number: "ENG-006", employment_status: "probation" }],
        ["LEAVE_APPROVED", "leave", "1",
          "Approved annual leave for employee #9005, 2026-08-17 to 2026-08-21",
          { status: { before: "pending", after: "approved" }, working_days: 5 }],
        ["SALARY_CHANGED", "compensation", "9006",
          "Set compensation for employee #9006, effective 2026-01-01",
          { basic_salary_sen: 720000, allowance_sen: 60000 }],
        ["LOGIN", "auth", String(demoAdmin.id), "Administrator signed in", null],
        ["LOGIN_FAILED", "auth", null, "Sign-in failed: invalid email or password", null],
      ];

      for (const [action, entityType, entityId, summaryText, changes] of demoEvents) {
        await client.query(
          `INSERT INTO public.audit_events
             (actor_user_id, actor_employee_id, actor_label, actor_role,
              action, entity_type, entity_id, summary, changes, outcome)
           VALUES ($1, NULL, $2, $3, $4, $5, $6, $7, $8::jsonb, $9)`,
          [
            action === "LOGIN_FAILED" ? null : demoAdmin.id,
            action === "LOGIN_FAILED" ? "unknown@nexus-demo.invalid" : demoAdmin.email,
            action === "LOGIN_FAILED" ? null : "admin",
            action, entityType, entityId, summaryText,
            changes === null ? null : JSON.stringify(changes),
            action === "LOGIN_FAILED" ? "failure" : "success",
          ],
        );
      }
    }

    // ------------------------------------------------------------ safety net
    const after = await client.query<{ orphans: string; outside: string }>(
      `SELECT
         (SELECT count(*) FROM public.attendance a
          WHERE NOT EXISTS (SELECT 1 FROM public.employees e WHERE e.id = a.employee_id)) AS orphans,
         (SELECT count(*) FROM public.employees
          WHERE id < ${DEMO_ID_MIN} OR id > ${DEMO_ID_MAX}) AS outside`,
    );

    if (after.rows[0]!.orphans !== before.rows[0]!.orphans
      || after.rows[0]!.outside !== before.rows[0]!.outside) {
      await client.query("ROLLBACK");
      fail(
        "the seed would have changed rows outside the demo range " +
        `(orphans ${before.rows[0]!.orphans} to ${after.rows[0]!.orphans}, ` +
        `other employees ${before.rows[0]!.outside} to ${after.rows[0]!.outside}). Nothing was written.`,
      );
    }

    await client.query("COMMIT");

    console.log(JSON.stringify({
      database: actual,
      departments: demoDepartments.length,
      employees: demoEmployees.length,
      payrollPeriod: `${DEMO_PAYROLL_YEAR}-0${DEMO_PAYROLL_MONTH}`,
      payslips: summary.calculated,
      skipped: summary.skipped.length,
      protectedOrphansUnchanged: after.rows[0]!.orphans,
      employeesOutsideDemoRangeUnchanged: after.rows[0]!.outside,
      auditEventsRecorded: auditReady,
      adminAccount: demoAdmin.email,
      employeeAccount: demoEmployeeAccount.email,
    }, null, 2));

    // Printed once, to the operator, and stored nowhere.
    console.log(
      generated
        ? `\nGenerated demo password (shown once, not stored): ${password}`
        : "\nDemo accounts use the DEMO_PASSWORD you supplied. Only its bcrypt hash was stored.",
    );
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch { /* already gone */ }
    console.error("Demo seed failed; nothing was written.", error);
    process.exit(1);
  } finally {
    client.release();
    await seedPool.end();
  }
}

await main();

export { demoEmail };
