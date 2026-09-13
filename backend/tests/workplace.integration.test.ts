import assert from "node:assert/strict";
import { test } from "node:test";
import { UNUSABLE_HASH, withLab } from "./labHarness.js";

type Json<T> = { status: number; body: T; text: string };

/** Adds days to a YYYY-MM-DD date in UTC. */
function addDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

const REASONS = ["Private surgery details", "Family matter nobody else needs", "Secret interview"];

// Explicit opt-in; the only permitted host is the isolated, internal Docker lab.
test("M3 workplace: notifications, announcements, calendar, search and the Action Center", {
  skip: process.env.HR_NEXUS_V3_LAB !== "1", timeout: 300_000,
}, async (t) => {
  await withLab(t, { label: "v3_workplace" }, async (lab) => {
    const { db } = lab;
    // Imported only now: withLab has pointed the application pool at this clone.
    const { notify, accountsOfEmployees } = await import("../src/services/notificationService.js");
    const { payslipsPublished } = await import("../src/services/workflowNotifications.js");

    await db.query(
      `INSERT INTO public.departments (name) VALUES ('Workplace Lab A'), ('Workplace Lab B'), ('Workplace Lab Empty');
       INSERT INTO public.employees (id, employee_number, full_name, department_id, employment_status, job_title, employment_date)
       SELECT v.id, v.num, v.name, (SELECT id FROM public.departments WHERE name = v.dept), 'active', v.title, '2024-01-15'
       FROM (VALUES
         (9700, 'WPL-MIRA', 'Mira Manager', 'Workplace Lab A', 'Team Lead'),
         (9701, 'WPL-ELI', 'Eli Employee', 'Workplace Lab A', 'Engineer'),
         (9702, 'WPL-BEN', 'Ben Other', 'Workplace Lab B', 'Analyst'),
         (9703, 'WPL-GONE', 'Gone Person', 'Workplace Lab A', 'Engineer')
       ) AS v(id, num, name, dept, title);
       UPDATE public.employees SET manager_id = 9700 WHERE id IN (9701, 9703);
       UPDATE public.company_settings SET working_days = ARRAY[1,2,3,4,5,6,7]::smallint[] WHERE id = 1;
       INSERT INTO public.users (id, employee_id, email, password_hash, role, is_active) VALUES
         (9790, NULL, 'workplace-admin@example.invalid', '${UNUSABLE_HASH}', 'admin', TRUE),
         (9791, 9700, 'mira@example.invalid', '${UNUSABLE_HASH}', 'employee', TRUE),
         (9792, 9701, 'eli@example.invalid', '${UNUSABLE_HASH}', 'employee', TRUE),
         (9793, 9702, 'ben@example.invalid', '${UNUSABLE_HASH}', 'employee', TRUE),
         (9794, 9703, 'gone@example.invalid', '${UNUSABLE_HASH}', 'employee', TRUE);`,
    );
    const departments = await db.query<{ id: string; name: string }>(
      "SELECT id, name FROM public.departments WHERE name LIKE 'Workplace Lab %'",
    );
    const departmentId = (name: string) => Number(departments.rows.find((row) => row.name === name)!.id);

    const admin = lab.sign(9790, "admin", null);
    const mira = lab.sign(9791, "employee", 9700);
    const eli = lab.sign(9792, "employee", 9701);
    const ben = lab.sign(9793, "employee", 9702);
    const gone = lab.sign(9794, "employee", 9703);

    const config = await lab.json<{ data: { today: string; timezone: string } }>("GET", "/company/calendar-config", eli);
    assert.equal(config.status, 200);
    const today = config.body.data.today;
    /** A three-day range starting `offset` days out, kept inside one calendar year. */
    const range = (offset: number) => {
      let start = addDays(today, offset);
      if (start.slice(0, 4) !== addDays(start, 2).slice(0, 4)) start = `${Number(start.slice(0, 4)) + 1}-01-05`;
      return { startDate: start, endDate: addDays(start, 2) };
    };

    const submit = async (token: string, offset: number, reason: string) => {
      const response = await lab.json<{ data: { leave: { id: number } } }>(
        "POST", "/leaves", token, { leaveType: "unpaid", ...range(offset), reason },
      );
      assert.equal(response.status, 201, response.text);
      return response.body.data.leave.id;
    };
    const notificationsOf = async (userId: number) => (await db.query<{
      id: string; kind: string; title: string; body: string | null; link: string | null; read_at: Date | null;
    }>("SELECT id, kind, title, body, link, read_at FROM public.notifications WHERE user_id = $1 ORDER BY id", [userId])).rows;

    await t.test("anonymous callers get nothing from the workplace layer", async () => {
      const today2 = addDays(today, 1);
      for (const path of [
        "/notifications", "/notifications/unread-count", "/action-center", "/search?q=ab",
        `/calendar?from=${today}&to=${today2}`, "/company/calendar-config", "/announcements",
      ]) {
        assert.equal((await lab.call("GET", path)).status, 401, path);
      }
    });

    let leaveOne = 0; // Eli, approved soon
    let leaveTwo = 0; // Eli, pending
    let leaveThree = 0; // Ben (no manager), pending
    let leaveGone = 0; // Gone, approved, then resigns

    await t.test("leave notifications reach the decider, carry no reason, and never the actor", async () => {
      leaveOne = await submit(eli, 2, REASONS[0]!);
      leaveTwo = await submit(eli, 20, REASONS[1]!);
      leaveThree = await submit(ben, 6, REASONS[2]!);
      leaveGone = await submit(gone, 3, "Gone's own reason");

      const miraInbox = await notificationsOf(9791);
      const submitted = miraInbox.filter((row) => row.kind === "leave_submitted");
      assert.equal(submitted.length, 3, "Mira's two reports each told her");
      assert.ok(submitted.every((row) => row.link === "/team/leave?status=pending"));
      assert.match(submitted[0]!.title, /Eli Employee requested leave/);

      const adminInbox = await notificationsOf(9790);
      assert.deepEqual(adminInbox.map((row) => row.kind), ["leave_submitted"], "HR hears only about the request with no manager");
      assert.match(adminInbox[0]!.title, /Ben Other/);
      assert.equal(adminInbox[0]!.link, "/admin/leave?status=pending");

      assert.equal((await notificationsOf(9792)).length, 0, "nobody is told about their own submission");
      const everything = JSON.stringify((await db.query("SELECT title, body FROM public.notifications")).rows);
      for (const reason of [...REASONS, "Gone's own reason"]) assert.equal(everything.includes(reason), false, `leaked "${reason}"`);

      assert.equal((await lab.call("PUT", `/leaves/${leaveOne}/status`, mira, { status: "approved", adminComment: "Enjoy the private rest" })).status, 200);
      assert.equal((await lab.call("PUT", `/leaves/${leaveGone}/status`, mira, { status: "approved" })).status, 200);
      const eliInbox = await notificationsOf(9792);
      assert.deepEqual(eliInbox.map((row) => row.kind), ["leave_approved"]);
      assert.equal(eliInbox[0]!.link, "/employee/leave");
      assert.equal(JSON.stringify(eliInbox).includes("Enjoy the private rest"), false, "the decision comment stays on the leave page");
    });

    await t.test("cancellation tells the employee only when HR did it", async () => {
      const byHr = await submit(eli, 40, "Cancelled by HR later");
      const bySelf = await submit(eli, 50, "Cancelled by me later");
      assert.equal((await lab.call("POST", `/leaves/${byHr}/cancel`, admin)).status, 200);
      assert.equal((await lab.call("POST", `/leaves/${bySelf}/cancel`, eli)).status, 200);
      const cancelled = (await notificationsOf(9792)).filter((row) => row.kind === "leave_cancelled");
      assert.equal(cancelled.length, 1);
      assert.match(cancelled[0]!.title, /cancelled by HR/);
    });

    await t.test("the writer dedupes, drops unsafe links, skips the actor and ineligible accounts", async () => {
      const first = await notify([9792, 9792, 9791], {
        kind: "manager_changed", title: "Lab dedupe", link: "https://evil.example/phish",
        dedupeKey: "lab:dedupe", actorUserId: 9791,
      }, db);
      assert.equal(first, 1, "one copy for Eli; Mira caused it");
      assert.equal(await notify([9792], { kind: "manager_changed", title: "Lab dedupe", dedupeKey: "lab:dedupe" }, db), 0);
      const stored = (await notificationsOf(9792)).find((row) => row.title === "Lab dedupe");
      assert.equal(stored?.link, null, "an off-site link is never stored");

      for (const link of ["//evil.example", "javascript:alert(1)", "https://evil.example", "/ok path"]) {
        await assert.rejects(
          db.query("INSERT INTO public.notifications (user_id, kind, title, link) VALUES (9792, 'manager_changed', 'x', $1)", [link]),
          (error: { code?: string }) => error.code === "23514",
          link,
        );
      }

      await db.query("UPDATE public.employees SET employment_status = 'resigned' WHERE id = 9703");
      assert.deepEqual(await accountsOfEmployees([9701, 9703], db), [9792], "a resigned employee's account is not a recipient");
    });

    await t.test("payslip notifications name the month and nothing else, for eligible holders", async () => {
      const periodRows = { rows: [{ employee_id: 9701 }, { employee_id: 9703 }], rowCount: 2 };
      const stub = {
        query: (sql: string, params?: unknown[]) =>
          sql.includes("FROM public.payroll_records") ? Promise.resolve(periodRows) : db.query(sql, params),
      };
      await payslipsPublished(stub as never, { id: 424242, period_year: 2026, period_month: 9 }, 9790);
      await payslipsPublished(stub as never, { id: 424242, period_year: 2026, period_month: 9 }, 9790);
      const slips = (await notificationsOf(9792)).filter((row) => row.kind === "payslip_published");
      assert.equal(slips.length, 1, "approval delivered twice is one notification");
      assert.equal(slips[0]!.title, "Your payslip for September 2026 is ready");
      assert.equal(slips[0]!.body, null);
      assert.equal((await notificationsOf(9794)).filter((row) => row.kind === "payslip_published").length, 0);
    });

    await t.test("the notifications API is strictly per account", async () => {
      const list = await lab.json<{ data: { items: Array<{ id: number; kind: string }>; unreadCount: number; nextBefore: number | null } }>(
        "GET", "/notifications?limit=2", eli,
      );
      assert.equal(list.status, 200);
      assert.equal(list.body.data.items.length, 2);
      assert.ok(list.body.data.nextBefore !== null, "a second page is offered");
      assert.ok(list.body.data.unreadCount >= 3);

      const miraId = Number((await notificationsOf(9791))[0]!.id);
      assert.equal((await lab.call("PUT", `/notifications/${miraId}/read`, eli)).status, 404, "someone else's notification is not found");
      assert.equal((await notificationsOf(9791))[0]!.read_at, null, "and stays unread");

      for (const bad of ["/notifications?filter=everything", "/notifications?limit=0", "/notifications?limit=51", "/notifications?before=abc"]) {
        assert.equal((await lab.call("GET", bad, eli)).status, 400, bad);
      }
      const own = list.body.data.items[0]!.id;
      const read = await lab.json<{ data: { unreadCount: number } }>("PUT", `/notifications/${own}/read`, eli);
      assert.equal(read.status, 200);
      assert.equal(read.body.data.unreadCount, list.body.data.unreadCount - 1);
      assert.equal((await lab.json<{ data: { unreadCount: number } }>("PUT", "/notifications/read-all", eli)).body.data.unreadCount, 0);
      assert.equal((await lab.json<{ data: { items: unknown[] } }>("GET", "/notifications?filter=unread", eli)).body.data.items.length, 0);
    });

    await t.test("a stale token for a resigned employee reaches nothing", async () => {
      for (const path of ["/notifications", "/action-center", `/calendar?from=${today}&to=${today}`, "/announcements"]) {
        const status = (await lab.call("GET", path, gone)).status;
        assert.ok(status === 401 || status === 403, `${path} answered ${status}`);
      }
    });

    let announcementId = 0;

    await t.test("announcements: HR drafts, publishes to a department, and the audience alone reads it", async () => {
      assert.equal((await lab.call("POST", "/announcements", eli, { title: "x", body: "y" })).status, 403);
      assert.equal((await lab.call("GET", "/announcements/manage", eli)).status, 403);

      const invalid = [
        { title: "No department", body: "b", audience: "department" },
        { title: "Extra", body: "b", pinned: true },
        { title: "Past", body: "b", expiresOn: addDays(today, -1) },
        { title: "", body: "b" },
      ];
      for (const body of invalid) assert.equal((await lab.call("POST", "/announcements", admin, body)).status, 400, JSON.stringify(body));

      const created = await lab.json<{ data: { announcement: { id: number; status: string; revision: number } } }>(
        "POST", "/announcements", admin,
        { title: "Lab A notice", body: "Line one\nLine two is private to A", priority: "important", audience: "department", departmentId: departmentId("Workplace Lab A") },
      );
      assert.equal(created.status, 201, created.text);
      announcementId = created.body.data.announcement.id;
      assert.equal(created.body.data.announcement.status, "draft");

      assert.equal((await lab.call("GET", `/announcements/${announcementId}`, eli)).status, 404, "a draft is not found by its audience");
      assert.equal((await lab.call("POST", `/announcements/${announcementId}/publish`, admin, { revision: 99 })).status, 409);
      assert.equal((await lab.call("POST", `/announcements/${announcementId}/publish`, eli, { revision: 1 })).status, 403);
      const published = await lab.json<{ data: { announcement: { status: string; revision: number } } }>(
        "POST", `/announcements/${announcementId}/publish`, admin, { revision: 1 },
      );
      assert.equal(published.status, 200, published.text);
      assert.equal((await lab.call("POST", `/announcements/${announcementId}/publish`, admin, { revision: 2 })).status, 409);

      const told = (userId: number) => notificationsOf(userId).then((rows) => rows.filter((row) => row.kind === "announcement_published"));
      assert.equal((await told(9792)).length, 1, "Eli in department A is told");
      assert.equal((await told(9791)).length, 1, "Mira in department A is told");
      assert.equal((await told(9793)).length, 0, "Ben in department B is not");
      assert.equal((await told(9790)).length, 0, "the publisher is not told about their own announcement");
      assert.equal((await told(9794)).length, 0, "a resigned employee's account is not told");
      assert.equal((await told(9792))[0]!.link, `/announcements/${announcementId}`);
      assert.match((await told(9792))[0]!.title, /^Important: Lab A notice/);

      assert.equal((await lab.call("GET", `/announcements/${announcementId}`, ben)).status, 404, "another department's notice is not found");
      const benFeed = await lab.json<{ data: { items: Array<{ id: number }> } }>("GET", "/announcements", ben);
      assert.equal(benFeed.body.data.items.some((item) => item.id === announcementId), false);

      const eliFeed = await lab.json<{ data: { items: Array<{ id: number; isRead: boolean; body: string }>; unreadCount: number } }>("GET", "/announcements", eli);
      const mine = eliFeed.body.data.items.find((item) => item.id === announcementId);
      assert.equal(mine?.isRead, false);
      assert.equal(mine?.body, "Line one\nLine two is private to A", "line breaks survive as plain text");
      assert.ok(eliFeed.body.data.unreadCount >= 1);
    });

    await t.test("an important unread announcement is an action until it is opened", async () => {
      const before = await lab.json<{ data: { requiresAction: Array<{ id: string }> } }>("GET", "/action-center", eli);
      assert.ok(before.body.data.requiresAction.some((item) => item.id === `announcement:${announcementId}`));
      assert.equal((await lab.call("PUT", `/announcements/${announcementId}/read`, ben)).status, 404);
      assert.equal((await lab.call("PUT", `/announcements/${announcementId}/read`, eli)).status, 200);
      assert.equal((await lab.call("PUT", `/announcements/${announcementId}/read`, eli)).status, 200, "reading twice is harmless");
      const after = await lab.json<{ data: { requiresAction: Array<{ id: string }> } }>("GET", "/action-center", eli);
      assert.equal(after.body.data.requiresAction.some((item) => item.id === `announcement:${announcementId}`), false);
      const notification = (await notificationsOf(9792)).find((row) => row.kind === "announcement_published");
      assert.ok(notification?.read_at, "opening the announcement clears its notification");
    });

    await t.test("published announcements keep their audience; stale edits and deleting history are refused", async () => {
      const current = await lab.json<{ data: { announcement: { revision: number } } }>("GET", `/announcements/${announcementId}`, admin);
      const revision = current.body.data.announcement.revision;
      const retarget = await lab.json<{ code: string }>("PUT", `/announcements/${announcementId}`, admin, {
        title: "Lab A notice", body: "Line one", priority: "normal", audience: "company", revision,
      });
      assert.equal(retarget.status, 409);
      assert.equal(retarget.body.code, "audience_fixed");
      assert.equal((await lab.call("PUT", `/announcements/${announcementId}`, admin, {
        title: "Stale", body: "b", audience: "department", departmentId: departmentId("Workplace Lab A"), revision: revision - 1,
      })).status, 409);
      const corrected = await lab.json<{ data: { announcement: { title: string; revision: number } } }>("PUT", `/announcements/${announcementId}`, admin, {
        title: "Lab A notice (corrected)", body: "Line one\nLine two is private to A", priority: "important",
        audience: "department", departmentId: departmentId("Workplace Lab A"), revision,
      });
      assert.equal(corrected.status, 200, corrected.text);
      assert.equal(corrected.body.data.announcement.revision, revision + 1);

      assert.equal((await lab.call("DELETE", `/announcements/${announcementId}`, admin)).status, 409, "published is archived, not deleted");
      assert.equal((await lab.call("POST", `/announcements/${announcementId}/archive`, eli)).status, 403);
      assert.equal((await lab.call("POST", `/announcements/${announcementId}/archive`, admin)).status, 200);
      assert.equal((await lab.call("GET", `/announcements/${announcementId}`, eli)).status, 404, "archived is off the feed");
      const archived = await lab.json<{ data: { announcement: { status: string } } }>("GET", `/announcements/${announcementId}`, admin);
      assert.equal(archived.body.data.announcement.status, "archived");
      assert.equal((await lab.call("PUT", `/announcements/${announcementId}`, admin, {
        title: "x", body: "y", audience: "department", departmentId: departmentId("Workplace Lab A"), revision: revision + 2,
      })).status, 409, "archived is read-only");

      const manage = await lab.json<{ data: { counts: Record<string, number>; items: Array<{ id: number; readCount: number; audienceSize: number }> } }>(
        "GET", "/announcements/manage?status=all", admin,
      );
      assert.equal(manage.status, 200);
      const row = manage.body.data.items.find((item) => item.id === announcementId);
      assert.equal(row?.readCount, 1);
      assert.equal(row?.audienceSize, 2, "Mira and Eli are department A's eligible accounts");
    });

    await t.test("a department an announcement addressed stays; a draft is deleted; the audit keeps no body text", async () => {
      const empty = departmentId("Workplace Lab Empty");
      const draft = await lab.json<{ data: { announcement: { id: number } } }>("POST", "/announcements", admin, {
        title: "Empty dept draft", body: "Body text that must not reach audit", audience: "department", departmentId: empty,
      });
      assert.equal(draft.status, 201);
      const refused = await lab.json<{ message: string }>("DELETE", `/departments/${empty}`, admin);
      assert.equal(refused.status, 409);
      assert.match(refused.body.message, /announcements/);
      assert.equal((await lab.call("DELETE", `/announcements/${draft.body.data.announcement.id}`, admin)).status, 200);
      assert.equal((await lab.call("DELETE", `/departments/${empty}`, admin)).status, 200);

      const audit = await db.query<{ action: string; changes: string }>(
        "SELECT action, changes::text AS changes FROM public.audit_events WHERE entity_type = 'announcement' ORDER BY id",
      );
      const actions = audit.rows.map((row) => row.action);
      for (const action of ["ANNOUNCEMENT_CREATED", "ANNOUNCEMENT_PUBLISHED", "ANNOUNCEMENT_UPDATED", "ANNOUNCEMENT_ARCHIVED", "ANNOUNCEMENT_DELETED"]) {
        assert.ok(actions.includes(action), action);
      }
      const text = JSON.stringify(audit.rows);
      assert.equal(text.includes("Line two is private"), false);
      assert.equal(text.includes("must not reach audit"), false);
    });

    await t.test("the calendar shows who is out without reasons, and types only to self, manager and HR", async () => {
      const to = addDays(today, 30);
      const url = `/calendar?from=${today}&to=${to}`;
      type Calendar = { data: { absences: Array<{ employeeId: number; status: string; leaveType: string | null; relation: string; startDate: string }>; config: Record<string, unknown> } };

      const benView = await lab.json<Calendar>("GET", url, ben);
      assert.equal(benView.status, 200, benView.text);
      const eliApproved = benView.body.data.absences.find((row) => row.employeeId === 9701 && row.status === "approved");
      assert.ok(eliApproved, "a colleague's approved leave is on the calendar");
      assert.equal(eliApproved.leaveType, null, "but not its type");
      assert.equal(benView.body.data.absences.some((row) => row.employeeId === 9701 && row.status === "pending"), false, "nor their pending requests");
      assert.equal(benView.body.data.absences.find((row) => row.employeeId === 9702)?.leaveType, "unpaid", "your own shows its type");
      assert.equal(benView.body.data.absences.some((row) => row.employeeId === 9703), false, "someone who has left is not on it");
      for (const text of [benView.text]) {
        for (const reason of [...REASONS, "reason", "latitude", "radius", "office"]) assert.equal(text.includes(reason), false, `leaked ${reason}`);
      }
      assert.deepEqual(Object.keys(benView.body.data.config).sort(), ["configured", "timezone", "today", "workingDays"]);

      const miraTeam = await lab.json<Calendar>("GET", `${url}&team=1`, mira);
      assert.equal(miraTeam.status, 200);
      assert.deepEqual([...new Set(miraTeam.body.data.absences.map((row) => row.employeeId))], [9701]);
      assert.ok(miraTeam.body.data.absences.every((row) => row.leaveType === "unpaid" && row.relation === "team"));
      assert.ok(miraTeam.body.data.absences.some((row) => row.status === "pending"), "the manager sees what awaits a decision");

      const adminView = await lab.json<Calendar>("GET", url, admin);
      assert.ok(adminView.body.data.absences.some((row) => row.employeeId === 9702 && row.status === "pending" && row.leaveType === "unpaid"));

      assert.equal((await lab.call("GET", `${url}&team=1`, ben)).status, 403, "no team, no team view");
      assert.equal((await lab.call("GET", `/calendar?from=${to}&to=${today}`, ben)).status, 400);
      assert.equal((await lab.call("GET", `/calendar?from=${today}&to=${addDays(today, 93)}`, ben)).status, 400);
      assert.equal((await lab.call("GET", `/calendar?from=2026-02-31&to=2026-03-01`, ben)).status, 400);
      assert.equal((await lab.call("GET", `${url}&department=abc`, ben)).status, 400);

      const configText = (await lab.json("GET", "/company/calendar-config", ben)).text;
      for (const needle of ["latitude", "longitude", "radius", "registration", "phone", "address"]) {
        assert.equal(configText.includes(needle), false, `calendar config exposed ${needle}`);
      }
    });

    await t.test("company holidays are HR settings with revisions, and reach everyone's calendar", async () => {
      assert.equal((await lab.call("GET", "/settings/holidays", eli)).status, 403);
      assert.equal((await lab.call("POST", "/settings/holidays", eli, { date: addDays(today, 5), name: "Nope" })).status, 403);
      assert.equal((await lab.call("POST", "/settings/holidays", admin, { date: "2026-02-31", name: "Bad" })).status, 400);

      const created = await lab.json<{ data: { holiday: { id: number; revision: number } } }>(
        "POST", "/settings/holidays", admin, { date: addDays(today, 5), name: "Lab Day" },
      );
      assert.equal(created.status, 201, created.text);
      const { id } = created.body.data.holiday;
      assert.equal((await lab.call("POST", "/settings/holidays", admin, { date: addDays(today, 5), name: "Twice" })).status, 409);
      assert.equal((await lab.call("PUT", `/settings/holidays/${id}`, admin, { date: addDays(today, 5), name: "Stale", revision: 7 })).status, 409);
      const renamed = await lab.json<{ data: { holiday: { revision: number } } }>(
        "PUT", `/settings/holidays/${id}`, admin, { date: addDays(today, 5), name: "Lab Day Renamed", revision: 1 },
      );
      assert.equal(renamed.body.data.holiday.revision, 2);

      const everyone = await lab.json<{ data: { holidays: Array<{ date: string; name: string }> } }>("GET", "/company/calendar-config", eli);
      assert.ok(everyone.body.data.holidays.some((holiday) => holiday.name === "Lab Day Renamed"));
      const upcoming = await lab.json<{ data: { upcoming: Array<{ id: string; kind: string }> } }>("GET", "/action-center", ben);
      assert.ok(upcoming.body.data.upcoming.some((item) => item.id === `holiday:${id}`));

      assert.equal((await lab.call("DELETE", `/settings/holidays/${id}`, admin)).status, 200);
      assert.equal((await lab.call("DELETE", `/settings/holidays/${id}`, admin)).status, 404);
      const audit = await db.query<{ action: string }>("SELECT action FROM public.audit_events WHERE entity_type = 'holiday' ORDER BY id");
      assert.deepEqual(audit.rows.map((row) => row.action), ["HOLIDAY_CREATED", "HOLIDAY_UPDATED", "HOLIDAY_DELETED"]);
    });

    await t.test("company events are written by HR and shown to everyone", async () => {
      const event = { title: "Town hall", startsOn: addDays(today, 1), startTime: "15:00", endTime: "16:00", location: "Level 3" };
      assert.equal((await lab.call("POST", "/calendar/events", eli, event)).status, 403);
      assert.equal((await lab.call("POST", "/calendar/events", admin, { ...event, endTime: "14:00" })).status, 400);
      assert.equal((await lab.call("POST", "/calendar/events", admin, { ...event, startTime: undefined })).status, 400);
      assert.equal((await lab.call("POST", "/calendar/events", admin, { ...event, endsOn: addDays(today, 40) })).status, 400);
      const created = await lab.json<{ data: { event: { id: number; revision: number } } }>("POST", "/calendar/events", admin, event);
      assert.equal(created.status, 201, created.text);
      const { id } = created.body.data.event;

      const calendar = await lab.json<{ data: { events: Array<{ id: number; title: string }> } }>(
        "GET", `/calendar?from=${today}&to=${addDays(today, 7)}`, eli,
      );
      assert.ok(calendar.body.data.events.some((item) => item.id === id));
      const upcoming = await lab.json<{ data: { upcoming: Array<{ id: string; detail: string }> } }>("GET", "/action-center", eli);
      assert.equal(upcoming.body.data.upcoming.find((item) => item.id === `event:${id}`)?.detail, "15:00–16:00 · Level 3");

      assert.equal((await lab.call("PUT", `/calendar/events/${id}`, admin, { ...event, revision: 5 })).status, 409);
      assert.equal((await lab.call("PUT", `/calendar/events/${id}`, admin, { ...event, title: "Town hall (moved)", revision: 1 })).status, 200);
      assert.equal((await lab.call("DELETE", `/calendar/events/${id}`, eli)).status, 403);
      assert.equal((await lab.call("DELETE", `/calendar/events/${id}`, admin)).status, 200);
    });

    await t.test("search finds only what the caller could open", async () => {
      assert.equal((await lab.call("GET", "/search?q=a", ben)).status, 400);
      type Search = { data: {
        people: Array<{ id: number; path: string }>; departments: Array<{ name: string; people: number; path: string }>;
        destinations: Array<{ path: string }>; records: Array<{ id: number; path: string; status: string }>;
      } };

      const benGone = await lab.json<Search>("GET", "/search?q=Gone", ben);
      assert.equal(benGone.status, 200);
      assert.deepEqual(benGone.body.data.people, [], "a former employee is not found by a colleague");
      assert.deepEqual(benGone.body.data.records, [], "and colleagues never get HR records");
      assert.equal(benGone.text.includes("WPL-GONE"), false);

      const adminGone = await lab.json<Search>("GET", "/search?q=Gone", admin);
      assert.equal(adminGone.body.data.people.some((person) => person.id === 9703), false);
      assert.deepEqual(adminGone.body.data.records.map((record) => [record.id, record.path, record.status]), [[9703, "/admin/employees/9703", "resigned"]]);

      const eliPay = await lab.json<Search>("GET", "/search?q=payroll", eli);
      assert.ok(eliPay.body.data.destinations.some((destination) => destination.path === "/employee/payroll"));
      assert.equal(eliPay.body.data.destinations.some((destination) => /^\/(admin|team)/.test(destination.path)), false);
      const adminPay = await lab.json<Search>("GET", "/search?q=payroll", admin);
      assert.ok(adminPay.body.data.destinations.some((destination) => destination.path === "/admin/payroll"));
      assert.equal(adminPay.body.data.destinations.some((destination) => destination.path.startsWith("/employee")), false);
      const miraTeam = await lab.json<Search>("GET", "/search?q=team%20leave", mira);
      assert.ok(miraTeam.body.data.destinations.some((destination) => destination.path === "/team/leave"));
      const benTeam = await lab.json<Search>("GET", "/search?q=team%20leave", ben);
      assert.equal(benTeam.body.data.destinations.some((destination) => destination.path.startsWith("/team")), false);

      const departmentHit = await lab.json<Search>("GET", "/search?q=Workplace%20Lab%20A", ben);
      const labA = departmentHit.body.data.departments.find((department) => department.name === "Workplace Lab A");
      assert.equal(labA?.people, 2, "the count is the working company only");
      assert.equal(labA?.path, `/people?department=${departmentId("Workplace Lab A")}`);
      assert.deepEqual((await lab.json<Search>("GET", "/search?q=%25%25", ben)).body.data.people, [], "% is a character");
      const byEmail = await lab.json<Search>("GET", "/search?q=eli%40example", ben);
      assert.deepEqual(byEmail.body.data.people.map((person) => person.id), [9701]);
    });

    await t.test("the Action Center shows each role its own work, and follows the reporting line as it is now", async () => {
      type Center = { data: {
        requiresAction: Array<{ id: string; kind: string; link: string; title: string }>;
        waiting: Array<{ id: string; title: string }>; upcoming: Array<{ id: string; kind: string }>;
        recent: Array<{ id: number }>; counts: { requiresAction: number };
      } };
      const miraCenter = await lab.json<Center>("GET", "/action-center", mira);
      assert.equal(miraCenter.status, 200);
      const decisions = miraCenter.body.data.requiresAction.filter((item) => item.kind === "leave_decision").map((item) => item.id);
      assert.deepEqual(decisions, [`leave:${leaveTwo}`], "Eli's pending request, and not Ben's");
      assert.equal(miraCenter.body.data.requiresAction.find((item) => item.kind === "leave_decision")?.link, "/team/leave?status=pending");
      assert.ok(miraCenter.body.data.upcoming.some((item) => item.id === `team-out:${leaveOne}`));
      assert.ok(miraCenter.body.data.recent.length > 0);
      assert.equal(miraCenter.body.data.counts.requiresAction, miraCenter.body.data.requiresAction.length);

      const eliCenter = await lab.json<Center>("GET", "/action-center", eli);
      assert.equal(eliCenter.body.data.requiresAction.some((item) => item.kind === "leave_decision"), false);
      assert.equal(eliCenter.body.data.waiting.find((item) => item.id === `leave:${leaveTwo}`)?.title, "Leave request waiting for Mira Manager");
      assert.ok(eliCenter.body.data.upcoming.some((item) => item.id === `leave:${leaveOne}` && item.kind === "leave_upcoming"));
      assert.equal(eliCenter.text.includes(REASONS[1]!), false);

      const adminCenter = await lab.json<Center>("GET", "/action-center", admin);
      const hrDecisions = adminCenter.body.data.requiresAction.filter((item) => item.kind === "leave_decision").map((item) => item.id);
      assert.deepEqual(hrDecisions, [`leave:${leaveThree}`], "HR decides only what no manager can");

      // The reporting line changes: the item moves with it on the very next request.
      await db.query("UPDATE public.employees SET manager_id = NULL WHERE id = 9701");
      const miraAfter = await lab.json<Center>("GET", "/action-center", mira);
      assert.equal(miraAfter.body.data.requiresAction.some((item) => item.kind === "leave_decision"), false);
      assert.equal((await lab.call("GET", `/calendar?from=${today}&to=${today}&team=1`, mira)).status, 403, "no reports, no team view");
      const adminAfter = await lab.json<Center>("GET", "/action-center", admin);
      assert.deepEqual(
        adminAfter.body.data.requiresAction.filter((item) => item.kind === "leave_decision").map((item) => item.id).sort(),
        [`leave:${leaveThree}`, `leave:${leaveTwo}`].sort(),
      );
      const eliAfter = await lab.json<Center>("GET", "/action-center", eli);
      assert.equal(eliAfter.body.data.waiting.find((item) => item.id === `leave:${leaveTwo}`)?.title, "Leave request waiting for HR");
    });

    await t.test("reporting-line changes notify the employee and the new manager", async () => {
      const current = await lab.json<{ data: Record<string, unknown> }>("GET", "/employees/9702", admin);
      assert.equal(current.status, 200, current.text);
      const before = (await notificationsOf(9793)).length;
      // The whole record, as HR's edit form sends it, with the new reporting line.
      const updated = await lab.call("PUT", "/employees/9702", admin, {
        full_name: current.body.data.full_name,
        department_id: Number(current.body.data.department_id),
        employment_status: current.body.data.employment_status,
        manager_id: 9700,
      });
      assert.equal(updated.status, 200, await updated.text());
      const benRows = (await notificationsOf(9793)).slice(before);
      assert.deepEqual(benRows.map((row) => [row.kind, row.title, row.link]), [["manager_changed", "You now report to Mira Manager", "/people/9700"]]);
      const miraRows = (await notificationsOf(9791)).filter((row) => row.kind === "report_added");
      assert.deepEqual(miraRows.map((row) => [row.title, row.link]), [["Ben Other now reports to you", "/people/9702"]]);
    });

    assert.deepEqual((await lab.protectedRows() as { orphans: unknown[] }).orphans.length, 5, "the five protected orphans are untouched");
  });
});
