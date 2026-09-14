import assert from "node:assert/strict";
import { test } from "node:test";
import { UNUSABLE_HASH, withLab } from "./labHarness.js";

function addDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

// Explicit opt-in; the only permitted host is the isolated, internal Docker lab.
test("M6 performance: goal visibility and scope, and reviews in order with private content", {
  skip: process.env.HR_NEXUS_V3_LAB !== "1", timeout: 300_000,
}, async (t) => {
  await withLab(t, { label: "v3_performance" }, async (lab) => {
    const { db } = lab;
    await db.query(
      `INSERT INTO public.departments (name) VALUES ('Performance Lab'), ('Elsewhere Lab');
       INSERT INTO public.employees (id, employee_number, full_name, department_id, employment_status, job_title, employment_date)
       SELECT v.id, v.num, v.name, (SELECT id FROM public.departments WHERE name = v.dept), v.status, 'Staff', '2024-01-15'
       FROM (VALUES
         (9400, 'PRF-MONA', 'Mona Manager', 'Performance Lab', 'active'),
         (9401, 'PRF-OWEN', 'Owen Owner', 'Performance Lab', 'active'),
         (9402, 'PRF-PIA', 'Pia Peer', 'Performance Lab', 'probation'),
         (9403, 'PRF-CARL', 'Carl Coworker', 'Elsewhere Lab', 'active'),
         (9404, 'PRF-NOAH', 'Noah Nomanager', 'Performance Lab', 'active'),
         (9405, 'PRF-LEO', 'Leo Left', 'Performance Lab', 'resigned')
       ) AS v(id, num, name, dept, status);
       UPDATE public.employees SET manager_id = 9400 WHERE id IN (9401, 9402, 9405);
       INSERT INTO public.users (id, employee_id, email, password_hash, role, is_active) VALUES
         (9490, NULL, 'performance-admin@example.invalid', '${UNUSABLE_HASH}', 'admin', TRUE),
         (9491, 9400, 'mona@example.invalid', '${UNUSABLE_HASH}', 'employee', TRUE),
         (9492, 9401, 'owen@example.invalid', '${UNUSABLE_HASH}', 'employee', TRUE),
         (9493, 9402, 'pia@example.invalid', '${UNUSABLE_HASH}', 'employee', TRUE),
         (9494, 9403, 'carl@example.invalid', '${UNUSABLE_HASH}', 'employee', TRUE),
         (9495, 9404, 'noah@example.invalid', '${UNUSABLE_HASH}', 'employee', TRUE);`,
    );
    const admin = lab.sign(9490, "admin", null);
    const mona = lab.sign(9491, "employee", 9400);
    const owen = lab.sign(9492, "employee", 9401);
    const pia = lab.sign(9493, "employee", 9402);
    const carl = lab.sign(9494, "employee", 9403);
    const noah = lab.sign(9495, "employee", 9404);
    const today = (await lab.json<{ data: { today: string } }>("GET", "/company/calendar-config", carl)).body.data.today;
    const department = Number((await db.query("SELECT id FROM public.departments WHERE name = 'Performance Lab'")).rows[0].id);
    const kinds = async (userId: number) => (await db.query<{ kind: string; title: string }>("SELECT kind, title FROM public.notifications WHERE user_id = $1 ORDER BY id", [userId])).rows;
    const goal = (title: string, visibility: string, extra: Record<string, unknown> = {}) =>
      ({ title, visibility, startsOn: today, dueOn: addDays(today, 30), description: `${title} details`, ...extra });
    type Goals = { data: { goals: Array<{ id: number; title: string; visibility: string; canChange?: boolean }> } };

    const ids: Record<string, number> = {};

    await t.test("goals: an owner sets their own; a manager only their team's", async () => {
      assert.equal((await lab.call("POST", "/goals", admin, goal("x", "private"))).status, 403, "no employee record");
      for (const [key, visibility] of [["private", "private"], ["team", "team"], ["company", "company"]] as const) {
        const created = await lab.json<{ data: { id: number } }>("POST", "/goals", owen, goal(`Owen ${key} goal`, visibility));
        assert.equal(created.status, 201, created.text);
        ids[key] = created.body.data.id;
      }
      const set = await lab.json<{ data: { id: number } }>("POST", "/goals", mona, goal("Set by Mona", "private", { ownerId: 9401 }));
      assert.equal(set.status, 201);
      ids.setByMona = set.body.data.id;
      assert.deepEqual((await kinds(9492)).map((row) => row.kind), ["goal_assigned"]);
      assert.equal((await lab.json<{ code: string }>("POST", "/goals", mona, goal("Not mine", "private", { ownerId: 9403 }))).body.code, "not_your_team");
      assert.equal((await lab.call("POST", "/goals", carl, goal("Not mine", "private", { ownerId: 9401 }))).status, 403);
      for (const body of [goal("", "private"), goal("Bad", "public"), goal("Bad dates", "private", { dueOn: addDays(today, -1) }), { ...goal("Extra", "private"), progress: 50 }]) {
        assert.equal((await lab.call("POST", "/goals", owen, body)).status, 400, JSON.stringify(body).slice(0, 60));
      }
    });

    await t.test("goals: each relation sees only what visibility allows", async () => {
      const seen = async (token: string) => (await lab.json<Goals>("GET", "/goals/people/9401", token)).body.data.goals.map((row) => row.title).sort();
      assert.deepEqual(await seen(mona), ["Owen company goal", "Owen private goal", "Owen team goal", "Set by Mona"]);
      assert.deepEqual(await seen(admin), ["Owen company goal", "Owen private goal", "Owen team goal", "Set by Mona"]);
      assert.deepEqual(await seen(pia), ["Owen company goal", "Owen team goal"], "a peer sees team and company");
      assert.deepEqual(await seen(carl), ["Owen company goal"], "a coworker sees company only");
      assert.equal((await lab.call("GET", `/goals/${ids.private}`, carl)).status, 404);
      assert.equal((await lab.call("GET", `/goals/${ids.private}`, pia)).status, 404);
      assert.equal((await lab.json<{ data: { goal: { canChange: boolean } } }>("GET", `/goals/${ids.company}`, carl)).body.data.goal.canChange, false);
      assert.equal((await lab.call("GET", "/goals/people/9405", carl)).status, 404, "someone who has left is not found");
      assert.equal((await lab.call("GET", "/goals/team", carl)).status, 403);
      assert.ok((await lab.json<Goals>("GET", "/goals/team", mona)).body.data.goals.some((row) => row.id === ids.private));
    });

    await t.test("goals: progress is recorded with history, completion means 100, and only owner or manager change it", async () => {
      assert.equal((await lab.call("POST", `/goals/${ids.team}/updates`, owen, { progress: 40, note: "Halfway through the draft" })).status, 201);
      assert.equal((await lab.json<{ code: string }>("POST", `/goals/${ids.team}/updates`, pia, { progress: 90 })).body.code, "read_only");
      assert.equal((await lab.call("POST", `/goals/${ids.private}/updates`, carl, { progress: 90 })).status, 404);
      assert.equal((await lab.call("POST", `/goals/${ids.team}/updates`, owen, { progress: 101 })).status, 400);
      assert.equal((await lab.call("POST", `/goals/${ids.team}/updates`, owen, { progress: 50, status: "completed" })).status, 400);

      const done = await lab.json<{ data: { progress: number } }>("POST", `/goals/${ids.company}/updates`, owen, { status: "completed", note: "Shipped" });
      assert.equal(done.status, 201);
      assert.equal(done.body.data.progress, 100);
      assert.ok((await kinds(9491)).some((row) => row.kind === "goal_updated" && row.title.includes("completed a goal")), "the manager hears about completion");
      assert.equal((await lab.call("POST", `/goals/${ids.company}/updates`, owen, { progress: 10 })).status, 409, "a completed goal is closed");
      const timeline = await lab.json("GET", "/people/9401/timeline", carl);
      assert.ok(timeline.text.includes("Completed a goal: Owen company goal"), "a company goal's completion is company news");

      const detail = await lab.json<{ data: { updates: Array<{ progressBefore: number; progressAfter: number; note: string; authorRole: string }> } }>("GET", `/goals/${ids.team}`, mona);
      assert.deepEqual(detail.body.data.updates.map((row) => [row.progressBefore, row.progressAfter, row.authorRole]), [[0, 40, "owner"]]);

      const stale = await lab.json<{ code: string }>("PUT", `/goals/${ids.team}`, owen, { ...goal("Renamed", "team"), revision: 1 });
      assert.equal(stale.body.code, "stale_revision", "the progress update moved the revision on");
      const current = await lab.json<{ data: { goal: { revision: number } } }>("GET", `/goals/${ids.team}`, owen);
      assert.equal((await lab.call("PUT", `/goals/${ids.team}`, mona, { ...goal("Renamed by Mona", "team"), revision: current.body.data.goal.revision })).status, 200);

      await assert.rejects(db.query("UPDATE public.goals SET status = 'completed', completed_at = now(), progress = 50 WHERE id = $1", [ids.team]), { code: "23514" });
      await assert.rejects(db.query("UPDATE public.goal_updates SET note = 'rewritten' WHERE goal_id = $1", [ids.team]), { code: "23514" });
      await assert.rejects(db.query("DELETE FROM public.goal_updates WHERE goal_id = $1", [ids.team]), { code: "23514" });
    });

    await t.test("goals: a manager who is no longer the manager loses the private goals at once", async () => {
      await db.query("UPDATE public.employees SET manager_id = 9404 WHERE id = 9401");
      assert.equal((await lab.call("GET", `/goals/${ids.private}`, mona)).status, 404);
      assert.equal((await lab.call("POST", `/goals/${ids.private}/updates`, mona, { progress: 10 })).status, 404);
      assert.equal((await lab.call("POST", `/goals/${ids.private}/updates`, noah, { progress: 10 })).status, 201, "the new manager holds it");
      await db.query("UPDATE public.employees SET manager_id = 9400 WHERE id = 9401");
    });

    let cycleId = 0;
    const participant: Record<string, number> = {};

    await t.test("review cycles are HR's, validated, and open for the working people in scope", async () => {
      const cycle = { name: "Lab mid-year", periodStart: addDays(today, -180), periodEnd: today, selfDueOn: addDays(today, 7), managerDueOn: addDays(today, 14) };
      assert.equal((await lab.call("POST", "/reviews/cycles", owen, cycle)).status, 403);
      assert.equal((await lab.call("POST", "/reviews/cycles", admin, { ...cycle, managerDueOn: addDays(today, 1) })).status, 400);
      const created = await lab.json<{ data: { id: number } }>("POST", "/reviews/cycles", admin, cycle);
      assert.equal(created.status, 201, created.text);
      cycleId = created.body.data.id;
      assert.equal((await lab.call("POST", "/reviews/cycles", admin, { ...cycle, name: "LAB MID-YEAR" })).status, 409);
      assert.equal((await lab.call("PUT", `/reviews/cycles/${cycleId}`, admin, { ...cycle, name: "Lab mid-year 2026", revision: 1 })).status, 200);

      const opened = await lab.json<{ data: { participants: number } }>("POST", `/reviews/cycles/${cycleId}/open`, admin, { departmentId: department });
      assert.equal(opened.status, 200, opened.text);
      assert.equal(opened.body.data.participants, 4, "Mona, Owen, Pia and Noah; not Leo, who has left, nor Carl elsewhere");
      assert.equal((await lab.call("POST", `/reviews/cycles/${cycleId}/open`, admin, {})).status, 409);
      assert.equal((await lab.call("PUT", `/reviews/cycles/${cycleId}`, admin, { ...cycle, revision: 2 })).status, 409, "an open cycle is not edited");
      assert.ok((await kinds(9492)).some((row) => row.kind === "review_opened"));

      const rows = await db.query<{ id: string; employee_id: number }>("SELECT id, employee_id FROM public.review_participants WHERE cycle_id = $1", [cycleId]);
      for (const row of rows.rows) participant[String(row.employee_id)] = Number(row.id);
    });

    await t.test("reviews: nobody outside the review reads it, and drafts stay with their writer", async () => {
      const owenReview = participant["9401"]!;
      assert.equal((await lab.call("GET", `/reviews/participants/${owenReview}`, pia)).status, 404);
      assert.equal((await lab.call("GET", `/reviews/participants/${owenReview}`, carl)).status, 404);

      const center = await lab.json<{ data: { requiresAction: Array<{ id: string }> } }>("GET", "/action-center", owen);
      assert.ok(center.body.data.requiresAction.some((item) => item.id === `review-self:${owenReview}`));

      assert.equal((await lab.json<{ code: string }>("PUT", `/reviews/participants/${owenReview}/manager`, mona, { summary: "Early", rating: 3 })).body.code, "self_first");
      assert.equal((await lab.call("PUT", `/reviews/participants/${owenReview}/self`, owen, { summary: "Draft words only I see", rating: 4, submit: false })).status, 200);
      const monaView = await lab.json<{ data: { content: { self: unknown } } }>("GET", `/reviews/participants/${owenReview}`, mona);
      assert.equal(monaView.body.data.content.self, null, "the manager does not see a draft self-review");
      assert.equal(monaView.text.includes("Draft words"), false);

      assert.equal((await lab.call("PUT", `/reviews/participants/${owenReview}/self`, owen, { summary: "Final self-review", submit: true })).status, 400, "a rating is required to submit");
      assert.equal((await lab.call("PUT", `/reviews/participants/${owenReview}/self`, owen, { summary: "Final self-review", rating: 6, submit: true })).status, 400);
      assert.equal((await lab.call("PUT", `/reviews/participants/${owenReview}/self`, owen, { summary: "Final self-review", rating: 4, submit: true })).status, 200);
      assert.equal((await lab.json<{ code: string }>("PUT", `/reviews/participants/${owenReview}/self`, owen, { summary: "Changed my mind", rating: 5, submit: true })).body.code, "already_submitted");
      await assert.rejects(db.query("UPDATE public.review_participants SET self_summary = 'rewritten' WHERE id = $1", [owenReview]), { code: "23514" });
      assert.ok((await kinds(9491)).some((row) => row.kind === "review_submitted" && row.title.includes("Owen Owner")));

      const managerCenter = await lab.json<{ data: { requiresAction: Array<{ id: string }> } }>("GET", "/action-center", mona);
      assert.ok(managerCenter.body.data.requiresAction.some((item) => item.id === `review-manager:${owenReview}`));

      assert.equal((await lab.call("PUT", `/reviews/participants/${owenReview}/manager`, mona, { summary: "Manager draft nobody else sees", rating: 3, submit: false })).status, 200);
      const owenView = await lab.json<{ data: { content: { manager: unknown } } }>("GET", `/reviews/participants/${owenReview}`, owen);
      assert.equal(owenView.body.data.content.manager, null, "the employee does not see a draft manager review");
      assert.equal(owenView.text.includes("Manager draft"), false);
      assert.equal((await lab.json<{ code: string }>("PUT", `/reviews/participants/${owenReview}/manager`, admin, { summary: "HR", rating: 3 })).body.code, "has_manager");

      assert.equal((await lab.call("PUT", `/reviews/participants/${owenReview}/manager`, mona, { summary: "A strong half-year.", rating: 3, submit: true })).status, 200);
      const completed = await lab.json<{ data: { status: string; content: { manager: { rating: { value: number; label: string } } } } }>("GET", `/reviews/participants/${owenReview}`, owen);
      assert.equal(completed.body.data.status, "completed");
      assert.deepEqual(completed.body.data.content.manager.rating, { value: 3, label: "Meets expectations" });
      assert.equal((await lab.call("PUT", `/reviews/participants/${owenReview}/response`, owen, { response: "Thank you, agreed." })).status, 200);
      assert.equal((await lab.call("PUT", `/reviews/participants/${owenReview}/response`, owen, { response: "Again" })).status, 409);

      assert.equal((await lab.json("GET", "/people/9401/timeline", pia)).text.includes("review"), false, "a completed review is not colleagues' business");
      assert.ok((await lab.json("GET", "/people/9401/timeline", owen)).text.includes("Completed the Lab mid-year 2026 review"));
    });

    await t.test("reviews: lists carry no content, HR reads are audited, and the audit keeps no words or ratings", async () => {
      const owenReview = participant["9401"]!;
      const team = await lab.json<{ data: { reviews: Array<{ employee: { id: number } }> } }>("GET", "/reviews/team", mona);
      assert.deepEqual(team.body.data.reviews.map((row) => row.employee.id).sort(), [9401, 9402]);
      assert.equal(team.text.includes("A strong half-year"), false);
      const cycle = await lab.json("GET", `/reviews/cycles/${cycleId}`, admin);
      assert.equal(cycle.text.includes("Final self-review"), false);

      const before = Number((await db.query("SELECT count(*) FROM public.audit_events WHERE action = 'REVIEW_VIEWED'")).rows[0].count);
      await lab.call("GET", `/reviews/participants/${owenReview}`, mona);
      assert.equal(Number((await db.query("SELECT count(*) FROM public.audit_events WHERE action = 'REVIEW_VIEWED'")).rows[0].count), before, "the manager's read is not an HR read");
      assert.equal((await lab.call("GET", `/reviews/participants/${owenReview}`, admin)).status, 200);
      assert.equal(Number((await db.query("SELECT count(*) FROM public.audit_events WHERE action = 'REVIEW_VIEWED'")).rows[0].count), before + 1);

      const audit = await db.query<{ changes: string; summary: string }>(
        "SELECT changes::text AS changes, summary FROM public.audit_events WHERE entity_type IN ('review_participant', 'goal')",
      );
      const text = JSON.stringify(audit.rows);
      for (const needle of ["Final self-review", "A strong half-year", "Thank you, agreed", "Owen private goal details", "rating"]) {
        assert.equal(text.includes(needle), false, `audit carried "${needle}"`);
      }
    });

    await t.test("reviews: HR writes only for someone with no manager; a moved report changes hands; closing stops writing", async () => {
      const noahReview = participant["9404"]!;
      const piaReview = participant["9402"]!;
      assert.equal((await lab.call("PUT", `/reviews/participants/${noahReview}/self`, noah, { summary: "My year", rating: 4, submit: true })).status, 200);
      assert.equal((await lab.call("PUT", `/reviews/participants/${noahReview}/manager`, admin, { summary: "Reviewed by HR", rating: 4, submit: true })).status, 200);

      assert.equal((await lab.call("PUT", `/reviews/participants/${piaReview}/self`, pia, { summary: "Pia's year", rating: 3, submit: true })).status, 200);
      await db.query("UPDATE public.employees SET manager_id = 9404 WHERE id = 9402");
      assert.equal((await lab.call("GET", `/reviews/participants/${piaReview}`, mona)).status, 404, "the old manager lost the review at once");
      assert.equal((await lab.call("PUT", `/reviews/participants/${piaReview}/manager`, mona, { summary: "x", rating: 3 })).status, 404);
      assert.equal((await lab.call("GET", `/reviews/participants/${piaReview}`, noah)).status, 200, "the new manager holds it");

      assert.equal((await lab.call("POST", `/reviews/cycles/${cycleId}/close`, owen)).status, 403);
      assert.equal((await lab.call("POST", `/reviews/cycles/${cycleId}/close`, admin)).status, 200);
      assert.equal((await lab.json<{ code: string }>("PUT", `/reviews/participants/${piaReview}/manager`, noah, { summary: "Too late", rating: 3, submit: true })).body.code, "cycle_not_open");
      assert.equal((await lab.call("POST", `/reviews/cycles/${cycleId}/close`, admin)).status, 409);
      await assert.rejects(db.query("DELETE FROM public.review_participants WHERE id = $1", [piaReview]), { code: "23514" });
    });

    assert.equal(((await lab.protectedRows()) as { orphans: unknown[] }).orphans.length, 5);
  });
});
