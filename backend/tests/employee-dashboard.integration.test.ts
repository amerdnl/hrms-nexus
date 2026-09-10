import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { once } from "node:events";
import { test } from "node:test";
import jwt from "jsonwebtoken";
import pg from "pg";
import { runMigrations } from "../src/database/migrations.js";
import { dropLabClones } from "./labClones.js";

// Explicit opt-in; the only permitted host is the isolated, internal Docker lab.
// Every write below happens in a disposable clone, never in the source database.
test("Employee Dashboard V2: session isolation, exposure and company time", {
  skip: process.env.HR_NEXUS_DASHBOARD_LAB !== "1", timeout: 240_000,
}, async (t) => {
  const suffix = randomBytes(5).toString("hex");
  const host = "hr-nexus-v2-migration-lab";
  const admin = new pg.Pool({ host, user: "postgres", database: "postgres" });
  const database = `hr_nexus_dashboard_${suffix}`;
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
    // Two employees, so "your own data" can be told apart from "somebody's data".

    await db.query(
      `INSERT INTO public.departments (name, description)
       VALUES ('Dashboard Engineering', 'Lab') ON CONFLICT (name) DO NOTHING;

       INSERT INTO public.employees
         (id, employee_number, full_name, department_id, employment_status, job_title, employment_date)
       VALUES
         (9800, 'DSH-1', 'Aisyah Rahman',
          (SELECT id FROM public.departments WHERE name='Dashboard Engineering'),
          'active', 'Engineer', '2024-03-01'),
         (9801, 'DSH-2', 'Daniel Tan',
          (SELECT id FROM public.departments WHERE name='Dashboard Engineering'),
          'active', 'Analyst', '2025-07-15');

       INSERT INTO public.users (id, employee_id, email, password_hash, role, is_active)
       VALUES (9800, NULL, 'dsh-admin@example.invalid', 'unusable-lab-hash', 'admin', TRUE),
              (9801, 9800, 'dsh-one@example.invalid', 'unusable-lab-hash', 'employee', TRUE),
              (9802, 9801, 'dsh-two@example.invalid', 'unusable-lab-hash', 'employee', TRUE);

       UPDATE public.company_settings
         SET timezone='Asia/Kuala_Lumpur', working_days=ARRAY[1,2,3,4,5]::smallint[] WHERE id=1;

       -- Coordinates are recorded on purpose: the dashboard must not repeat them.
       INSERT INTO public.attendance
         (employee_id, attendance_date, check_in_time, check_out_time, status, late_minutes,
          verification_method, verification_status,
          check_in_latitude, check_in_longitude, check_in_accuracy_meters, check_in_distance_meters)
       VALUES
         (9800, '2026-09-01', '09:00', '18:00', 'present', 0, 'QR_LOCATION', 'verified',
          3.139001, 101.686002, 12.5, 20.0),
         (9800, '2026-09-02', '09:25', '18:00', 'late', 25, 'QR_LOCATION', 'verified',
          3.139001, 101.686002, 12.5, 20.0),
         (9801, '2026-09-02', '08:40', '17:30', 'present', 0, 'QR_LOCATION', 'verified',
          3.139001, 101.686002, 12.5, 20.0);

       INSERT INTO public.leave_requests
         (employee_id, leave_type, start_date, end_date, reason, status, working_days, leave_year)
       VALUES
         (9800, 'annual',  '2026-01-05', '2026-01-06', 'Old trip', 'approved', 2, 2026),
         (9800, 'annual',  '2099-05-10', '2099-05-12', 'Far off',  'approved', 3, 2099),
         (9800, 'annual',  '2099-03-01', '2099-03-02', 'Sooner',   'approved', 2, 2099),
         (9800, 'medical', '2099-08-01', '2099-08-01', 'Waiting',  'pending',  1, 2099),
         (9801, 'annual',  '2099-04-01', '2099-04-02', 'Not yours','approved', 2, 2099);

       INSERT INTO public.leave_entitlements
         (employee_id, leave_year, leave_type, entitled_days, carried_forward_days, adjustment_days, source)
       VALUES (9800, 2026, 'annual', 12, 0, 0, 'policy'),
              (9801, 2026, 'annual', 12, 0, 0, 'policy');

       INSERT INTO public.employee_compensation
         (employee_id, basic_salary_sen, allowance_sen, overtime_rate_sen, effective_from)
       VALUES (9800, 300000, 25000, 2050, '2026-01-01'),
              (9801, 450000, 50000, 3000, '2026-01-01');`,
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

    const sign = (userId: number, role: string, employeeId: number | null) =>
      jwt.sign({ role, employeeId }, process.env.JWT_SECRET!, {
        subject: String(userId), expiresIn: "40m",
      });

    const adminToken = sign(9800, "admin", null);
    const aisyahToken = sign(9801, "employee", 9800);
    const danielToken = sign(9802, "employee", 9801);

    const call = async (
      method: string, endpoint: string, body?: unknown, token: string | null = aisyahToken,
    ) => fetch(`${origin}${endpoint}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    const dashboard = async (token: string | null = aisyahToken, query = "") =>
      (await call("GET", `/dashboard/employee${query}`, undefined, token)).json();

    // ------------------------------------------------------- authorization

    await t.test("the employee dashboard is closed to anonymous callers and admins", async () => {
      assert.equal((await call("GET", "/dashboard/employee", undefined, null)).status, 401);

      // An administrator has their own dashboard; this route is self-service only.
      const asAdmin = await call("GET", "/dashboard/employee", undefined, adminToken);
      assert.equal(asAdmin.status, 403);
      assert.doesNotMatch(await asAdmin.text(), /DSH-|Aisyah|Daniel|net_sen/);
    });

    await t.test("a token claiming another employee is rejected outright", async () => {
      // Daniel's user id with Aisyah's employee id. The session is rebuilt from
      // the database, so the claim cannot be talked into agreeing with itself.
      const forged = sign(9802, "employee", 9800);
      const response = await call("GET", "/dashboard/employee", undefined, forged);
      assert.equal(response.status, 401);
      assert.doesNotMatch(await response.text(), /DSH-|Aisyah|09:00/);
    });

    await t.test("an employee identifier in the request changes nothing", async () => {
      // There is no parameter to substitute, and adding one must not create one.
      const own = await dashboard();
      for (const query of [
        "?employeeId=9801", "?employee_id=9801", "?id=9801", "?userId=9802",
      ]) {
        const attempt = await dashboard(aisyahToken, query);
        assert.equal(attempt.data.employee.id, 9800, `${query} must not redirect the lookup`);
        assert.equal(attempt.data.employee.employeeNumber, "DSH-1");
        assert.deepEqual(attempt.data.employee, own.data.employee);
      }
    });

    await t.test("each employee sees only their own attendance and leave", async () => {
      const aisyah = (await dashboard(aisyahToken)).data;
      const daniel = (await dashboard(danielToken)).data;

      assert.equal(aisyah.employee.employeeNumber, "DSH-1");
      assert.equal(daniel.employee.employeeNumber, "DSH-2");

      assert.equal(aisyah.recentAttendance.length, 2);
      assert.equal(daniel.recentAttendance.length, 1);

      // Compared by identity rather than by wording: the reason an employee gave
      // is not on the dashboard at all, so matching on text would pass for the
      // wrong reason.
      const idsOf = async (employeeId: number) => (await db.query<{ id: string }>(
        "SELECT id::text FROM public.leave_requests WHERE employee_id = $1", [employeeId],
      )).rows.map((row) => Number(row.id));

      const aisyahLeaveIds = new Set(await idsOf(9800));
      const danielLeaveIds = new Set(await idsOf(9801));

      for (const leave of daniel.recentLeaves) {
        assert.equal(danielLeaveIds.has(leave.id), true);
        assert.equal(aisyahLeaveIds.has(leave.id), false, "another employee's leave must not appear");
      }
      for (const leave of aisyah.recentLeaves) {
        assert.equal(aisyahLeaveIds.has(leave.id), true);
        assert.equal(danielLeaveIds.has(leave.id), false);
      }

      // Each sees their own next leave, not the company's earliest.
      assert.equal(aisyah.upcomingLeave.startDate, "2099-03-01");
      assert.equal(daniel.upcomingLeave.startDate, "2099-04-01");

      // No employee identifier belonging to anyone else appears in the payload.
      assert.doesNotMatch(JSON.stringify(daniel), /DSH-1|Aisyah/);
      assert.doesNotMatch(JSON.stringify(aisyah), /DSH-2|Daniel/);
    });

    await t.test("a user not linked to an employee is refused, not shown a blank", async () => {
      await db.query(
        `INSERT INTO public.users (id, employee_id, email, password_hash, role, is_active)
         VALUES (9803, NULL, 'dsh-orphan@example.invalid', 'unusable-lab-hash', 'employee', TRUE)`,
      );
      // The employee role requires an employee id in the token, so this cannot
      // even be signed as a valid employee session.
      const response = await call("GET", "/dashboard/employee", undefined, sign(9803, "employee", null));
      assert.equal(response.status, 401);
    });

    // ----------------------------------------------------------- exposure

    await t.test("no coordinate, accuracy or distance reaches the dashboard", async () => {
      const body = await dashboard();
      const text = JSON.stringify(body);

      for (const forbidden of [
        "latitude", "longitude", "accuracy", "distance", "3.139001", "101.686002",
        "12.5", "20.0", "password", "token", "qr", "secret", "hash",
      ]) {
        assert.equal(
          text.toLowerCase().includes(forbidden.toLowerCase()), false,
          `the dashboard payload must not contain "${forbidden}"`,
        );
      }
    });

    await t.test("verification state is present as a coarse state only", async () => {
      const body = await dashboard();
      const entry = body.data.recentAttendance[0];
      assert.equal(["verified", "manual", "exception", null].includes(entry.verificationStatus), true);
      // The method names the mechanism; the state is all the dashboard needs.
      assert.equal("verificationMethod" in entry, false);
      assert.equal(Object.keys(entry).sort().join(","), [
        "attendanceDate", "checkInTime", "checkOutTime", "id", "isManual",
        "lateMinutes", "status", "verificationStatus",
      ].join(","));
    });

    // ------------------------------------------------------- company today

    await t.test("today comes from Company Settings, not the database server", async () => {
      const dbToday = (await db.query<{ today: string }>(
        "SELECT CURRENT_DATE::text AS today",
      )).rows[0]!.today;

      // These two zones are 26 hours apart, so they can never agree on the date
      // and at most one of them can agree with the database server.
      await db.query("UPDATE public.company_settings SET timezone='Pacific/Kiritimati' WHERE id=1");
      const east = (await dashboard()).data.today;

      await db.query("UPDATE public.company_settings SET timezone='Etc/GMT+12' WHERE id=1");
      const west = (await dashboard()).data.today;

      assert.notEqual(east, west);
      assert.equal([east, west].some((date) => date !== dbToday), true,
        "at least one zone must disagree with CURRENT_DATE, or the timezone is being ignored");

      await db.query("UPDATE public.company_settings SET timezone='Asia/Kuala_Lumpur' WHERE id=1");
    });

    await t.test("today's attendance is matched against the company's date", async () => {
      const today = (await dashboard()).data.today;
      assert.equal((await dashboard()).data.todayAttendance, null);

      await db.query(
        `INSERT INTO public.attendance
           (employee_id, attendance_date, check_in_time, status, verification_status)
         VALUES (9800, $1::date, '09:05', 'present', 'verified')`,
        [today],
      );

      const body = await dashboard();
      assert.equal(body.data.todayAttendance.attendanceDate, today);
      assert.equal(body.data.todayAttendance.checkInTime.startsWith("09:05"), true);

      await db.query(
        "DELETE FROM public.attendance WHERE employee_id = 9800 AND attendance_date = $1::date",
        [today],
      );
    });

    // ------------------------------------------------------------- leave

    await t.test("leave balances are the same rule the leave page uses", async () => {
      const fromDashboard = (await dashboard()).data;
      const fromLeave = await (await call("GET", "/leaves/me/balances")).json();

      assert.equal(fromDashboard.leaveYear, fromLeave.data.leaveYear);
      assert.deepEqual(fromDashboard.leaveBalances, fromLeave.data.balances);
      assert.equal(fromDashboard.unavailable.includes("leaveBalances"), false);
    });

    await t.test("upcoming leave is the earliest approved leave not yet over", async () => {
      const body = (await dashboard()).data;
      // 2099-03-01 is approved and starts before the 2099-05-10 request; the
      // 2026-01 request has already ended and the medical one is only pending.
      assert.equal(body.upcomingLeave.startDate, "2099-03-01");
      assert.equal(body.upcomingLeave.status, "approved");
      assert.equal(body.pendingLeaveCount, 1);
    });

    // ----------------------------------------------------------- payroll

    await t.test("unpublished payroll is never shown to the employee it concerns", async () => {
      const period = await (await call(
        "POST", "/payroll/periods", { year: 2026, month: 9 }, adminToken,
      )).json();
      const periodId = period.data.period.id;
      await call("POST", `/payroll/periods/${periodId}/calculate`, undefined, adminToken);

      for (const status of ["calculated", "reviewed"]) {
        await db.query("UPDATE public.payroll_periods SET status = $1 WHERE id = $2",
          [status, periodId]);
        const body = (await dashboard()).data;
        assert.equal(body.latestPayslip, null, `${status} payroll must stay hidden`);
        // And "hidden" is not the same as "broken".
        assert.equal(body.unavailable.includes("payslip"), false);
      }

      await db.query("UPDATE public.payroll_periods SET status = 'approved' WHERE id = $1",
        [periodId]);
      const visible = (await dashboard()).data;
      assert.equal(visible.latestPayslip.periodYear, 2026);
      assert.equal(visible.latestPayslip.periodMonth, 9);
      assert.equal(visible.latestPayslip.status, "approved");
    });

    await t.test("payslip money is exact integer sen, carried as text", async () => {
      const body = (await dashboard()).data;
      const slip = body.latestPayslip;

      const stored = (await db.query<{ gross_sen: string; deductions_sen: string; net_sen: string }>(
        `SELECT gross_sen::text, deductions_sen::text, net_sen::text
         FROM public.payroll_records WHERE id = $1`, [slip.id],
      )).rows[0]!;

      assert.equal(typeof slip.grossSen, "string");
      assert.equal(typeof slip.netSen, "string");
      assert.equal(slip.grossSen, stored.gross_sen);
      assert.equal(slip.deductionsSen, stored.deductions_sen);
      assert.equal(slip.netSen, stored.net_sen);
      // Exactly the arithmetic the payroll service performed.
      assert.equal(
        BigInt(slip.grossSen) - BigInt(slip.deductionsSen), BigInt(slip.netSen),
      );
    });

    await t.test("the payslip on the dashboard is the employee's own", async () => {
      const aisyah = (await dashboard(aisyahToken)).data.latestPayslip;
      const daniel = (await dashboard(danielToken)).data.latestPayslip;

      assert.notEqual(aisyah.id, daniel.id);
      // Daniel earns more; his own figures are what he is shown.
      assert.equal(BigInt(daniel.grossSen) > BigInt(aisyah.grossSen), true);

      const owner = (await db.query<{ employee_id: number }>(
        "SELECT employee_id FROM public.payroll_records WHERE id = $1", [aisyah.id],
      )).rows[0]!;
      assert.equal(owner.employee_id, 9800);
    });

    // ------------------------------------------------- empty vs unavailable

    await t.test("an employee with no payslip is told none exists, not that it failed", async () => {
      await db.query(
        `INSERT INTO public.employees
           (id, employee_number, full_name, employment_status, job_title)
         VALUES (9802, 'DSH-3', 'Siti Nurhaliza', 'active', 'Intern');
         INSERT INTO public.users (id, employee_id, email, password_hash, role, is_active)
         VALUES (9804, 9802, 'dsh-three@example.invalid', 'unusable-lab-hash', 'employee', TRUE)`,
      );

      const body = (await dashboard(sign(9804, "employee", 9802))).data;
      assert.equal(body.latestPayslip, null);
      assert.equal(body.todayAttendance, null);
      assert.deepEqual(body.recentAttendance, []);
      assert.deepEqual(body.unavailable, []);
      // Absent data is absent, not invented.
      assert.equal(body.employee.departmentName, null);
      assert.equal(body.employee.employmentDate, null);
    });

    await t.test("the protected orphan attendance rows are untouched", async () => {
      const after = (await db.query(
        `SELECT id, employee_id FROM public.attendance a
         WHERE NOT EXISTS (SELECT 1 FROM public.employees e WHERE e.id = a.employee_id) ORDER BY id`,
      )).rows;
      assert.deepEqual(after, orphansBefore);
    });

    suiteCompleted = true;
  } finally {
    if (server) { server.close(); await once(server, "close"); }
    await appPool?.end();
    await pool?.end();
    await dropLabClones(admin, suffix, suiteCompleted, t);
    await admin.end();
  }
});
