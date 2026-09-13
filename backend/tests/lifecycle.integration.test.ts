import assert from "node:assert/strict";
import { test } from "node:test";
import { UNUSABLE_HASH, withLab } from "./labHarness.js";

function addDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

// Explicit opt-in; the only permitted host is the isolated, internal Docker lab.
test("M4 lifecycle: templates, scoped plans and tasks, and offboarding that deactivates safely", {
  skip: process.env.HR_NEXUS_V3_LAB !== "1", timeout: 300_000,
}, async (t) => {
  await withLab(t, { label: "v3_lifecycle" }, async (lab) => {
    const { db } = lab;
    await db.query(
      `INSERT INTO public.departments (name) VALUES ('Lifecycle Lab');
       INSERT INTO public.employees (id, employee_number, full_name, department_id, employment_status, job_title, employment_date)
       SELECT v.id, v.num, v.name, (SELECT id FROM public.departments WHERE name = 'Lifecycle Lab'), v.status, 'Staff', '2024-01-15'
       FROM (VALUES
         (9800, 'LCL-LENA', 'Lena Lead', 'active'),
         (9801, 'LCL-NICO', 'Nico New', 'probation'),
         (9802, 'LCL-OTTO', 'Otto Other', 'active'),
         (9803, 'LCL-LOU', 'Lou Leaver', 'active'),
         (9804, 'LCL-RHEA', 'Rhea Report', 'active'),
         (9805, 'LCL-MO', 'Mo Manager', 'active'),
         (9806, 'LCL-GINA', 'Gina Gone', 'resigned')
       ) AS v(id, num, name, status);
       UPDATE public.employees SET manager_id = 9800 WHERE id IN (9801, 9803);
       UPDATE public.employees SET manager_id = 9803 WHERE id = 9804;
       INSERT INTO public.users (id, employee_id, email, password_hash, role, is_active) VALUES
         (9890, NULL, 'lifecycle-admin@example.invalid', '${UNUSABLE_HASH}', 'admin', TRUE),
         (9891, 9800, 'lena@example.invalid', '${UNUSABLE_HASH}', 'employee', TRUE),
         (9892, 9801, 'nico@example.invalid', '${UNUSABLE_HASH}', 'employee', TRUE),
         (9893, 9802, 'otto@example.invalid', '${UNUSABLE_HASH}', 'employee', TRUE),
         (9894, 9803, 'lou@example.invalid', '${UNUSABLE_HASH}', 'employee', TRUE),
         (9895, 9805, 'mo@example.invalid', '${UNUSABLE_HASH}', 'employee', TRUE);
       INSERT INTO public.attendance (employee_id, attendance_date, check_in_time, status)
         VALUES (9803, '2026-09-01', '09:00', 'present');
       INSERT INTO public.leave_requests (employee_id, leave_type, start_date, end_date, reason, status, working_days, leave_year)
         VALUES (9803, 'unpaid', '2026-08-03', '2026-08-03', 'History that must stay', 'pending', 1, 2026);`,
    );

    const admin = lab.sign(9890, "admin", null);
    const lena = lab.sign(9891, "employee", 9800);
    const nico = lab.sign(9892, "employee", 9801);
    const otto = lab.sign(9893, "employee", 9802);
    const lou = lab.sign(9894, "employee", 9803);
    const mo = lab.sign(9895, "employee", 9805);

    const today = (await lab.json<{ data: { today: string } }>("GET", "/company/calendar-config", otto)).body.data.today;
    const kindsFor = async (userId: number) => (await db.query<{ kind: string; title: string; link: string }>(
      "SELECT kind, title, link FROM public.notifications WHERE user_id = $1 ORDER BY id", [userId],
    )).rows;
    type Detail = { data: { roles: string[]; plan: { status: string; progress: { total: number; finished: number } }; tasks: Array<{ id: number; title: string; assigneeRole: string; dueOn: string; status: string }> } };
    type Work = { data: { assigned: Array<{ id: number; title: string }>; ownPlans: Array<{ id: number }>; teamPlans: Array<{ id: number }> } };

    await t.test("HR-only endpoints refuse everyone else, and anonymous callers get nothing", async () => {
      for (const [method, path] of [["GET", "/lifecycle/templates"], ["POST", "/lifecycle/templates"], ["GET", "/lifecycle/plans"], ["POST", "/lifecycle/plans"], ["POST", "/lifecycle/plans/1/complete"], ["POST", "/lifecycle/plans/1/cancel"]] as const) {
        assert.equal((await lab.call(method, path, lena, {})).status, 403, `${method} ${path}`);
        assert.equal((await lab.call(method, path, null, {})).status, 401, `${method} ${path} anonymous`);
      }
      assert.equal((await lab.call("GET", "/lifecycle/my-work")).status, 401);
    });

    let onboardingTemplate = 0;
    let offboardingTemplate = 0;

    await t.test("templates validate strictly, refuse duplicates and stale edits", async () => {
      const bad = [
        { kind: "onboarding", name: "No tasks", tasks: [] },
        { kind: "onboarding", name: "Bad role", tasks: [{ title: "x", assigneeRole: "ceo" }] },
        { kind: "onboarding", name: "Bad offset", tasks: [{ title: "x", assigneeRole: "hr", dueOffsetDays: 999 }] },
        { kind: "onboarding", name: "Extra", tasks: [{ title: "x", assigneeRole: "hr" }], owner: 1 },
        { kind: "sideboarding", name: "Kind", tasks: [{ title: "x", assigneeRole: "hr" }] },
      ];
      for (const body of bad) assert.equal((await lab.call("POST", "/lifecycle/templates", admin, body)).status, 400, JSON.stringify(body));

      const created = await lab.json<{ data: { id: number } }>("POST", "/lifecycle/templates", admin, {
        kind: "onboarding", name: "Lab onboarding", description: "First weeks",
        tasks: [
          { title: "Sign contract", assigneeRole: "employee", dueOffsetDays: 0 },
          { title: "Plan first week", assigneeRole: "manager", dueOffsetDays: 1 },
          { title: "Create accounts", assigneeRole: "hr", dueOffsetDays: -1 },
        ],
      });
      assert.equal(created.status, 201, created.text);
      onboardingTemplate = created.body.data.id;
      assert.equal((await lab.call("POST", "/lifecycle/templates", admin, {
        kind: "onboarding", name: "LAB ONBOARDING", tasks: [{ title: "x", assigneeRole: "hr" }],
      })).status, 409, "names are unique per kind, ignoring case");

      const off = await lab.json<{ data: { id: number } }>("POST", "/lifecycle/templates", admin, {
        kind: "offboarding", name: "Lab offboarding",
        tasks: [
          { title: "Return laptop", assigneeRole: "employee", dueOffsetDays: -1 },
          { title: "Handover", assigneeRole: "manager", dueOffsetDays: -3 },
          { title: "Revoke access", assigneeRole: "hr", dueOffsetDays: 0 },
        ],
      });
      assert.equal(off.status, 201, off.text);
      offboardingTemplate = off.body.data.id;

      const stale = { name: "Lab onboarding", isActive: true, tasks: [{ title: "x", assigneeRole: "hr" }], revision: 9 };
      assert.equal((await lab.call("PUT", `/lifecycle/templates/${onboardingTemplate}`, admin, stale)).status, 409);
      const updated = await lab.call("PUT", `/lifecycle/templates/${onboardingTemplate}`, admin, {
        name: "Lab onboarding", description: "First weeks", isActive: true, revision: 1,
        tasks: [
          { title: "Sign contract", assigneeRole: "employee", dueOffsetDays: 0 },
          { title: "Plan first week", assigneeRole: "manager", dueOffsetDays: 1 },
          { title: "Create accounts", assigneeRole: "hr", dueOffsetDays: -1 },
          { title: "Welcome lunch", assigneeRole: "manager", dueOffsetDays: 3 },
        ],
      });
      assert.equal(updated.status, 200, await updated.text());
      const list = await lab.json<{ data: { templates: Array<{ id: number; tasks: unknown[] }> } }>("GET", "/lifecycle/templates?kind=onboarding", admin);
      assert.equal(list.body.data.templates.find((template) => template.id === onboardingTemplate)?.tasks.length, 4);
    });

    let onboardingPlan = 0;

    await t.test("starting a plan copies the checklist, dates it, and tells whoever holds each role", async () => {
      assert.equal((await lab.call("POST", "/lifecycle/plans", admin, {
        employeeId: 9801, kind: "onboarding", templateId: offboardingTemplate, startsOn: today, targetDate: addDays(today, 30),
      })).status, 400, "the checklist must be of the same kind");
      assert.equal((await lab.call("POST", "/lifecycle/plans", admin, {
        employeeId: 9806, kind: "onboarding", templateId: onboardingTemplate, startsOn: today, targetDate: addDays(today, 30),
      })).status, 409, "not for someone who has left");
      assert.equal((await lab.call("POST", "/lifecycle/plans", admin, {
        employeeId: 9801, kind: "onboarding", templateId: onboardingTemplate, startsOn: today, targetDate: addDays(today, 30), exitStatus: "resigned",
      })).status, 400, "onboarding has no exit status");

      const started = await lab.json<{ data: { id: number } }>("POST", "/lifecycle/plans", admin, {
        employeeId: 9801, kind: "onboarding", templateId: onboardingTemplate, startsOn: today, targetDate: addDays(today, 30),
      });
      assert.equal(started.status, 201, started.text);
      onboardingPlan = started.body.data.id;
      assert.equal((await lab.call("POST", "/lifecycle/plans", admin, {
        employeeId: 9801, kind: "onboarding", templateId: onboardingTemplate, startsOn: today, targetDate: addDays(today, 30),
      })).status, 409, "one active plan per employee per kind");

      const detail = await lab.json<Detail>("GET", `/lifecycle/plans/${onboardingPlan}`, admin);
      assert.equal(detail.body.data.tasks.length, 4);
      assert.equal(detail.body.data.tasks.find((task) => task.title === "Create accounts")?.dueOn, addDays(today, -1));

      assert.deepEqual((await kindsFor(9892)).map((row) => row.kind), ["plan_started"]);
      assert.deepEqual((await kindsFor(9891)).map((row) => [row.kind, row.title]), [["task_assigned", "2 tasks for Nico New's onboarding"]]);
      assert.equal((await kindsFor(9890)).length, 0, "the HR member who started it is not told about it");
      const timeline = await db.query("SELECT visibility FROM public.employee_events WHERE employee_id = 9801 AND kind = 'onboarding_started'");
      assert.deepEqual(timeline.rows, [{ visibility: "company" }]);
    });

    await t.test("each role sees its own tasks; a stranger sees no plan at all", async () => {
      const self = await lab.json<Detail>("GET", `/lifecycle/plans/${onboardingPlan}`, nico);
      assert.deepEqual(self.body.data.roles, ["employee"]);
      assert.deepEqual(self.body.data.tasks.map((task) => task.title), ["Sign contract"]);
      assert.equal(self.body.data.plan.progress.total, 4, "progress counts are shared; titles are not");
      const manager = await lab.json<Detail>("GET", `/lifecycle/plans/${onboardingPlan}`, lena);
      assert.deepEqual(manager.body.data.tasks.map((task) => task.title), ["Plan first week", "Welcome lunch"]);
      assert.equal((await lab.call("GET", `/lifecycle/plans/${onboardingPlan}`, otto)).status, 404);

      const lenaWork = await lab.json<Work>("GET", "/lifecycle/my-work", lena);
      assert.deepEqual(lenaWork.body.data.assigned.map((task) => task.title), ["Plan first week", "Welcome lunch"]);
      assert.deepEqual(lenaWork.body.data.teamPlans.map((plan) => plan.id), [onboardingPlan]);
      assert.deepEqual((await lab.json<Work>("GET", "/lifecycle/my-work", otto)).body.data.assigned, []);
      assert.deepEqual((await lab.json<Work>("GET", "/lifecycle/my-work", nico)).body.data.ownPlans.map((plan) => plan.id), [onboardingPlan]);

      const center = await lab.json<{ data: { requiresAction: Array<{ kind: string; title: string; link: string }> } }>("GET", "/action-center", lena);
      assert.ok(center.body.data.requiresAction.some((item) => item.kind === "lifecycle_task" && item.title === "Plan first week" && item.link === "/tasks"));
      const ottoCenter = await lab.json<{ text: string }>("GET", "/action-center", otto);
      assert.equal(ottoCenter.text.includes("Plan first week"), false);
    });

    await t.test("only the role holder or HR moves a task; only HR skips; the last one completes onboarding", async () => {
      const tasks = (await lab.json<Detail>("GET", `/lifecycle/plans/${onboardingPlan}`, admin)).body.data.tasks;
      const id = (title: string) => tasks.find((task) => task.title === title)!.id;

      assert.equal((await lab.call("PUT", `/lifecycle/tasks/${id("Sign contract")}`, otto, { status: "done" })).status, 404);
      assert.equal((await lab.call("PUT", `/lifecycle/tasks/${id("Plan first week")}`, nico, { status: "done" })).status, 404);
      assert.equal((await lab.call("PUT", `/lifecycle/tasks/${id("Sign contract")}`, nico, { status: "skipped" })).status, 403);
      assert.equal((await lab.call("PUT", `/lifecycle/tasks/${id("Sign contract")}`, nico, { status: "finished" })).status, 400);
      assert.equal((await lab.call("PUT", `/lifecycle/tasks/${id("Sign contract")}`, nico, { status: "done", note: "Signed copy with HR desk" })).status, 200);
      assert.equal((await lab.call("PUT", `/lifecycle/tasks/${id("Plan first week")}`, lena, { status: "done" })).status, 200);
      assert.equal((await lab.call("PUT", `/lifecycle/tasks/${id("Welcome lunch")}`, admin, { status: "skipped" })).status, 200);
      const last = await lab.json<{ data: { planCompleted: boolean } }>("PUT", `/lifecycle/tasks/${id("Create accounts")}`, admin, { status: "done" });
      assert.equal(last.body.data.planCompleted, true);

      const plan = await lab.json<Detail>("GET", `/lifecycle/plans/${onboardingPlan}`, admin);
      assert.equal(plan.body.data.plan.status, "completed");
      assert.equal((await lab.call("PUT", `/lifecycle/tasks/${id("Sign contract")}`, nico, { status: "pending" })).status, 409, "a closed plan's tasks are history");
      const timeline = await db.query("SELECT visibility FROM public.employee_events WHERE employee_id = 9801 AND kind = 'onboarding_completed'");
      assert.equal(timeline.rowCount, 1);
      const audit = await db.query<{ changes: string }>("SELECT changes::text AS changes FROM public.audit_events WHERE action = 'LIFECYCLE_TASK_UPDATED'");
      assert.equal(audit.rowCount, 4);
      assert.equal(JSON.stringify(audit.rows).includes("Signed copy"), false, "the note itself is not copied into the audit log");
    });

    let offboardingPlan = 0;

    await t.test("offboarding follows the reporting line as it is now", async () => {
      const started = await lab.json<{ data: { id: number } }>("POST", "/lifecycle/plans", admin, {
        employeeId: 9803, kind: "offboarding", templateId: offboardingTemplate,
        startsOn: today, targetDate: addDays(today, 5), exitStatus: "resigned",
      });
      assert.equal(started.status, 201, started.text);
      offboardingPlan = started.body.data.id;
      assert.equal((await db.query("SELECT is_active FROM public.users WHERE id = 9894")).rows[0].is_active, true, "starting offboarding changes no account");
      const timeline = await db.query("SELECT visibility FROM public.employee_events WHERE employee_id = 9803 AND kind = 'offboarding_started'");
      assert.deepEqual(timeline.rows, [{ visibility: "management" }]);
      assert.equal((await lab.json("GET", "/people/9803/timeline", otto)).text.includes("Offboarding"), false, "colleagues are not told before it happens");

      const handover = (await lab.json<Detail>("GET", `/lifecycle/plans/${offboardingPlan}`, admin)).body.data.tasks.find((task) => task.title === "Handover")!;
      assert.ok((await lab.json<Work>("GET", "/lifecycle/my-work", lena)).body.data.assigned.some((task) => task.id === handover.id));

      // HR moves Lou to a new manager mid-plan.
      await db.query("UPDATE public.employees SET manager_id = 9805 WHERE id = 9803");
      assert.equal((await lab.json<Work>("GET", "/lifecycle/my-work", lena)).body.data.assigned.some((task) => task.id === handover.id), false);
      assert.equal((await lab.call("PUT", `/lifecycle/tasks/${handover.id}`, lena, { status: "done" })).status, 404, "the old manager lost the task at once");
      assert.equal((await lab.call("GET", `/lifecycle/plans/${offboardingPlan}`, lena)).status, 404);
      assert.equal((await lab.call("PUT", `/lifecycle/tasks/${handover.id}`, mo, { status: "done" })).status, 200, "the new manager holds it");
    });

    await t.test("completing offboarding waits for the tasks, the last day and the team, then deactivates and keeps history", async () => {
      assert.equal((await lab.json<{ code: string }>("POST", `/lifecycle/plans/${offboardingPlan}/complete`, admin)).body.code, "tasks_pending");
      const tasks = (await lab.json<Detail>("GET", `/lifecycle/plans/${offboardingPlan}`, admin)).body.data.tasks;
      assert.equal((await lab.call("PUT", `/lifecycle/tasks/${tasks.find((task) => task.title === "Return laptop")!.id}`, lou, { status: "done" })).status, 200);
      assert.equal((await lab.call("PUT", `/lifecycle/tasks/${tasks.find((task) => task.title === "Revoke access")!.id}`, admin, { status: "done" })).status, 200);
      const stillActive = await lab.json<Detail>("GET", `/lifecycle/plans/${offboardingPlan}`, admin);
      assert.equal(stillActive.body.data.plan.status, "active", "offboarding never completes itself");

      assert.equal((await lab.json<{ code: string }>("POST", `/lifecycle/plans/${offboardingPlan}/complete`, admin)).body.code, "before_last_day");
      await db.query("UPDATE public.lifecycle_plans SET target_date = $1, starts_on = $1 WHERE id = $2", [today, offboardingPlan]);

      const ready = await lab.json<{ data: { requiresAction: Array<{ id: string; link: string }> } }>("GET", "/action-center", admin);
      assert.ok(ready.body.data.requiresAction.some((item) => item.id === `offboarding:${offboardingPlan}` && item.link === `/admin/lifecycle/plans/${offboardingPlan}`));

      assert.equal((await lab.json<{ code: string }>("POST", `/lifecycle/plans/${offboardingPlan}/complete`, admin)).body.code, "has_reports");
      await db.query("UPDATE public.employees SET manager_id = 9800 WHERE id = 9804");

      const before = await db.query<{ attendance: string; leave: string; orphans: string }>(
        `SELECT (SELECT count(*) FROM public.attendance WHERE employee_id = 9803) AS attendance,
                (SELECT count(*) FROM public.leave_requests WHERE employee_id = 9803) AS leave,
                (SELECT string_agg(id::text, ',' ORDER BY id) FROM public.attendance a
                 WHERE NOT EXISTS (SELECT 1 FROM public.employees e WHERE e.id = a.employee_id)) AS orphans`,
      );
      const done = await lab.json<{ data: { deactivated: boolean } }>("POST", `/lifecycle/plans/${offboardingPlan}/complete`, admin);
      assert.equal(done.status, 200, done.text);
      assert.equal(done.body.data.deactivated, true);

      const employee = await db.query("SELECT employment_status FROM public.employees WHERE id = 9803");
      assert.equal(employee.rows[0].employment_status, "resigned");
      assert.equal((await db.query("SELECT is_active FROM public.users WHERE id = 9894")).rows[0].is_active, false);
      const after = await db.query(
        `SELECT (SELECT count(*) FROM public.attendance WHERE employee_id = 9803) AS attendance,
                (SELECT count(*) FROM public.leave_requests WHERE employee_id = 9803) AS leave,
                (SELECT string_agg(id::text, ',' ORDER BY id) FROM public.attendance a
                 WHERE NOT EXISTS (SELECT 1 FROM public.employees e WHERE e.id = a.employee_id)) AS orphans`,
      );
      assert.deepEqual(after.rows[0], before.rows[0], "attendance, leave and the protected orphans are untouched");

      const lock = await lab.call("GET", "/lifecycle/my-work", lou);
      assert.ok(lock.status === 401 || lock.status === 403, `a stale token for the leaver answered ${lock.status}`);
      const directory = await lab.json<{ data: { people: Array<{ id: number }> } }>("GET", "/people?pageSize=50", otto);
      assert.equal(directory.body.data.people.some((person) => person.id === 9803), false);

      const audit = await db.query<{ action: string; entity_type: string }>(
        "SELECT action, entity_type FROM public.audit_events WHERE (entity_type = 'employee' AND entity_id = '9803') OR (entity_type = 'lifecycle_plan' AND entity_id = $1) ORDER BY id",
        [String(offboardingPlan)],
      );
      assert.deepEqual(audit.rows.map((row) => row.action), ["LIFECYCLE_PLAN_STARTED", "EMPLOYEE_DEACTIVATED", "LIFECYCLE_PLAN_COMPLETED"]);
      const timeline = await db.query("SELECT visibility, title FROM public.employee_events WHERE employee_id = 9803 AND kind = 'offboarding_completed'");
      assert.deepEqual(timeline.rows, [{ visibility: "management", title: "Left the company (Resigned)" }]);
      assert.equal((await lab.call("POST", `/lifecycle/plans/${offboardingPlan}/complete`, admin)).status, 409, "completing twice is refused");
    });

    await t.test("cancelling leaves employment alone and frees the slot for a new plan", async () => {
      const started = await lab.json<{ data: { id: number } }>("POST", "/lifecycle/plans", admin, {
        employeeId: 9802, kind: "onboarding", templateId: onboardingTemplate, startsOn: today, targetDate: addDays(today, 10),
      });
      assert.equal(started.status, 201);
      assert.equal((await lab.call("POST", `/lifecycle/plans/${started.body.data.id}/cancel`, admin)).status, 200);
      assert.equal((await lab.call("POST", `/lifecycle/plans/${started.body.data.id}/cancel`, admin)).status, 409);
      assert.equal((await db.query("SELECT employment_status FROM public.employees WHERE id = 9802")).rows[0].employment_status, "active");
      const again = await lab.call("POST", "/lifecycle/plans", admin, {
        employeeId: 9802, kind: "onboarding", templateId: onboardingTemplate, startsOn: today, targetDate: addDays(today, 10),
      });
      assert.equal(again.status, 201);
      await assert.rejects(db.query("DELETE FROM public.lifecycle_plans WHERE id = $1", [started.body.data.id]), { code: "23503" }, "a plan with tasks cannot be deleted");
    });

    assert.equal(((await lab.protectedRows()) as { orphans: unknown[] }).orphans.length, 5);
  });
});
