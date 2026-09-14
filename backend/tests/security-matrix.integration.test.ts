import assert from "node:assert/strict";
import { test } from "node:test";
import { UNUSABLE_HASH, withLab } from "./labHarness.js";

function addDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

/**
 * Master §37, the final security matrix, as one suite over one company:
 *
 *   Mia manages Eve and Cole. Olly works elsewhere with no manager. Rex has
 *   resigned but kept an active account. Dan's account is deactivated after
 *   his token was issued. Two administrators, one of whom is deactivated.
 *
 * Every sensitive value below is a marker that must appear only where the
 * matrix allows it.
 */
const EVE_ADDRESS = "SECRET-ADDRESS 9 Jalan Matrix";
const EVE_EMERGENCY = "SECRET-EMERGENCY Contact";
const EVE_DOB = "1991-02-03";
const EVE_SALARY = "4321";
const SELF_REVIEW = "SECRET-SELF-REVIEW words";
const MANAGER_REVIEW = "SECRET-MANAGER-REVIEW words";
const LEAVE_REASON = "SECRET-LEAVE-REASON dentist";
const GOAL_DESCRIPTION = "SECRET-GOAL-DESCRIPTION";
const PRIVATE_KUDOS = "SECRET-PRIVATE-KUDOS thanks";
const SENSITIVE = [EVE_ADDRESS, EVE_EMERGENCY, EVE_DOB, "basic_salary", "password_hash", "latitude"];

