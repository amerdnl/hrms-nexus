import assert from "node:assert/strict";
import { test } from "node:test";
import { UNUSABLE_HASH, withLab } from "./labHarness.js";

// Explicit opt-in; the only permitted host is the isolated, internal Docker lab.
test("M5 recognition: visibility, limits, moderation and the timeline", {
  skip: process.env.HR_NEXUS_V3_LAB !== "1", timeout: 240_000,
}, async (t) => {
  await withLab(t, { label: "v3_recognition" }, async (lab) => {
    const { db } = lab;
    await db.query(
      `INSERT INTO public.departments (name) VALUES ('Recognition Lab');
       INSERT INTO public.employees (id, employee_number, full_name, department_id, employment_status, job_title, employment_date)
       SELECT v.id, v.num, v.name, (SELECT id FROM public.departments WHERE name = 'Recognition Lab'), v.status, 'Staff', '2024-01-15'
       FROM (VALUES
         (9500, 'RCG-RAE', 'Rae Receiver', 'active'),
         (9501, 'RCG-GIL', 'Gil Giver', 'active'),
         (9502, 'RCG-CAM', 'Cam Coworker', 'active'),
         (9503, 'RCG-MIA', 'Mia Manager', 'active'),
         (9504, 'RCG-LEO', 'Leo Left', 'resigned'),
         (9505, 'RCG-EVE', 'Eve Extra', 'active'),
         (9506, 'RCG-IAN', 'Ian Extra', 'active'),
         (9507, 'RCG-UMA', 'Uma Extra', 'probation')
       ) AS v(id, num, name, status);
       UPDATE public.employees SET manager_id = 9503 WHERE id = 9500;
       INSERT INTO public.users (id, employee_id, email, password_hash, role, is_active) VALUES
         (9590, NULL, 'recognition-admin@example.invalid', '${UNUSABLE_HASH}', 'admin', TRUE),
         (9591, 9500, 'rae@example.invalid', '${UNUSABLE_HASH}', 'employee', TRUE),
         (9592, 9501, 'gil@example.invalid', '${UNUSABLE_HASH}', 'employee', TRUE),
         (9593, 9502, 'cam@example.invalid', '${UNUSABLE_HASH}', 'employee', TRUE),
         (9594, 9503, 'mia@example.invalid', '${UNUSABLE_HASH}', 'employee', TRUE),
         (9596, 9506, 'ian@example.invalid', '${UNUSABLE_HASH}', 'employee', TRUE);`,
    );
    const admin = lab.sign(9590, "admin", null);
    const rae = lab.sign(9591, "employee", 9500);
    const gil = lab.sign(9592, "employee", 9501);
    const cam = lab.sign(9593, "employee", 9502);
    const mia = lab.sign(9594, "employee", 9503);
    const ian = lab.sign(9596, "employee", 9506);

    type Item = { id: number; message: string; visibility: string; hidden?: boolean; receiver: { id: number } };
    const give = (token: string, body: Record<string, unknown>) => lab.json<{ code?: string; data: { id: number; givenToday: number } }>("POST", "/recognition", token, body);
    const profile = async (token: string, id: number) =>
      (await lab.json<{ data: { items: Item[]; byCategory: Array<{ category: string; count: number }> } }>("GET", `/people/${id}/recognition`, token)).body.data;
    const feed = async (token: string, view: string) =>
      (await lab.json<{ data: { items: Item[]; givenToday: number | null } }>("GET", `/recognition?view=${view}`, token)).body.data;

    await t.test("anonymous callers and accounts without an employee record cannot give", async () => {
      assert.equal((await lab.call("GET", "/recognition")).status, 401);
      assert.equal((await lab.call("POST", "/recognition", null, {})).status, 401);
      assert.equal((await give(admin, { receiverId: 9500, category: "teamwork", message: "Thanks a lot" })).status, 403);
      assert.equal((await lab.call("GET", "/recognition?view=all", cam)).status, 403);
      assert.equal((await lab.call("GET", "/recognition?view=everything", cam)).status, 400);
    });

    let companyId = 0;
    let privateId = 0;

    await t.test("giving validates strictly and refuses yourself, leavers and strangers", async () => {
      const bad: Array<Record<string, unknown>> = [
        { receiverId: 9501, category: "teamwork", message: "Me, myself" },
        { receiverId: 9500, category: "teamwork", message: "hey" },
        { receiverId: 9500, category: "vibes", message: "Thanks a lot" },
        { receiverId: 9500, category: "teamwork", message: "x".repeat(501) },
        { receiverId: 9500, category: "teamwork", message: "Thanks a lot", visibility: "public" },
        { receiverId: 9500, category: "teamwork", message: "Thanks a lot", points: 100 },
      ];
      for (const body of bad) assert.equal((await give(gil, body)).status, 400, JSON.stringify(body).slice(0, 80));
      assert.equal((await give(gil, { receiverId: 9504, category: "teamwork", message: "Thanks a lot" })).status, 404, "not someone who has left");
      assert.equal((await give(gil, { receiverId: 999999, category: "teamwork", message: "Thanks a lot" })).status, 404);
    });

    await t.test("company recognition reaches the receiver, the profile, the feed and the timeline; once a day", async () => {
      const given = await give(gil, { receiverId: 9500, category: "above_and_beyond", message: "Stayed late to fix the release. Thank you!" });
      assert.equal(given.status, 201, given.text);
      companyId = given.body.data.id;
      assert.equal(given.body.data.givenToday, 1);
      assert.equal((await give(gil, { receiverId: 9500, category: "teamwork", message: "And again today" })).body.code, "already_today");

      const notes = await db.query<{ kind: string; title: string; link: string }>("SELECT kind, title, link FROM public.notifications WHERE user_id = 9591");
      assert.deepEqual(notes.rows, [{ kind: "recognition_received", title: "Gil Giver recognised you for Above and beyond", link: "/recognition?view=received" }]);

      assert.ok((await profile(cam, 9500)).items.some((item) => item.id === companyId), "a colleague sees company recognition on the profile");
      assert.ok((await feed(cam, "company")).items.some((item) => item.id === companyId));
      assert.ok((await feed(rae, "received")).items.some((item) => item.id === companyId));
      assert.equal((await feed(gil, "given")).givenToday, 1);
      const timeline = await lab.json("GET", "/people/9500/timeline", cam);
      assert.ok(timeline.text.includes("Recognised for Above and beyond by Gil Giver"));
    });

    await t.test("private recognition is for the two of them and HR only", async () => {
      const given = await give(cam, { receiverId: 9500, category: "mentoring", message: "Your coaching helped me a lot.", visibility: "private" });
      assert.equal(given.status, 201);
      privateId = given.body.data.id;

      assert.equal((await profile(gil, 9500)).items.some((item) => item.id === privateId), false, "another colleague does not see it");
      assert.equal((await profile(mia, 9500)).items.some((item) => item.id === privateId), false, "nor does the receiver's manager");
      assert.equal((await feed(gil, "company")).items.some((item) => item.id === privateId), false);
      assert.ok((await profile(rae, 9500)).items.some((item) => item.id === privateId));
      assert.ok((await profile(cam, 9500)).items.some((item) => item.id === privateId), "the giver sees what they gave");
      assert.ok((await feed(admin, "all")).items.some((item) => item.id === privateId));

      const coworkerTimeline = await lab.json("GET", "/people/9500/timeline", gil);
      assert.equal(coworkerTimeline.text.includes("Mentoring"), false, "the private event is not on the social timeline");
      const selfTimeline = await lab.json("GET", "/people/9500/timeline", rae);
      assert.ok(selfTimeline.text.includes("Recognised for Mentoring"));
      assert.equal(JSON.stringify((await profile(gil, 9500)).byCategory).includes("mentoring"), false, "counts do not leak it either");
    });

    await t.test("five a day per giver, whoever the colleague", async () => {
      for (const id of [9502, 9503, 9505, 9506]) {
        assert.equal((await give(gil, { receiverId: id, category: "teamwork", message: "Great work this week" })).status, 201, String(id));
      }
      const sixth = await give(gil, { receiverId: 9507, category: "teamwork", message: "Great work this week" });
      assert.equal(sixth.status, 429);
      assert.equal(sixth.body.code, "daily_limit");
      assert.equal((await feed(gil, "given")).givenToday, 5);
    });

    await t.test("HR hides and restores; hidden recognition leaves the profile, feed and timeline, and the audit keeps no words", async () => {
      assert.equal((await lab.call("PUT", `/recognition/${companyId}/hidden`, cam, { hidden: true })).status, 403);
      assert.equal((await lab.call("PUT", `/recognition/${companyId}/hidden`, admin, { hidden: "yes" })).status, 400);
      assert.equal((await lab.call("PUT", `/recognition/${companyId}/hidden`, admin, { hidden: true })).status, 200);

      assert.equal((await profile(cam, 9500)).items.some((item) => item.id === companyId), false);
      assert.equal((await profile(rae, 9500)).items.some((item) => item.id === companyId), false, "hidden means hidden for the receiver too");
      assert.equal((await feed(cam, "company")).items.some((item) => item.id === companyId), false);
      assert.equal((await lab.json("GET", "/people/9500/timeline", cam)).text.includes("Above and beyond"), false);
      assert.equal((await feed(admin, "all")).items.find((item) => item.id === companyId)?.hidden, true);
      assert.equal((await feed(cam, "company")).items.every((item) => item.hidden === undefined), true, "colleagues never see moderation state");

      assert.equal((await lab.call("PUT", `/recognition/${companyId}/hidden`, admin, { hidden: false })).status, 200);
      assert.ok((await profile(cam, 9500)).items.some((item) => item.id === companyId));
      const audit = await db.query<{ action: string; changes: string }>(
        "SELECT action, changes::text AS changes FROM public.audit_events WHERE entity_type = 'recognition' ORDER BY id",
      );
      assert.deepEqual(audit.rows.map((row) => row.action), ["RECOGNITION_HIDDEN", "RECOGNITION_RESTORED"]);
      assert.equal(JSON.stringify(audit.rows).includes("Stayed late"), false);
    });

    await t.test("the database keeps the words as given", async () => {
      await assert.rejects(db.query("UPDATE public.recognitions SET message = 'Edited words' WHERE id = $1", [companyId]), { code: "23514" });
      await assert.rejects(db.query("UPDATE public.recognitions SET visibility = 'private' WHERE id = $1", [companyId]), { code: "23514" });
      await assert.rejects(db.query("DELETE FROM public.recognitions WHERE id = $1", [companyId]), { code: "23514" });
      await assert.rejects(db.query(
        "INSERT INTO public.recognitions (giver_employee_id, receiver_employee_id, category, message, given_on) VALUES (9502, 9502, 'teamwork', 'Self love', '2026-09-01')",
      ), { code: "23514" });
    });

    await t.test("when someone leaves, their company recognition leaves colleagues' feeds, and their token reaches nothing", async () => {
      const ianItem = (await feed(cam, "company")).items.find((item) => item.receiver.id === 9506);
      assert.ok(ianItem);
      await db.query("UPDATE public.employees SET employment_status = 'resigned' WHERE id = 9506");
      await db.query("UPDATE public.users SET is_active = FALSE WHERE id = 9596");
      assert.equal((await feed(cam, "company")).items.some((item) => item.receiver.id === 9506), false);
      assert.ok((await feed(admin, "all")).items.some((item) => item.id === ianItem.id), "HR still has the history");
      assert.equal((await lab.call("GET", "/people/9506/recognition", cam)).status, 404);
      const stale = (await lab.call("GET", "/recognition", ian)).status;
      assert.ok(stale === 401 || stale === 403, String(stale));
    });

    assert.equal(((await lab.protectedRows()) as { orphans: unknown[] }).orphans.length, 5);
  });
});
