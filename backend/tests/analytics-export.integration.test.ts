import assert from "node:assert/strict";
import { test } from "node:test";
import { UNUSABLE_HASH, withLab } from "./labHarness.js";

function addDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

/** Words that exist only in private content. None may leave through analytics or export. */
const PRIVATE_WORDS = [
  "SECRET-PRIVATE-GOAL-DESC", "SECRET-SELF-SUMMARY", "SECRET-SELF-TWO", "SECRET-MANAGER-SUMMARY",
  "SECRET-RESPONSE", "SECRET-PRIVATE-THANKS", "SECRET-TASK-NOTE", "SECRET-NOTIFICATION-TITLE",
];

const V3_DATASETS = [
  "reporting-lines", "company-holidays", "company-events", "announcements", "lifecycle-plans",
  "lifecycle-tasks", "recognitions", "goals", "review-cycles", "review-participation",
];

// Explicit opt-in; the only permitted host is the isolated, internal Docker lab.
test("M8 analytics, export and settings: real counts, bounded scope, nothing private exported", {
  skip: process.env.HR_NEXUS_V3_LAB !== "1", timeout: 240_000,
}, async (t) => {
  await withLab(t, { label: "v3_analytics" }, async (lab) => {
    const { db } = lab;
    await db.query(
      `INSERT INTO public.departments (name) VALUES ('AX Lab');
       INSERT INTO public.employees (id, employee_number, full_name, department_id, employment_status, job_title, employment_date)
       SELECT v.id, v.num, v.name, (SELECT id FROM public.departments WHERE name = 'AX Lab'), v.status, 'Staff', '2024-01-15'
       FROM (VALUES
         (9400, 'AX-MAX', 'Max Manager', 'active'),
         (9401, 'AX-ANA', 'Ana Report', 'active'),
         (9402, 'AX-BEN', 'Ben Report', 'probation'),
         (9403, 'AX-CY', 'Cy Other', 'active'),
         (9404, 'AX-GUS', 'Gus Gone', 'resigned')
       ) AS v(id, num, name, status);
       UPDATE public.employees SET manager_id = 9400 WHERE id IN (9401, 9402, 9404);
       INSERT INTO public.users (id, employee_id, email, password_hash, role, is_active) VALUES
         (9490, NULL, 'ax-admin@example.invalid', '${UNUSABLE_HASH}', 'admin', TRUE),
         (9491, 9400, 'ax-max@example.invalid', '${UNUSABLE_HASH}', 'employee', TRUE),
         (9492, 9401, 'ax-ana@example.invalid', '${UNUSABLE_HASH}', 'employee', TRUE),
         (9493, 9403, 'ax-cy@example.invalid', '${UNUSABLE_HASH}', 'employee', TRUE);`,
    );
    const admin = lab.sign(9490, "admin", null);
    const max = lab.sign(9491, "employee", 9400);
    const ana = lab.sign(9492, "employee", 9401);
    const cy = lab.sign(9493, "employee", 9403);

    const today = (await lab.json<{ data: { today: string } }>("GET", "/company/calendar-config", ana)).body.data.today;
    const d = (offset: number) => `'${addDays(today, offset)}'`;
    const year = Number(today.slice(0, 4));

    await db.query(
      `INSERT INTO public.goals (owner_employee_id, title, description, starts_on, due_on, status, progress, visibility, created_as, completed_at, cancelled_at) VALUES
         (9401, 'AX private goal', 'SECRET-PRIVATE-GOAL-DESC', ${d(-60)}, ${d(-5)}, 'active', 20, 'private', 'owner', NULL, NULL),
         (9401, 'AX company goal', 'Public goal description', ${d(-60)}, ${d(10)}, 'completed', 100, 'company', 'owner', now(), NULL),
         (9402, 'AX team goal', NULL, ${d(-60)}, ${d(30)}, 'active', 50, 'team', 'manager', NULL, NULL),
         (9403, 'AX other goal', NULL, ${d(-60)}, ${d(-1)}, 'cancelled', 10, 'company', 'owner', NULL, now()),
         (9404, 'AX gone goal', NULL, ${d(-60)}, ${d(-5)}, 'active', 0, 'private', 'owner', NULL, NULL);

       INSERT INTO public.review_cycles (name, period_start, period_end, self_due_on, manager_due_on, status, opened_at, closed_at) VALUES
         ('AX Cycle', ${d(-180)}, ${d(-1)}, ${d(5)}, ${d(12)}, 'open', now(), NULL),
         ('AX Old', ${d(-400)}, ${d(-200)}, ${d(-190)}, ${d(-180)}, 'closed', now() - interval '200 days', now() - interval '170 days'),
         ('AX Draft', ${d(0)}, ${d(90)}, ${d(100)}, ${d(110)}, 'draft', NULL, NULL);
       INSERT INTO public.review_participants (cycle_id, employee_id, status, self_summary, self_rating, self_submitted_at,
           manager_summary, manager_rating, manager_submitted_at, employee_response, responded_at)
       SELECT c.id, v.employee_id, v.status, v.self_summary, v.self_rating, v.self_at, v.manager_summary, v.manager_rating, v.manager_at, v.response, v.responded_at
       FROM (VALUES
         ('AX Cycle', 9401, 'completed', 'SECRET-SELF-SUMMARY', 4, now(), 'SECRET-MANAGER-SUMMARY', 3, now(), 'SECRET-RESPONSE', now()),
         ('AX Cycle', 9402, 'pending_manager', 'SECRET-SELF-TWO', 5, now(), NULL, NULL, NULL, NULL, NULL),
         ('AX Cycle', 9403, 'pending_self', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
         ('AX Cycle', 9404, 'pending_self', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
         ('AX Old', 9401, 'completed', 'Old self words', 3, now(), 'Old manager words', 3, now(), NULL, NULL)
       ) AS v(cycle, employee_id, status, self_summary, self_rating, self_at, manager_summary, manager_rating, manager_at, response, responded_at)
       JOIN public.review_cycles c ON c.name = v.cycle;

       INSERT INTO public.recognitions (giver_employee_id, receiver_employee_id, category, message, visibility, given_on, hidden_at) VALUES
         (9403, 9401, 'teamwork', 'Great pairing session', 'company', ${d(0)}, NULL),
         (9402, 9401, 'mentoring', 'SECRET-PRIVATE-THANKS', 'private', ${d(0)}, NULL),
         (9401, 9402, 'teamwork', 'Thanks for the review help', 'company', ${d(-1)}, NULL),
         (9403, 9402, 'problem_solving', 'Hidden message words', 'company', ${d(0)}, now()),
         (9400, 9403, 'customer_focus', 'Window edge thanks', 'company', ${d(-89)}, NULL),
         (9400, 9401, 'mentoring', 'Just outside the window', 'company', ${d(-90)}, NULL);

       INSERT INTO public.lifecycle_plans (employee_id, kind, title, status, starts_on, target_date, exit_status, completed_at, cancelled_at) VALUES
         (9402, 'onboarding', 'AX onboarding', 'active', ${d(-10)}, ${d(20)}, NULL, NULL, NULL),
         (9404, 'offboarding', 'AX offboarding', 'completed', ${d(-40)}, ${d(-30)}, 'resigned', now() - interval '5 days', NULL),
         (9403, 'onboarding', 'AX cancelled', 'cancelled', ${d(-10)}, ${d(20)}, NULL, NULL, now()),
         (9401, 'offboarding', 'AX long ago', 'completed', ${d(-300)}, ${d(-290)}, 'resigned', now() - interval '200 days', NULL);
       INSERT INTO public.lifecycle_tasks (plan_id, position, title, assignee_role, due_on, status, note, completed_at)
       SELECT p.id, v.position, v.title, v.role, v.due_on::date, v.status, v.note, v.completed_at
       FROM (VALUES
         (1, 'Sign the contract', 'employee', ${d(-8)}, 'done', 'SECRET-TASK-NOTE', now()),
         (2, 'Set up laptop', 'hr', ${d(-2)}, 'pending', NULL, NULL::timestamptz),
         (3, 'Meet the team', 'manager', ${d(5)}, 'pending', NULL, NULL),
         (4, 'Optional course', 'employee', ${d(-3)}, 'skipped', NULL, now())
       ) AS v(position, title, role, due_on, status, note, completed_at)
       CROSS JOIN public.lifecycle_plans p WHERE p.title = 'AX onboarding';

       INSERT INTO public.leave_requests (employee_id, leave_type, start_date, end_date, reason, status, working_days, leave_year) VALUES
         (9401, 'annual', '${year}-02-02', '${year}-02-03', 'Dentist appointment', 'approved', 2, ${year}),
         (9402, 'medical', '${year}-03-02', '${year}-03-02', 'Flu', 'approved', 1, ${year}),
         (9402, 'annual', '${year}-11-02', '${year}-11-04', 'Trip', 'pending', 3, ${year}),
         (9403, 'annual', '${year}-04-06', '${year}-04-10', 'Trip', 'approved', 5, ${year}),
         (9401, 'annual', '${year - 1}-04-06', '${year - 1}-04-09', 'Last year', 'approved', 4, ${year - 1});

       INSERT INTO public.notifications (user_id, kind, title) VALUES (9492, 'goal_updated', 'SECRET-NOTIFICATION-TITLE');
       INSERT INTO public.announcements (title, body, priority, audience, status, published_at)
         VALUES ('AX notice', 'Announcement body words', 'normal', 'company', 'published', now());`,
    );

    type Company = {
      data: {
        windowStart: string; windowDays: number;
        lifecycle: {
          onboarding: { active: number; overdueTasks: number; completedInWindow: number };
          offboarding: { active: number; overdueTasks: number; completedInWindow: number };
          plans: Array<{ title: string; employeeName: string; tasksFinished: number; tasksTotal: number; overdueTasks: number }>;
        };
        performance: {
          goals: { active: number; completed: number; cancelled: number; overdue: number };
          cycles: Array<{ name: string; status: string; participants: number; pendingSelf: number; pendingManager: number; completed: number }>;
        };
        recognition: { total: number; employeesRecognised: number; workingEmployees: number; byCategory: Array<{ category: string; count: number }> };
      };
    };

    await t.test("HR's company analytics match hand counts", async () => {
      const response = await lab.json<Company>("GET", "/analytics/company", admin);
      assert.equal(response.status, 200, response.text);
      const data = response.body.data;
      assert.equal(data.windowStart, addDays(today, -89));
      assert.deepEqual(data.lifecycle.onboarding, { active: 1, overdueTasks: 1, completedInWindow: 0 });
      assert.deepEqual(data.lifecycle.offboarding, { active: 0, overdueTasks: 0, completedInWindow: 1 });
      assert.deepEqual(data.lifecycle.plans.map(({ title, employeeName, tasksFinished, tasksTotal, overdueTasks }) => ({ title, employeeName, tasksFinished, tasksTotal, overdueTasks })),
        [{ title: "AX onboarding", employeeName: "Ben Report", tasksFinished: 2, tasksTotal: 4, overdueTasks: 1 }],
        "done and skipped both count as finished; only pending past-due tasks are overdue");
      assert.deepEqual(data.performance.goals, { active: 2, completed: 1, cancelled: 1, overdue: 1 }, "a former employee's goal is not counted");
      assert.deepEqual(data.performance.cycles.map(({ name, status, participants, pendingSelf, pendingManager, completed }) => ({ name, status, participants, pendingSelf, pendingManager, completed })), [
        { name: "AX Cycle", status: "open", participants: 4, pendingSelf: 2, pendingManager: 1, completed: 1 },
        { name: "AX Old", status: "closed", participants: 1, pendingSelf: 0, pendingManager: 0, completed: 1 },
      ], "open first, drafts never");
      const working = (await db.query<{ count: number }>("SELECT count(*)::int AS count FROM public.employees WHERE employment_status IN ('active', 'probation')")).rows[0]!.count;
      assert.deepEqual(data.recognition, {
        total: 4, employeesRecognised: 3, workingEmployees: working,
        byCategory: [{ category: "teamwork", count: 2 }, { category: "customer_focus", count: 1 }, { category: "mentoring", count: 1 }],
      }, "hidden and out-of-window recognition is not counted; the window's first day is");
      for (const word of PRIVATE_WORDS) assert.equal(response.text.includes(word), false, `company analytics exposed ${word}`);
    });

    await t.test("company analytics are HR's alone", async () => {
      assert.equal((await lab.call("GET", "/analytics/company")).status, 401);
      for (const token of [max, ana, cy]) assert.equal((await lab.call("GET", "/analytics/company", token)).status, 403);
      assert.equal((await lab.call("GET", "/analytics/everything", admin)).status, 404);
    });

    type Team = {
      data: {
        teamSize: number;
        goals: { active: number; completed: number; cancelled: number; overdue: number };
        reviews: Array<{ name: string; participants: number; pendingSelf: number; pendingManager: number; completed: number }>;
        leave: { year: number; approvedDays: Array<{ leaveType: string; days: number }> };
        recognition: { total: number; byCategory: Array<{ category: string; count: number }> };
        lifecycle: { onboarding: number; offboarding: number };
      };
    };

    await t.test("team analytics count only the manager's current working reports, and name nobody", async () => {
      const response = await lab.json<Team>("GET", "/analytics/team", max);
      assert.equal(response.status, 200, response.text);
      const data = response.body.data;
      assert.equal(data.teamSize, 2, "the resigned report is not in the team");
      assert.deepEqual(data.goals, { active: 2, completed: 1, cancelled: 0, overdue: 1 });
      assert.deepEqual(data.reviews.map(({ name, participants, pendingSelf, pendingManager, completed }) => ({ name, participants, pendingSelf, pendingManager, completed })),
        [{ name: "AX Cycle", participants: 2, pendingSelf: 0, pendingManager: 1, completed: 1 }], "open cycles only");
      assert.deepEqual(data.leave, { year, approvedDays: [{ leaveType: "annual", days: 2 }, { leaveType: "medical", days: 1 }] });
      assert.deepEqual(data.recognition, { total: 2, byCategory: [{ category: "teamwork", count: 2 }] }, "private thanks never reach a manager's figures");
      assert.deepEqual(data.lifecycle, { onboarding: 1, offboarding: 0 });
      for (const word of [...PRIVATE_WORDS, "Ana Report", "Ben Report", "Cy Other", "Dentist", "rating", "summary"]) {
        assert.equal(response.text.includes(word), false, `team analytics exposed ${word}`);
      }
    });

    await t.test("team analytics need someone who manages people now", async () => {
      assert.equal((await lab.json<{ code: string }>("GET", "/analytics/team", ana)).body.code, "not_a_manager");
      assert.equal((await lab.call("GET", "/analytics/team", cy)).status, 403);
      assert.equal((await lab.call("GET", "/analytics/team", admin)).status, 403, "HR without reports has no team");
    });

    await t.test("a report who moves leaves the manager's figures on the next request", async () => {
      await db.query("UPDATE public.employees SET manager_id = NULL WHERE id = 9402");
      const data = (await lab.json<Team>("GET", "/analytics/team", max)).body.data;
      assert.equal(data.teamSize, 1);
      assert.deepEqual(data.goals, { active: 1, completed: 1, cancelled: 0, overdue: 1 });
      assert.deepEqual(data.reviews.map((cycle) => cycle.participants), [1]);
      assert.deepEqual(data.leave.approvedDays, [{ leaveType: "annual", days: 2 }]);
      assert.equal(data.recognition.total, 1);
      assert.equal(data.lifecycle.onboarding, 0);
      await db.query("UPDATE public.employees SET manager_id = 9400 WHERE id = 9402");
    });

    await t.test("V3 export datasets hold what HR may retrieve and nothing private", async () => {
      const listed = await lab.json<{ data: { datasets: Array<{ key: string }> } }>("GET", "/export/datasets", admin);
      assert.equal(listed.status, 200, listed.text);
      const keys = listed.body.data.datasets.map((dataset) => dataset.key);
      for (const key of V3_DATASETS) assert.ok(keys.includes(key), `${key} is listed`);

      const csv: Record<string, string> = {};
      for (const key of keys) {
        const response = await lab.call("GET", `/export/datasets/${key}/csv`, admin);
        assert.equal(response.status, 200, key);
        csv[key] = await response.text();
        for (const word of PRIVATE_WORDS) assert.equal(csv[key]!.includes(word), false, `${key} exported ${word}`);
      }
      assert.match(csv["reporting-lines"]!, /AX-ANA,Ana Report,active,9400,AX-MAX,Max Manager/);
      assert.ok(csv.recognitions!.includes("Great pairing session") && csv.recognitions!.includes("Hidden message words"));
      assert.ok(csv.goals!.includes("AX private goal") && csv.goals!.includes("Public goal description"), "titles stay; only private descriptions go");
      const participation = csv["review-participation"]!;
      assert.ok(participation.includes("AX Cycle") && participation.includes("pending_manager") && participation.includes(",Yes"));
      assert.equal(/rating|summary|response/i.test(participation.split("\n")[0]!), false, "no content columns");
      assert.ok(csv["lifecycle-tasks"]!.includes("Set up laptop"));
      assert.ok(csv.announcements!.includes("Announcement body words"));

      for (const token of [max, ana]) assert.equal((await lab.call("GET", "/export/datasets/goals/csv", token)).status, 403);
    });

    await t.test("holidays: validation, duplicates, revisions, removal and export", async () => {
      const date = addDays(today, 40);
      assert.equal((await lab.call("POST", "/settings/holidays", ana, { date, name: "Nope" })).status, 403);
      assert.equal((await lab.call("POST", "/settings/holidays", admin, { date, name: "   " })).status, 400);
      assert.equal((await lab.call("POST", "/settings/holidays", admin, { date: "2026-13-01", name: "Bad" })).status, 400);
      assert.equal((await lab.call("POST", "/settings/holidays", admin, { date, name: "AX Holiday" })).status, 201);
      assert.equal((await lab.json<{ code: string }>("POST", "/settings/holidays", admin, { date, name: "Twice" })).body.code, "duplicate_date");
      const id = (await db.query<{ id: string }>("SELECT id FROM public.company_holidays WHERE name = 'AX Holiday'")).rows[0]!.id;
      assert.equal((await lab.json<{ code: string }>("PUT", `/settings/holidays/${id}`, admin, { date, name: "Stale", revision: 9 })).body.code, "stale_revision");
      assert.equal((await lab.call("PUT", `/settings/holidays/${id}`, admin, { date, name: "AX Holiday Renamed", revision: 1 })).status, 200);
      assert.ok((await (await lab.call("GET", "/export/datasets/company-holidays/csv", admin)).text()).includes("AX Holiday Renamed"));
      assert.equal((await lab.call("DELETE", `/settings/holidays/${id}`, admin)).status, 200);
      assert.equal((await lab.call("DELETE", `/settings/holidays/${id}`, admin)).status, 404);
    });

    assert.equal(((await lab.protectedRows()) as { orphans: unknown[] }).orphans.length, 5);
  });
});