// Explicit opt-in; the only permitted host is the isolated, internal Docker lab.
test("M9 security matrix (master §37): employee, manager, HR, ineligible accounts and cross-scope leakage", {
  skip: process.env.HR_NEXUS_V3_LAB !== "1", timeout: 300_000,
}, async (t) => {
  await withLab(t, { label: "v3_security" }, async (lab) => {
    const { db } = lab;
    await db.query(
      `INSERT INTO public.departments (name) VALUES ('SM Lab'), ('SM Other');
       INSERT INTO public.employees (id, employee_number, full_name, department_id, employment_status, job_title, employment_date, phone, date_of_birth, address, emergency_contact_name)
       SELECT v.id, v.num, v.name, (SELECT id FROM public.departments WHERE name = v.dept), v.status, 'Staff', '2024-01-15', v.phone, v.dob::date, v.address, v.emergency
       FROM (VALUES
         (9500, 'SM-MIA', 'Mia Manager', 'SM Lab', 'active', NULL, NULL, NULL, NULL),
         (9501, 'SM-EVE', 'Eve Employee', 'SM Lab', 'active', '+60 3-5550 9501', '${EVE_DOB}', '${EVE_ADDRESS}', '${EVE_EMERGENCY}'),
         (9502, 'SM-COLE', 'Cole Coworker', 'SM Lab', 'active', NULL, NULL, NULL, NULL),
         (9503, 'SM-OLLY', 'Olly Outsider', 'SM Other', 'active', NULL, NULL, NULL, NULL),
         (9504, 'SM-REX', 'Rex Resigned', 'SM Lab', 'resigned', NULL, NULL, NULL, NULL),
         (9505, 'SM-DAN', 'Dan Deactivated', 'SM Other', 'active', NULL, NULL, NULL, NULL)
       ) AS v(id, num, name, dept, status, phone, dob, address, emergency);
       UPDATE public.employees SET manager_id = 9500 WHERE id IN (9501, 9502, 9504);
       UPDATE public.company_settings SET working_days = ARRAY[1,2,3,4,5,6,7]::smallint[] WHERE id = 1;
       INSERT INTO public.users (id, employee_id, email, password_hash, role, is_active) VALUES
         (9590, NULL, 'sm-admin@example.invalid', '${UNUSABLE_HASH}', 'admin', TRUE),
         (9591, 9500, 'sm-mia@example.invalid', '${UNUSABLE_HASH}', 'employee', TRUE),
         (9592, 9501, 'sm-eve@example.invalid', '${UNUSABLE_HASH}', 'employee', TRUE),
         (9593, 9502, 'sm-cole@example.invalid', '${UNUSABLE_HASH}', 'employee', TRUE),
         (9594, 9503, 'sm-olly@example.invalid', '${UNUSABLE_HASH}', 'employee', TRUE),
         (9595, 9504, 'sm-rex@example.invalid', '${UNUSABLE_HASH}', 'employee', TRUE),
         (9596, 9505, 'sm-dan@example.invalid', '${UNUSABLE_HASH}', 'employee', TRUE),
         (9597, NULL, 'sm-admin-two@example.invalid', '${UNUSABLE_HASH}', 'admin', TRUE);`,
    );
    const admin = lab.sign(9590, "admin", null);
    const mia = lab.sign(9591, "employee", 9500);
    const eve = lab.sign(9592, "employee", 9501);
    const cole = lab.sign(9593, "employee", 9502);
    const olly = lab.sign(9594, "employee", 9503);
    const rex = lab.sign(9595, "employee", 9504);
    const dan = lab.sign(9596, "employee", 9505);
    const adminTwo = lab.sign(9597, "admin", null);

    const today = (await lab.json<{ data: { today: string } }>("GET", "/company/calendar-config", eve)).body.data.today;
    const department = Number((await db.query("SELECT id FROM public.departments WHERE name = 'SM Lab'")).rows[0].id);
    const ok = async (method: string, path: string, token: string, body?: unknown) => {
      const response = await lab.json(method, path, token, body);
      assert.ok(response.status >= 200 && response.status < 300, `${method} ${path} -> ${response.status} ${response.text}`);
      return response;
    };
    const leakFree = (label: string, text: string, markers: string[]) => {
      for (const marker of markers) assert.equal(text.includes(marker), false, `${label} exposed "${marker}"`);
    };

    // ------------------------------------------------------------ real records, made through the API
    for (const employeeId of [9501, 9502]) {
      await ok("POST", `/payroll/compensation/${employeeId}`, admin, {
        basicSalary: employeeId === 9501 ? `${EVE_SALARY}.00` : "3900.00", allowance: "0.00", overtimeRate: "0.00",
        effectiveFrom: "2025-01-01", note: "Matrix",
      });
    }
    const period = await ok("POST", "/payroll/periods", admin, { year: 2025, month: 11 });
    const periodId = (period.body as { data: { period: { id: string } } }).data.period.id;
    await ok("POST", `/payroll/periods/${periodId}/calculate`, admin, {});
    for (const status of ["reviewed", "approved"]) await ok("PUT", `/payroll/periods/${periodId}/status`, admin, { status });
    const eveRecord = (await db.query<{ id: string }>("SELECT id FROM public.payroll_records WHERE period_id = $1 AND employee_id = 9501", [periodId])).rows[0]!.id;

    const leave = async (token: string, offset: number, reason: string) => Number(((await ok("POST", "/leaves", token, {
      leaveType: "unpaid", startDate: addDays(today, offset), endDate: addDays(today, offset + 1), reason,
    })).body as { data: { leave: { id: number } } }).data.leave.id);
    const eveLeave = await leave(eve, 20, LEAVE_REASON);
    const coleLeave = await leave(cole, 30, "Cole's trip");
    const ollyLeave = await leave(olly, 40, "Olly's trip");

    const goal = Number(((await ok("POST", "/goals", eve, {
      title: "Eve private goal", visibility: "private", startsOn: today, dueOn: addDays(today, 30), description: GOAL_DESCRIPTION,
    })).body as { data: { id: number } }).data.id);

    const cycle = Number(((await ok("POST", "/reviews/cycles", admin, {
      name: "Matrix cycle", periodStart: addDays(today, -180), periodEnd: today, selfDueOn: addDays(today, 7), managerDueOn: addDays(today, 14),
    })).body as { data: { id: number } }).data.id);
    await ok("POST", `/reviews/cycles/${cycle}/open`, admin, { departmentId: department });
    const participant = async (employeeId: number) => Number((await db.query<{ id: string }>(
      "SELECT id FROM public.review_participants WHERE cycle_id = $1 AND employee_id = $2", [cycle, employeeId])).rows[0]!.id);
    const eveReview = await participant(9501);
    const coleReview = await participant(9502);
    await ok("PUT", `/reviews/participants/${eveReview}/self`, eve, { summary: SELF_REVIEW, rating: 4, submit: true });
    await ok("PUT", `/reviews/participants/${coleReview}/self`, cole, { summary: "Cole's self-review", rating: 3, submit: true });

    await db.query(
      `INSERT INTO public.recognitions (giver_employee_id, receiver_employee_id, category, message, visibility, given_on) VALUES
         (9505, 9501, 'mentoring', '${PRIVATE_KUDOS}', 'private', '${today}'),
         (9503, 9501, 'teamwork', 'Public thanks to Eve', 'company', '${today}');
       INSERT INTO public.lifecycle_plans (employee_id, kind, title, status, starts_on, target_date) VALUES
         (9501, 'onboarding', 'Eve onboarding', 'active', '${today}', '${addDays(today, 30)}');`,
    );
    const plan = Number((await db.query<{ id: string }>("SELECT id FROM public.lifecycle_plans WHERE title = 'Eve onboarding'")).rows[0]!.id);

    // ================================================================ Employee
    await t.test("employee: own permitted data", async () => {
      const profile = await ok("GET", "/people/9501", eve);
      const body = profile.body as { data: { relation: string; layers: string[] } };
      assert.equal(body.data.relation, "self");
      assert.deepEqual(body.data.layers, ["social", "self"]);
      assert.ok(profile.text.includes("+60 3-5550 9501"), "you see your own phone");
      assert.ok((await ok("GET", "/leaves/me", eve)).text.includes(LEAVE_REASON), "and your own leave reasons");
      assert.ok((await ok("GET", `/payroll/me/payslips/${eveRecord}`, eve)).text.includes(EVE_SALARY), "and your own payslip");
      assert.ok((await ok("GET", `/reviews/participants/${eveReview}`, eve)).text.includes(SELF_REVIEW));
      assert.ok((await ok("GET", `/goals/${goal}`, eve)).text.includes(GOAL_DESCRIPTION));
      await ok("GET", "/profile", eve);
    });

    await t.test("employee: a coworker's social profile, with no sensitive field", async () => {
      const profile = await ok("GET", "/people/9501", cole);
      const body = profile.body as { data: { relation: string; layers: string[] } };
      assert.equal(body.data.relation, "coworker");
      assert.deepEqual(body.data.layers, ["social"]);
      leakFree("coworker profile", profile.text, [...SENSITIVE, "+60 3-5550 9501", EVE_SALARY]);
      // Private thanks are for the giver, the receiver and HR: not a coworker, and not the receiver's manager.
      leakFree("coworker recognition", (await ok("GET", "/people/9501/recognition", cole)).text, [PRIVATE_KUDOS]);
      leakFree("manager's view of a report's recognition", (await ok("GET", "/people/9501/recognition", mia)).text, [PRIVATE_KUDOS]);
      assert.ok((await ok("GET", "/people/9501/recognition", eve)).text.includes(PRIVATE_KUDOS), "the receiver sees it");
      leakFree("company recognition feed", (await ok("GET", "/recognition?view=company", olly)).text, [PRIVATE_KUDOS]);
      leakFree("coworker calendar", (await ok("GET", `/calendar?from=${today}&to=${addDays(today, 45)}`, cole)).text, [LEAVE_REASON, "Olly's trip"]);
    });

    await t.test("employee: manager and HR endpoints are refused", async () => {
      for (const path of ["/team", "/team/members/9501", "/team/leave", "/team/attendance", "/goals/team", "/reviews/team", "/analytics/team"]) {
        assert.equal((await lab.call("GET", path, cole)).status, 403, `employee reached manager endpoint ${path}`);
      }
      for (const path of [
        "/employees", "/employees/9501", "/payroll/periods", "/payroll/compensation/9501", `/payroll/records/${eveRecord}`,
        `/reports/payroll/${periodId}`, "/reports/workforce", "/export/datasets", "/export/datasets/employees/csv", "/audit",
        "/settings", "/settings/holidays", "/analytics/company", "/lifecycle/templates", "/reviews/cycles", "/attendance",
        "/leaves", "/announcements/manage",
      ]) {
        assert.equal((await lab.call("GET", path, cole)).status, 403, `employee reached HR endpoint ${path}`);
      }
    });

    await t.test("employee: another employee's payslip, review, leave, goal and plan are refused", async () => {
      assert.equal((await lab.call("GET", `/payroll/me/payslips/${eveRecord}`, cole)).status, 404);
      assert.equal((await lab.call("GET", `/reviews/participants/${eveReview}`, cole)).status, 404);
      assert.equal((await lab.call("GET", `/reviews/participants/${eveReview}`, olly)).status, 404);
      assert.equal((await lab.call("GET", `/leaves/${eveLeave}`, cole)).status, 404);
      assert.equal((await lab.call("GET", `/goals/${goal}`, cole)).status, 404);
      assert.equal((await lab.call("GET", `/lifecycle/plans/${plan}`, cole)).status, 404);
    });

    await t.test("employee: direct API writes around the UI are refused", async () => {
      assert.equal((await lab.call("PUT", `/leaves/${eveLeave}/status`, cole, { status: "approved", adminComment: "bypass" })).status, 403);
      assert.equal((await lab.call("PUT", `/reviews/participants/${coleReview}/manager`, cole, { summary: "Self-promotion", rating: 5, submit: true })).status, 404);
      assert.equal((await lab.call("PUT", `/reviews/participants/${eveReview}/self`, cole, { summary: "Overwrite", rating: 1, submit: false })).status, 404);
      assert.equal((await lab.call("POST", "/goals", cole, { title: "For Eve", visibility: "private", startsOn: today, dueOn: addDays(today, 5), ownerId: 9501 })).status, 403);
      assert.equal((await lab.call("PUT", `/payroll/periods/${periodId}/status`, cole, { status: "paid" })).status, 403);
      assert.equal((await lab.call("POST", "/settings/holidays", cole, { date: addDays(today, 60), name: "Bypass" })).status, 403);
      const before = (await db.query("SELECT status FROM public.leave_requests WHERE id = $1", [eveLeave])).rows[0].status;
      assert.equal(before, "pending", "nothing changed");
    });

    // ================================================================ Manager
    await t.test("manager: own data and the authorised team layer", async () => {
      await ok("GET", "/profile", mia);
      const member = await ok("GET", "/team/members/9501", mia);
      leakFree("team member", member.text, [...SENSITIVE, EVE_SALARY]);
      // By design (architecture §4): the manager decides a report's leave, so its reason is in the team layer.
      assert.ok((await ok("GET", "/team/leave", mia)).text.includes(LEAVE_REASON), "the deciding manager sees the reason");
      const profile = await ok("GET", "/people/9501", mia);
      assert.deepEqual((profile.body as { data: { layers: string[] } }).data.layers, ["social", "team"]);
      leakFree("manager's view of a report", profile.text, [...SENSITIVE, EVE_SALARY]);
      assert.ok((await ok("GET", `/goals/${goal}`, mia)).text.includes(GOAL_DESCRIPTION), "a report's private goal is the manager's to see");
      leakFree("team analytics", (await ok("GET", "/analytics/team", mia)).text, [EVE_SALARY, SELF_REVIEW, "Eve Employee"]);
    });

    await t.test("manager: people outside the team are refused", async () => {
      assert.equal((await lab.call("GET", "/team/members/9503", mia)).status, 404);
      assert.equal((await lab.call("GET", "/team/members/9504", mia)).status, 404, "a former report");
      // 404, as for any record outside the caller's scope: the request's existence is not confirmed.
      assert.equal((await lab.call("PUT", `/leaves/${ollyLeave}/status`, mia, { status: "approved", adminComment: "Not mine" })).status, 404);
      assert.equal((await lab.call("POST", "/goals", mia, { title: "For Olly", visibility: "private", startsOn: today, dueOn: addDays(today, 5), ownerId: 9503 })).status, 403);
      assert.equal((await lab.call("GET", `/people/9503`, mia)).status, 200, "a colleague's social profile is still open");
      assert.deepEqual(((await ok("GET", "/people/9503", mia)).body as { data: { layers: string[] } }).data.layers, ["social"]);
    });

    await t.test("manager: salary, payroll and private HR data are refused", async () => {
      for (const path of ["/payroll/compensation/9501", `/payroll/records/${eveRecord}`, "/payroll/periods", `/reports/payroll/${periodId}`, "/employees/9501", "/export/datasets/compensation/csv", "/audit", "/analytics/company"]) {
        assert.equal((await lab.call("GET", path, mia)).status, 403, `manager reached ${path}`);
      }
      assert.equal((await lab.call("GET", `/payroll/me/payslips/${eveRecord}`, mia)).status, 404);
      leakFree("manager's team leave", (await ok("GET", "/team/leave", mia)).text, [EVE_SALARY]);
    });

    let miaNotification = 0;
    await t.test("manager: valid team leave and review actions succeed", async () => {
      await ok("PUT", `/leaves/${eveLeave}/status`, mia, { status: "approved", adminComment: "Enjoy" });
      assert.equal((await db.query("SELECT status FROM public.leave_requests WHERE id = $1", [eveLeave])).rows[0].status, "approved");
      const view = await ok("GET", `/reviews/participants/${eveReview}`, mia);
      assert.ok(view.text.includes(SELF_REVIEW), "the submitted self-review is the manager's to read");
      await ok("PUT", `/reviews/participants/${eveReview}/manager`, mia, { summary: MANAGER_REVIEW, rating: 3, submit: true });
      const link = (await db.query<{ id: string; link: string }>(
        "SELECT id, link FROM public.notifications WHERE user_id = 9591 AND kind = 'review_submitted' ORDER BY id LIMIT 1")).rows[0];
      assert.ok(link, "the manager was told the self-review arrived");
      miaNotification = Number(link.id);
      assert.equal(link.link, `/reviews/${eveReview}`);
    });

    // ================================================================ HR
    await t.test("HR: company-wide workflows are authorised", async () => {
      for (const path of ["/employees", "/employees/9501", "/reports/workforce", "/analytics/company", "/audit", "/export/datasets", `/payroll/periods/${periodId}`]) {
        await ok("GET", path, admin);
      }
      assert.ok((await ok("GET", `/reviews/participants/${eveReview}`, admin)).text.includes(MANAGER_REVIEW));
      await ok("GET", "/export/datasets/goals/csv", admin);
      const kudos = (await db.query<{ id: string }>("SELECT id FROM public.recognitions WHERE visibility = 'company' AND receiver_employee_id = 9501")).rows[0]!.id;
      await ok("PUT", `/recognition/${kudos}/hidden`, admin, { hidden: true });
    });

    await t.test("HR: sensitive actions are audited, and the audit carries no private words", async () => {
      const actions = (await db.query<{ action: string }>("SELECT DISTINCT action FROM public.audit_events")).rows.map((row) => row.action);
      for (const action of ["SALARY_CHANGED", "PAYROLL_APPROVED", "LEAVE_APPROVED", "REVIEW_VIEWED", "DATA_EXPORTED", "RECOGNITION_HIDDEN"]) {
        assert.ok(actions.includes(action), `${action} was audited`);
      }
      const all = (await db.query<{ row: string }>("SELECT to_jsonb(a)::text AS row FROM public.audit_events a")).rows.map((entry) => entry.row).join("\n");
      leakFree("audit log", all, [SELF_REVIEW, MANAGER_REVIEW, LEAVE_REASON, GOAL_DESCRIPTION, PRIVATE_KUDOS, UNUSABLE_HASH]);
    });

    await t.test("HR: account eligibility is read on every request", async () => {
      await ok("GET", "/employees", adminTwo);
      await db.query("UPDATE public.users SET is_active = FALSE WHERE id = 9597");
      assert.equal((await lab.call("GET", "/employees", adminTwo)).status, 401);
      assert.equal((await lab.call("GET", "/auth/me", adminTwo)).status, 401);
    });

    // ================================================================ Ineligible accounts
    await t.test("deactivated and ineligible accounts: a still-valid token keeps nothing", async () => {
      await ok("GET", "/people", dan);
      await db.query("UPDATE public.users SET is_active = FALSE WHERE id = 9596");
      for (const path of ["/auth/me", "/people", "/notifications", "/action-center", "/search?q=Eve", "/profile"]) {
        assert.equal((await lab.call("GET", path, dan)).status, 401, `deactivated account reached ${path}`);
      }
      assert.equal((await lab.call("GET", "/people", rex)).status, 401, "a resigned employee's active account is not eligible");
      assert.equal((await lab.call("GET", "/employees", lab.sign(9593, "admin", 9502))).status, 401, "a token claiming a role the account does not hold");
      assert.equal((await lab.call("GET", "/people", lab.sign(9593, "employee", 9501))).status, 401, "a token claiming another employee");
    });

    // ================================================================ Search, notifications, actions
    await t.test("search: no result, record or destination outside the caller's scope", async () => {
      type Search = { data: { people: Array<{ id: number }>; records: unknown[]; destinations: Array<{ path: string }> } };
      const gone = (await ok("GET", "/search?q=Rex", cole)).body as Search;
      assert.deepEqual(gone.data.people, [], "a former employee is not found by a colleague");
      assert.deepEqual(gone.data.records, []);
      for (const term of ["payroll", "team", "reports", "audit", "settings", "performance"]) {
        const found = (await ok("GET", `/search?q=${term}`, cole)).body as Search;
        assert.equal(found.data.destinations.some((d) => d.path.startsWith("/admin") || d.path.startsWith("/team")), false, `"${term}" offered a destination outside an employee's scope`);
        assert.deepEqual(found.data.records, []);
      }
      const managerTeam = (await ok("GET", "/search?q=team", mia)).body as Search;
      assert.equal(managerTeam.data.destinations.some((d) => d.path.startsWith("/admin")), false);
      assert.deepEqual(((await ok("GET", "/search?q=Rex", mia)).body as Search).data.records, [], "managers never get HR records");
      assert.ok(((await ok("GET", "/search?q=Rex", admin)).body as Search).data.records.length > 0, "HR does");
    });

    await t.test("notifications: counts, titles and read markers stay with their owner", async () => {
      const own = (await db.query<{ count: number }>("SELECT count(*)::int AS count FROM public.notifications WHERE user_id = 9593 AND read_at IS NULL")).rows[0]!.count;
      const counted = (await ok("GET", "/notifications/unread-count", cole)).body as { data: { unreadCount: number } };
      assert.equal(counted.data.unreadCount, own);
      const list = await ok("GET", "/notifications", cole);
      const theirs = (await db.query<{ title: string }>("SELECT title FROM public.notifications WHERE user_id <> 9593")).rows.map((row) => row.title);
      const ownTitles = new Set((await db.query<{ title: string }>("SELECT title FROM public.notifications WHERE user_id = 9593")).rows.map((row) => row.title));
      for (const title of theirs) if (!ownTitles.has(title)) assert.equal(list.text.includes(title), false, `another account's notification "${title}" leaked`);
      assert.equal((await lab.call("PUT", `/notifications/${miaNotification}/read`, cole)).status, 404);
      assert.equal((await db.query("SELECT read_at FROM public.notifications WHERE id = $1", [miaNotification])).rows[0].read_at, null);
    });

    await t.test("deep links: following someone else's notification link is refused by the destination", async () => {
      assert.equal((await lab.call("GET", `/reviews/participants/${eveReview}`, cole)).status, 404, "the manager's /reviews link");
      assert.equal((await lab.call("GET", "/team/leave?status=pending", cole)).status, 403, "the manager's leave-decision link");
      assert.equal((await lab.call("GET", `/admin/lifecycle/plans/${plan}`, cole)).status, 404, "an HR page path is not an API route");
    });

    await t.test("Action Center: no item, title or count from outside the caller's scope", async () => {
      type Center = { data: { requiresAction: Array<{ kind: string; title: string }>; waiting: unknown[]; upcoming: unknown[]; recent: unknown[] } };
      const coleCenter = await ok("GET", "/action-center", cole);
      const items = (coleCenter.body as Center).data.requiresAction;
      assert.equal(items.some((item) => ["leave_decision", "payroll_step", "attendance_exception", "offboarding_ready"].includes(item.kind)), false);
      leakFree("employee Action Center", coleCenter.text, ["Olly's trip", LEAVE_REASON, SELF_REVIEW, "Decide"]);
      const ollyCenter = await ok("GET", "/action-center", olly);
      leakFree("outsider Action Center", ollyCenter.text, ["Cole Coworker", "Eve Employee", "Matrix cycle"]);
      const miaCenter = await ok("GET", "/action-center", mia);
      assert.ok(miaCenter.text.includes("Decide Cole Coworker's leave"), "the manager's own team work is there");
      leakFree("manager Action Center", miaCenter.text, ["Olly Outsider", "Olly's trip", "payroll"]);
    });

    // ================================================================ Stale relationship (last: it changes the team)
    await t.test("manager: a stale reporting line keeps no access on the next request", async () => {
      const stale = mia; // issued while Mia managed Eve and Cole
      await db.query("UPDATE public.employees SET manager_id = NULL WHERE id IN (9501, 9502, 9504)");
      for (const path of ["/team", "/team/members/9502", "/team/leave", "/goals/team", "/reviews/team", "/analytics/team"]) {
        assert.equal((await lab.call("GET", path, stale)).status, 403, `stale manager reached ${path}`);
      }
      assert.equal((await lab.call("PUT", `/leaves/${coleLeave}/status`, stale, { status: "approved", adminComment: "Stale" })).status, 403);
      assert.equal((await lab.call("GET", `/reviews/participants/${coleReview}`, stale)).status, 404);
      assert.equal((await lab.call("PUT", `/reviews/participants/${coleReview}/manager`, stale, { summary: "Stale", rating: 2, submit: true })).status, 404);
      assert.equal((await lab.call("GET", `/goals/${goal}`, stale)).status, 404);
      assert.equal(((await ok("GET", "/people/9502", stale)).body as { data: { layers: string[] } }).data.layers.includes("team"), false);
      assert.equal((await db.query("SELECT status FROM public.leave_requests WHERE id = $1", [coleLeave])).rows[0].status, "pending");
    });

    assert.equal(((await lab.protectedRows()) as { orphans: unknown[] }).orphans.length, 5);
  });
});
