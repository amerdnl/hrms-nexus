import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { once } from "node:events";
import { test } from "node:test";
import jwt from "jsonwebtoken";
import pg from "pg";
import { runMigrations } from "../src/database/migrations.js";
import { parseCsv } from "../src/utils/spreadsheet.js";
import { dropLabClones } from "./labClones.js";

// Explicit opt-in; the only permitted host is the isolated, internal Docker lab.
// Every write below happens in a disposable clone, never in the source database.
test("Reports V1: company-wide reporting, exports and authorization", {
  skip: process.env.HR_NEXUS_REPORTS_LAB !== "1", timeout: 240_000,
}, async (t) => {
  const suffix = randomBytes(5).toString("hex");
  const host = "hr-nexus-v2-migration-lab";
  const admin = new pg.Pool({ host, user: "postgres", database: "postgres" });
  const database = `hr_nexus_reports_${suffix}`;
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

    await runMigrations(db, { mode: "apply", database });

    // ------------------------------------------------------- synthetic data

    await db.query(
      `INSERT INTO public.departments (name, description)
       VALUES ('Reports Engineering','Lab'), ('Reports Finance','Lab')
       ON CONFLICT (name) DO NOTHING;

       INSERT INTO public.employees
         (id, employee_number, full_name, department_id, employment_status, job_title)
       VALUES
         (9700, 'RPT-1', 'Aisyah Rahman',
          (SELECT id FROM public.departments WHERE name='Reports Engineering'), 'active', 'Engineer'),
         (9701, 'RPT-2', 'Daniel Tan',
          (SELECT id FROM public.departments WHERE name='Reports Finance'), 'active', 'Analyst'),
         (9702, 'RPT-3', 'Siti Nurhaliza',
          (SELECT id FROM public.departments WHERE name='Reports Engineering'), 'probation', 'Intern'),
         -- A deliberately hostile name: it must never reach a spreadsheet as a formula.
         (9703, 'RPT-4', '=cmd|'' /C calc''!A0',
          (SELECT id FROM public.departments WHERE name='Reports Finance'), 'resigned', 'Former');

       INSERT INTO public.users (id, employee_id, email, password_hash, role, is_active)
       VALUES (9700, NULL, 'rpt-admin@example.invalid', 'unusable-lab-hash', 'admin', TRUE),
              (9701, 9700, 'rpt-one@example.invalid', 'unusable-lab-hash', 'employee', TRUE);

       UPDATE public.company_settings
         SET timezone='Asia/Kuala_Lumpur', working_days=ARRAY[1,2,3,4,5]::smallint[] WHERE id=1;

       -- Attendance across two months, so the range filter has something to cut.
       INSERT INTO public.attendance
         (employee_id, attendance_date, check_in_time, check_out_time, status, late_minutes,
          check_in_latitude, check_in_longitude, check_in_accuracy_meters, check_in_distance_meters)
       VALUES
         (9700, '2026-09-01', '09:00', '18:00', 'present', 0, 3.139, 101.686, 12.5, 20.0),
         (9700, '2026-09-02', '09:25', '18:00', 'late', 25, 3.139, 101.686, 12.5, 20.0),
         (9700, '2026-09-03', '09:10', NULL,   'late', 10, 3.139, 101.686, 12.5, 20.0),
         (9701, '2026-09-01', '08:55', '17:30', 'present', 0, NULL, NULL, NULL, NULL),
         (9701, '2026-09-02', NULL,    NULL,    'absent', NULL, NULL, NULL, NULL, NULL),
         (9700, '2026-08-15', '09:40', '18:00', 'late', 40, NULL, NULL, NULL, NULL);

       INSERT INTO public.leave_requests
         (employee_id, leave_type, start_date, end_date, reason, status, working_days, leave_year)
       VALUES
         (9700, 'annual',  '2026-09-10', '2026-09-11', 'Trip',   'approved', 2, 2026),
         (9701, 'medical', '2026-09-15', '2026-09-15', 'Unwell', 'approved', 1, 2026),
         (9701, 'annual',  '2026-09-20', '2026-09-21', 'Away',   'pending',  2, 2026),
         (9700, 'annual',  '2026-08-03', '2026-08-04', 'Older',  'approved', 2, 2026);

       INSERT INTO public.leave_entitlements
         (employee_id, leave_year, leave_type, entitled_days, carried_forward_days, adjustment_days, source)
       VALUES (9700, 2026, 'annual', 12, 0, 0, 'policy'),
              (9701, 2026, 'annual', 12, 0, 0, 'policy'),
              (9701, 2026, 'medical', 10, 0, 0, 'policy');

       INSERT INTO public.employee_compensation
         (employee_id, basic_salary_sen, allowance_sen, overtime_rate_sen, effective_from)
       VALUES (9700, 300000, 25000, 2050, '2026-01-01'),
              (9701, 450000, 50000, 3000, '2026-01-01');`,
    );

    // A calculated payroll period, built through the real service so the report
    // is read against records the application itself produced.
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
      subject: "9700", expiresIn: "40m",
    });
    const employeeToken = jwt.sign({ role: "employee", employeeId: 9700 }, process.env.JWT_SECRET, {
      subject: "9701", expiresIn: "40m",
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

    const period = await (await call("POST", "/payroll/periods", { year: 2026, month: 9 })).json();
    const periodId = period.data.period.id;
    await call("POST", `/payroll/periods/${periodId}/calculate`);

    // ------------------------------------------------------- authorization

    await t.test("company-wide reports and every export are administrator-only", async () => {
      const endpoints = [
        "/reports/workforce", "/reports/workforce/export",
        "/reports/attendance", "/reports/attendance/export",
        "/reports/leave", "/reports/leave/export", "/reports/leave/balances/export",
        `/reports/payroll/${periodId}`, `/reports/payroll/${periodId}/export`,
      ];

      for (const endpoint of endpoints) {
        assert.equal((await call("GET", endpoint, undefined, null)).status, 401,
          `${endpoint} must reject anonymous access`);
        assert.equal((await call("GET", endpoint, undefined, employeeToken)).status, 403,
          `${endpoint} must reject an employee`);
      }
    });

    await t.test("an export is not a weaker door than the report it exports", async () => {
      // The concern is a download URL that skips the guard the JSON route has.
      const report = await call("GET", `/reports/payroll/${periodId}`, undefined, employeeToken);
      const exported = await call("GET", `/reports/payroll/${periodId}/export`, undefined, employeeToken);
      assert.equal(report.status, exported.status);
      assert.equal(exported.status, 403);
      // And nothing payroll-shaped leaked into the refusal body.
      assert.doesNotMatch(await exported.text(), /net_sen|gross_sen|RPT-/);
    });

    // ----------------------------------------------------------- workforce

    await t.test("workforce headcount is grouped by department and status", async () => {
      const body = await (await call("GET", "/reports/workforce")).json();
      assert.equal(body.data.totals.employees >= 4, true);

      const engineering = body.data.byDepartment.find(
        (row: { department_name: string }) => row.department_name === "Reports Engineering",
      );
      assert.equal(engineering.headcount, 2);
      assert.equal(engineering.active, 1);
      assert.equal(engineering.probation, 1);

      const finance = body.data.byDepartment.find(
        (row: { department_name: string }) => row.department_name === "Reports Finance",
      );
      assert.equal(finance.headcount, 2);
      assert.equal(finance.resigned, 1);

      const statuses = Object.fromEntries(
        body.data.byStatus.map((row: { employment_status: string; count: number }) =>
          [row.employment_status, row.count]),
      );
      // Company-wide, so the baseline's own employees count too.
      assert.ok(statuses.probation >= 1);
      assert.ok(statuses.resigned >= 1);
    });

    // ---------------------------------------------------------- attendance

    await t.test("attendance totals respect the date range", async () => {
      const inRange = await (await call(
        "GET", "/reports/attendance?from=2026-09-01&to=2026-09-30",
      )).json();

      const aisyah = inRange.data.rows.find(
        (row: { employee_number: string }) => row.employee_number === "RPT-1",
      );
      // The 15 August record is outside the window and must not be counted.
      assert.equal(aisyah.days_recorded, 3);
      assert.equal(aisyah.late, 2);
      assert.equal(aisyah.late_minutes, 35, "August's 40 late minutes are out of range");
      assert.equal(aisyah.missing_checkout, 1);

      const wider = await (await call(
        "GET", "/reports/attendance?from=2026-08-01&to=2026-09-30",
      )).json();
      const aisyahWider = wider.data.rows.find(
        (row: { employee_number: string }) => row.employee_number === "RPT-1",
      );
      assert.equal(aisyahWider.days_recorded, 4);
      assert.equal(aisyahWider.late_minutes, 75);
    });

    await t.test("an employee with no attendance still appears, with zeroes", async () => {
      const body = await (await call(
        "GET", "/reports/attendance?from=2026-09-01&to=2026-09-30",
      )).json();
      const siti = body.data.rows.find(
        (row: { employee_number: string }) => row.employee_number === "RPT-3",
      );
      assert.ok(siti, "an employee with no records must not vanish from the report");
      assert.equal(siti.days_recorded, 0);
      assert.equal(siti.late_minutes, 0);
    });

    await t.test("the department filter narrows attendance to that department", async () => {
      const engineeringId = (await db.query(
        "SELECT id FROM public.departments WHERE name='Reports Engineering'",
      )).rows[0].id;

      const body = await (await call(
        "GET", `/reports/attendance?from=2026-09-01&to=2026-09-30&departmentId=${engineeringId}`,
      )).json();
      const numbers = body.data.rows.map((row: { employee_number: string }) => row.employee_number);
      assert.deepEqual(numbers.sort(), ["RPT-1", "RPT-3"]);
    });

    await t.test("an unbounded or malformed range is refused", async () => {
      const tooLong = await call("GET", "/reports/attendance?from=2020-01-01&to=2026-12-31");
      assert.equal(tooLong.status, 400);
      assert.match((await tooLong.json()).message, /366 days or fewer/);

      assert.equal((await call("GET", "/reports/attendance?from=notadate&to=2026-09-30")).status, 400);
      assert.equal((await call("GET", "/reports/attendance?from=2026-09-30&to=2026-09-01")).status, 400);
      assert.equal((await call("GET", "/reports/attendance?departmentId=abc")).status, 400);
    });

    // --------------------------------------------------------------- leave

    await t.test("leave requests overlapping the range are reported whole", async () => {
      const body = await (await call(
        "GET", "/reports/leave?from=2026-09-01&to=2026-09-30",
      )).json();
      assert.equal(body.data.totals.requests, 3, "the August request is out of range");
      assert.equal(body.data.totals.approved_days, 3);
      assert.equal(body.data.totals.pending_days, 2);
    });

    await t.test("leave filters by type and status", async () => {
      const annual = await (await call(
        "GET", "/reports/leave?from=2026-09-01&to=2026-09-30&leaveType=annual&status=approved",
      )).json();
      assert.equal(annual.data.rows.length, 1);
      assert.equal(annual.data.rows[0].employee_number, "RPT-1");

      // An unknown filter value is ignored rather than injected into the query.
      const bogus = await call("GET", "/reports/leave?leaveType=nonsense'; DROP TABLE users;--");
      assert.equal(bogus.status, 200);
      assert.equal(
        (await db.query("SELECT to_regclass('public.users') AS name")).rows[0].name, "users",
      );
    });

    await t.test("balances use the same rule as the leave page, in one query", async () => {
      const body = await (await call(
        "GET", "/reports/leave?from=2026-09-01&to=2026-09-30&leaveYear=2026",
      )).json();

      const daniel = body.data.balances.find(
        (entry: { employee_number: string }) => entry.employee_number === "RPT-2",
      );
      const annual = daniel.balances.find((b: { leaveType: string }) => b.leaveType === "annual");
      // 12 granted, nothing approved, 2 pending: remaining keeps pending out,
      // available takes it off. Exactly what the employee's own page shows.
      assert.equal(annual.entitledDays, 12);
      assert.equal(annual.usedDays, 0);
      assert.equal(annual.pendingDays, 2);
      assert.equal(annual.remainingDays, 12);
      assert.equal(annual.availableDays, 10);

      const medical = daniel.balances.find((b: { leaveType: string }) => b.leaveType === "medical");
      assert.equal(medical.usedDays, 1);
      assert.equal(medical.remainingDays, 9);

      // A resigned employee is not part of a live balance report.
      const numbers = body.data.balances.map(
        (entry: { employee_number: string }) => entry.employee_number,
      );
      assert.ok(!numbers.includes("RPT-4"));
    });

    // ------------------------------------------------------------- payroll

    await t.test("payroll totals are the exact sum of the records", async () => {
      const body = await (await call("GET", `/reports/payroll/${periodId}`)).json();
      const rows = (await db.query(
        `SELECT COALESCE(SUM(gross_sen),0)::text AS gross,
                COALESCE(SUM(deductions_sen),0)::text AS deductions,
                COALESCE(SUM(net_sen),0)::text AS net,
                count(*)::int AS employees
         FROM public.payroll_records WHERE period_id = $1`,
        [periodId],
      )).rows[0];

      assert.equal(body.data.totals.gross_sen, rows.gross);
      assert.equal(body.data.totals.deductions_sen, rows.deductions);
      assert.equal(body.data.totals.net_sen, rows.net);
      assert.equal(body.data.totals.employees, rows.employees);

      // Totals arrive as strings, never as JavaScript numbers.
      assert.equal(typeof body.data.totals.gross_sen, "string");

      // Department totals must add back up to the company total, exactly.
      const summed = body.data.byDepartment.reduce(
        (total: bigint, row: { net_sen: string }) => total + BigInt(row.net_sen), 0n,
      );
      assert.equal(summed.toString(), rows.net);
    });

    await t.test("a payroll report can be narrowed to one department", async () => {
      const financeId = (await db.query(
        "SELECT id FROM public.departments WHERE name='Reports Finance'",
      )).rows[0].id;
      const body = await (await call(
        "GET", `/reports/payroll/${periodId}?departmentId=${financeId}`,
      )).json();
      assert.deepEqual(
        body.data.rows.map((row: { employee_number: string }) => row.employee_number),
        ["RPT-2"],
      );
    });

    await t.test("a missing payroll period is a 404, not an empty report", async () => {
      assert.equal((await call("GET", "/reports/payroll/999999")).status, 404);
      assert.equal((await call("GET", "/reports/payroll/abc")).status, 400);
    });

    // ------------------------------------------------------------- exports

    await t.test("an attendance export carries no location or verification data", async () => {
      const response = await call("GET", "/reports/attendance/export?from=2026-09-01&to=2026-09-30");
      assert.equal(response.status, 200);
      assert.match(response.headers.get("content-type") ?? "", /text\/csv/);
      assert.match(response.headers.get("content-disposition") ?? "", /attachment; filename="/);
      assert.equal(response.headers.get("x-content-type-options"), "nosniff");

      const text = await response.text();
      // The coordinates in the fixtures above must not appear anywhere.
      assert.doesNotMatch(text, /3\.139|101\.686/, "coordinates must never be exported");
      assert.doesNotMatch(text, /latitude|longitude|accuracy|distance/i);
      assert.doesNotMatch(text, /password|hash|token|challenge/i);

      const rows = parseCsv(text);
      assert.deepEqual(rows[0], [
        "Employee number", "Name", "Department", "Days recorded",
        "Present", "Late", "Absent", "On leave", "Late minutes", "Missing checkout",
      ]);
      const aisyah = rows.find((row) => row[0] === "RPT-1");
      assert.equal(aisyah?.[8], "35");
    });

    await t.test("a hostile employee name is exported as text, not as a formula", async () => {
      const text = await (await call("GET", "/reports/workforce/export")).text();
      assert.doesNotMatch(text, /(^|,|")=cmd/, "a formula reached the file unneutralised");

      const attendance = await (await call(
        "GET", "/reports/attendance/export?from=2026-09-01&to=2026-09-30",
      )).text();
      const rows = parseCsv(attendance);
      const hostile = rows.find((row) => row[0] === "RPT-4");
      assert.ok(hostile, "the employee must still be present in the report");
      const name = hostile[1] ?? "";
      assert.equal(name.startsWith("'"), true, "the name must be neutralised");
      assert.match(name, /cmd/, "and its content must still be readable");
    });

    await t.test("a payroll export formats sen exactly, with no floating point", async () => {
      const response = await call("GET", `/reports/payroll/${periodId}/export`);
      assert.equal(response.status, 200);
      assert.match(
        response.headers.get("content-disposition") ?? "", /payroll-report-2026-09\.csv/,
      );

      const rows = parseCsv(await response.text());
      const daniel = rows.find((row) => row[0] === "RPT-2");
      const record = (await db.query(
        `SELECT gross_sen::text, net_sen::text FROM public.payroll_records
         WHERE period_id=$1 AND employee_id=9701`, [periodId],
      )).rows[0];

      const asDecimal = (sen: string) => `${BigInt(sen) / 100n}.${String(BigInt(sen) % 100n).padStart(2, "0")}`;
      assert.equal(daniel?.[5], asDecimal(record.gross_sen));
      assert.equal(daniel?.[7], asDecimal(record.net_sen));
      // Two decimal places exactly, never 4499.999999.
      assert.match(daniel?.[7] ?? "", /^\d+\.\d{2}$/);
    });

    await t.test("a leave balance export lists one row per employee and type", async () => {
      const rows = parseCsv(await (await call("GET", "/reports/leave/balances/export?leaveYear=2026")).text());
      assert.deepEqual(rows[0], [
        "Employee number", "Name", "Department", "Leave year", "Leave type",
        "Entitled", "Used", "Pending", "Remaining", "Available",
      ]);
      const danielAnnual = rows.find((row) => row[0] === "RPT-2" && row[4] === "annual");
      assert.equal(danielAnnual?.[5], "12");
      assert.equal(danielAnnual?.[9], "10");
    });

    // ----------------------------------------------------------- dashboard

    await t.test("the admin dashboard reports its own metrics on the company date", async () => {
      const body = await (await call("GET", "/dashboard/admin")).json();
      assert.match(body.data.today, /^\d{4}-\d{2}-\d{2}$/);
      assert.equal(typeof body.data.onLeaveToday, "number");
      assert.equal(typeof body.data.notClockedIn, "number");
      assert.equal(body.data.payrollStatus.period_year, 2026);
      assert.equal(body.data.payrollStatus.period_month, 9);
      // Net is carried as an exact string, like every other payroll total.
      assert.equal(typeof body.data.payrollStatus.net_sen, "string");
    });

    await t.test("on-leave and not-clocked-in are derived, not read from attendance", async () => {
      // Approved leave covering the chosen day, for someone with no attendance row.
      await db.query(
        `INSERT INTO public.leave_requests
           (employee_id, leave_type, start_date, end_date, reason, status, working_days, leave_year)
         VALUES (9702, 'annual', CURRENT_DATE, CURRENT_DATE, 'Today', 'approved', 1, 2026)`,
      );
      const body = await (await call("GET", "/dashboard/admin")).json();
      assert.ok(body.data.onLeaveToday >= 1, "approved leave today must be counted");

      const notClockedIn = (await db.query(
        `SELECT count(*)::int AS count FROM public.employees e
         WHERE e.employment_status IN ('active','probation')
           AND NOT EXISTS (SELECT 1 FROM public.attendance a
                           WHERE a.employee_id = e.id AND a.attendance_date = $1)
           AND NOT EXISTS (SELECT 1 FROM public.leave_requests lr
                           WHERE lr.employee_id = e.id AND lr.status='approved'
                             AND $1::date BETWEEN lr.start_date AND lr.end_date)`,
        [body.data.today],
      )).rows[0].count;
      assert.equal(body.data.notClockedIn, notClockedIn);
    });

    // --------------------------------------------------------- no mutation

    await t.test("reporting writes nothing and leaves the orphan rows untouched", async () => {
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
