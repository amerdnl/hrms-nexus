import assert from "node:assert/strict";
import { test } from "node:test";
import { UNUSABLE_HASH, withLab } from "./labHarness.js";

function addDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function isoWeekday(date: string): number {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  return day === 0 ? 7 : day;
}

// Explicit opt-in; the only permitted host is the isolated, internal Docker lab.
test("M7 attendance, leave and payroll V3: company calendar, safe exposure and unchanged V2 counting", {
  skip: process.env.HR_NEXUS_V3_LAB !== "1", timeout: 240_000,
}, async (t) => {
  await withLab(t, { label: "v3_alp" }, async (lab) => {
    const { db } = lab;
    const { payrollPaid } = await import("../src/services/workflowNotifications.js");
    await db.query(
      `INSERT INTO public.departments (name) VALUES ('ALP Lab');
       INSERT INTO public.employees (id, employee_number, full_name, department_id, employment_status, job_title, employment_date)
       SELECT v.id, v.num, v.name, (SELECT id FROM public.departments WHERE name = 'ALP Lab'), v.status, 'Staff', '2024-01-15'
       FROM (VALUES (9300, 'ALP-ANA', 'Ana Employee', 'active'), (9301, 'ALP-MAX', 'Max Manager', 'active'), (9302, 'ALP-GUS', 'Gus Gone', 'resigned')) AS v(id, num, name, status);
       UPDATE public.employees SET manager_id = 9301 WHERE id = 9300;
       UPDATE public.company_settings SET working_days = ARRAY[1,2,3,4,5]::smallint[], office_latitude = 3.139001, office_longitude = 101.686002 WHERE id = 1;
       INSERT INTO public.users (id, employee_id, email, password_hash, role, is_active) VALUES
         (9390, NULL, 'alp-admin@example.invalid', '${UNUSABLE_HASH}', 'admin', TRUE),
         (9391, 9300, 'ana@example.invalid', '${UNUSABLE_HASH}', 'employee', TRUE),
         (9392, 9301, 'max@example.invalid', '${UNUSABLE_HASH}', 'employee', TRUE),
         (9393, 9302, 'gus@example.invalid', '${UNUSABLE_HASH}', 'employee', FALSE);`,
    );
    const admin = lab.sign(9390, "admin", null);
    const ana = lab.sign(9391, "employee", 9300);
    const max = lab.sign(9392, "employee", 9301);

    type Config = { data: { today: string; timezone: string; workingDays: number[]; holidays: Array<{ date: string; name: string }> } };
    const config = await lab.json<Config>("GET", "/company/calendar-config", ana);
    const today = config.body.data.today;

    await t.test("an employee reads the working week, holidays and company today, and nothing else from settings", async () => {
      assert.equal(config.status, 200);
      assert.deepEqual(config.body.data.workingDays, [1, 2, 3, 4, 5]);
      for (const needle of ["3.139001", "101.686002", "latitude", "radius", "company_name", "registration"]) {
        assert.equal(config.text.includes(needle), false, `calendar config exposed ${needle}`);
      }
      assert.equal((await lab.call("GET", "/settings", ana)).status, 403, "the full settings stay HR's");
    });

    await t.test("leave counts the working week exactly as V2 did, with company holidays inside the range still counted", async () => {
      // The next full Monday-to-Friday week at least a week away, kept inside this year.
      let monday = addDays(today, 7);
      while (isoWeekday(monday) !== 1) monday = addDays(monday, 1);
      if (addDays(monday, 6).slice(0, 4) !== monday.slice(0, 4)) monday = `${Number(monday.slice(0, 4)) + 1}-01-05`;
      while (isoWeekday(monday) !== 1) monday = addDays(monday, 1);
      const wednesday = addDays(monday, 2);
      assert.equal((await lab.call("POST", "/settings/holidays", admin, { date: wednesday, name: "Lab Holiday" })).status, 201);
      const withHoliday = await lab.json<Config>("GET", "/company/calendar-config", ana);
      assert.ok(withHoliday.body.data.holidays.some((holiday) => holiday.date === wednesday), "the preview can name the holiday");

      const week = await lab.json<{ data: { leave: { working_days: string } } }>("POST", "/leaves", ana, {
        leaveType: "unpaid", startDate: monday, endDate: addDays(monday, 6), reason: "A week off",
      });
      assert.equal(week.status, 201, week.text);
      assert.equal(Number(week.body.data.leave.working_days), 5, "Monday to Friday, the holiday counted, the weekend not");

      const saturday = addDays(monday, 12);
      const weekend = await lab.json<{ code: string }>("POST", "/leaves", ana, {
        leaveType: "unpaid", startDate: saturday, endDate: addDays(saturday, 1), reason: "Weekend only",
      });
      assert.equal(weekend.body.code, "no_working_days", "a range with no working days is refused, as the preview says");
    });

    await t.test("whether leave has started is judged by the company's today", async () => {
      await db.query(
        `INSERT INTO public.leave_requests (employee_id, leave_type, start_date, end_date, reason, status, working_days, leave_year)
         VALUES (9300, 'unpaid', $1, $1, 'Starts today', 'pending', 1, $2), (9300, 'unpaid', $3, $3, 'Starts tomorrow', 'pending', 1, $4)`,
        [today, Number(today.slice(0, 4)), addDays(today, 1), Number(addDays(today, 1).slice(0, 4))],
      );
      const rows = await db.query<{ id: string; reason: string }>("SELECT id, reason FROM public.leave_requests WHERE employee_id = 9300 AND reason LIKE 'Starts %'");
      const startsToday = rows.rows.find((row) => row.reason === "Starts today")!.id;
      const startsTomorrow = rows.rows.find((row) => row.reason === "Starts tomorrow")!.id;
      assert.equal((await lab.json<{ code: string }>("POST", `/leaves/${startsToday}/cancel`, ana)).body.code, "already_started");
      assert.equal((await lab.call("POST", `/leaves/${startsTomorrow}/cancel`, ana)).status, 200);
    });

    await t.test("HR's Action Center lists recent missing check-outs; nobody else's does, and orphans never count", async () => {
      await db.query(
        `INSERT INTO public.attendance (employee_id, attendance_date, check_in_time, status, verification_method, verification_status,
           check_in_latitude, check_in_longitude)
         VALUES (9300, $1, '09:00', 'present', 'QR_LOCATION', 'verified', 3.139001, 101.686002),
                (9302, $1, '09:00', 'present', NULL, NULL, NULL, NULL)`,
        [addDays(today, -2)],
      );
      type Center = { data: { requiresAction: Array<{ id: string; kind: string; title: string; link: string }> } };
      const hr = await lab.json<Center>("GET", "/action-center", admin);
      const items = hr.body.data.requiresAction.filter((item) => item.kind === "attendance_exception");
      assert.equal(items.length, 1);
      assert.match(items[0]!.title, /^1 check-out missing on /, "the resigned employee's record is not counted");
      assert.equal(items[0]!.link, "/admin/attendance");
      for (const token of [ana, max]) {
        const other = await lab.json<Center>("GET", "/action-center", token);
        assert.equal(other.body.data.requiresAction.some((item) => item.kind === "attendance_exception"), false);
      }
      assert.equal(hr.text.includes("3.139001"), false);
    });

    await t.test("the manager's team attendance carries no coordinates", async () => {
      const team = await lab.json("GET", `/team/attendance?date=${addDays(today, -2)}`, max);
      assert.equal(team.status, 200, team.text);
      assert.ok(team.text.includes("Ana Employee"));
      for (const needle of ["3.139001", "101.686002", "latitude", "longitude", "accuracy", "distance"]) {
        assert.equal(team.text.includes(needle), false, `team attendance exposed ${needle}`);
      }
    });

    await t.test("marking payroll paid tells each eligible payslip holder once, with no amount", async () => {
      const holders = { rows: [{ employee_id: 9300 }, { employee_id: 9302 }], rowCount: 2 };
      const stub = { query: (sql: string, params?: unknown[]) => sql.includes("FROM public.payroll_records") ? Promise.resolve(holders) : db.query(sql, params) };
      await payrollPaid(stub as never, { id: 777001, period_year: 2026, period_month: 8 }, 9390);
      await payrollPaid(stub as never, { id: 777001, period_year: 2026, period_month: 8 }, 9390);
      const rows = await db.query<{ user_id: number; title: string; body: string | null; link: string }>(
        "SELECT user_id, title, body, link FROM public.notifications WHERE kind = 'payroll_paid'",
      );
      assert.deepEqual(rows.rows, [{ user_id: 9391, title: "Your pay for August 2026 has been paid", body: null, link: "/employee/payroll" }]);
    });

    assert.equal(((await lab.protectedRows()) as { orphans: unknown[] }).orphans.length, 5);
  });
});
