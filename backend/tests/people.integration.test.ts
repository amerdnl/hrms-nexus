import assert from "node:assert/strict";
import { test } from "node:test";
import { UNUSABLE_HASH, withLab } from "./labHarness.js";

/** Strings from the fixtures that must never appear in a social response. */
const SENSITIVE = [
  "1987-04-12", "13 Jalan Rahsia", "Emergency Person", "+60 11-9999 0000",
  "8765432", "87654.32", "3.2468135", "101.8642097", "unusable-lab-hash",
  "date_of_birth", "address", "emergency", "salary", "compensation", "latitude", "longitude",
  "password", "must_change_password", "gender",
];

function assertNoSensitive(label: string, text: string, extra: string[] = []) {
  for (const needle of [...SENSITIVE, ...extra]) {
    assert.equal(text.includes(needle), false, `${label} leaked "${needle}"`);
  }
}

// Explicit opt-in; the only permitted host is the isolated, internal Docker lab.
test("M2 people: directory, social profiles, org chart and timeline tiers", {
  skip: process.env.HR_NEXUS_V3_LAB !== "1", timeout: 240_000,
}, async (t) => {
  await withLab(t, { label: "v3_people" }, async (lab) => {
    const { db } = lab;

    await db.query(
      `INSERT INTO public.departments (name) VALUES ('People Lab'), ('Other Lab') ON CONFLICT (name) DO NOTHING;
       INSERT INTO public.employees (id, employee_number, full_name, department_id, employment_status,
         job_title, phone, date_of_birth, address, gender, emergency_contact_name, emergency_contact_phone, employment_date)
       SELECT v.id, v.num, v.name, (SELECT id FROM public.departments WHERE name = v.dept), v.status, v.title,
         '+60 3-5550 ' || v.id, '1987-04-12', '13 Jalan Rahsia', 'Female', 'Emergency Person', '+60 11-9999 0000', '2024-02-01'
       FROM (VALUES
         (9600, 'PPL-LEAD', 'Hana Lead', 'People Lab', 'active', 'Lead'),
         (9601, 'PPL-A', 'Adam Alpha', 'People Lab', 'active', 'Engineer'),
         (9602, 'PPL-B', 'Bella Beta', 'People Lab', 'probation', 'Engineer'),
         (9603, 'PPL-C', 'Carl Gamma', 'Other Lab', 'active', 'Analyst'),
         (9604, 'PPL-GONE', 'Gina Gone', 'People Lab', 'resigned', 'Engineer'),
         (9605, 'PPL-ORPH', 'Oscar Orphan', 'Other Lab', 'active', 'Analyst')
       ) AS v(id, num, name, dept, status, title);
       UPDATE public.employees SET manager_id = 9600 WHERE id IN (9601, 9602, 9604);
       UPDATE public.employees SET manager_id = 9604 WHERE id = 9605;
       INSERT INTO public.users (id, employee_id, email, password_hash, role, is_active) VALUES
         (9690, NULL, 'people-admin@example.invalid', '${UNUSABLE_HASH}', 'admin', TRUE),
         (9691, 9600, 'hana@example.invalid', '${UNUSABLE_HASH}', 'employee', TRUE),
         (9692, 9601, 'adam@example.invalid', '${UNUSABLE_HASH}', 'employee', TRUE),
         (9693, 9603, 'carl@example.invalid', '${UNUSABLE_HASH}', 'employee', TRUE);
       INSERT INTO public.employee_compensation (employee_id, basic_salary_sen, effective_from)
         VALUES (9601, 8765432, '2026-01-01');
       INSERT INTO public.attendance (employee_id, attendance_date, check_in_time, status,
         verification_method, verification_status, check_in_latitude, check_in_longitude)
         VALUES (9601, '2026-09-01', '09:00', 'present', 'QR_LOCATION', 'verified', 3.2468135, 101.8642097);
       INSERT INTO public.employee_profiles (employee_id, about, skills, share_phone)
         VALUES (9601, 'I build the payroll engine.', ARRAY['Payroll', 'PostgreSQL'], FALSE),
                (9603, 'Numbers person.', ARRAY['Forecasting'], TRUE);`,
    );

    const admin = lab.sign(9690, "admin", null);
    const hana = lab.sign(9691, "employee", 9600);
    const adam = lab.sign(9692, "employee", 9601);
    const carl = lab.sign(9693, "employee", 9603);

    await t.test("anonymous callers get nothing", async () => {
      for (const path of ["/people", "/people/9601", "/people/9601/timeline", "/org/chart"]) {
        assert.equal((await lab.call("GET", path)).status, 401, path);
      }
    });

    await t.test("the directory lists the working company, social fields only", async () => {
      const { status, body, text } = await lab.json<{ data: { people: Array<{ id: number }>; total: number } }>(
        "GET", "/people?pageSize=50", carl,
      );
      assert.equal(status, 200);
      const ids = body.data.people.map((person) => person.id);
      for (const id of [9600, 9601, 9602, 9603, 9605]) assert.ok(ids.includes(id), `missing ${id}`);
      assert.equal(ids.includes(9604), false, "a resigned employee is not in the directory");
      assertNoSensitive("directory", text, ["+60 3-5550"]);
    });

    await t.test("search covers skills, and wildcards are characters, not patterns", async () => {
      const skill = await lab.json<{ data: { people: Array<{ id: number }> } }>("GET", "/people?search=postgres", carl);
      assert.deepEqual(skill.body.data.people.map((person) => person.id), [9601]);
      const wildcard = await lab.json<{ data: { total: number } }>("GET", "/people?search=%25", carl);
      assert.equal(wildcard.body.data.total, 0, "a bare % must not match everyone");
      assert.equal((await lab.call("GET", "/people?pageSize=500", carl)).status, 400);
      assert.equal((await lab.call("GET", "/people?department=abc", carl)).status, 400);
    });

    await t.test("a coworker sees the social layer and nothing else", async () => {
      const { status, body, text } = await lab.json<{ data: {
        relation: string; layers: string[]; person: { phone: string | null; employmentStatus: string | null; about: string; skills: string[]; workEmail: string };
        manager: { id: number } | null;
      } }>("GET", "/people/9601", carl);
      assert.equal(status, 200);
      assert.equal(body.data.relation, "coworker");
      assert.deepEqual(body.data.layers, ["social"]);
      assert.equal(body.data.person.phone, null, "phone stays private until shared");
      assert.equal(body.data.person.employmentStatus, null, "status is not a colleague's business");
      assert.equal(body.data.person.about, "I build the payroll engine.");
      assert.deepEqual(body.data.person.skills, ["Payroll", "PostgreSQL"]);
      assert.equal(body.data.person.workEmail, "adam@example.invalid");
      assert.equal(body.data.manager?.id, 9600);
      assertNoSensitive("coworker profile", text, ["+60 3-5550 9601"]);
    });

    await t.test("a shared phone is visible to colleagues; an unshared one is not", async () => {
      const shared = await lab.json<{ data: { person: { phone: string } } }>("GET", "/people/9603", adam);
      assert.equal(shared.body.data.person.phone, "+60 3-5550 9603");
    });

    await t.test("self, manager and HR each get their own layers", async () => {
      const self = await lab.json<{ data: { relation: string; layers: string[]; person: { phone: string; employmentStatus: string } } }>("GET", "/people/9601", adam);
      assert.equal(self.body.data.relation, "self");
      assert.deepEqual(self.body.data.layers, ["social", "self"]);
      assert.equal(self.body.data.person.phone, "+60 3-5550 9601", "you always see your own phone");
      assert.equal(self.body.data.person.employmentStatus, "active");

      const manager = await lab.json<{ data: { relation: string; layers: string[] } }>("GET", "/people/9601", hana);
      assert.equal(manager.body.data.relation, "manager");
      assert.deepEqual(manager.body.data.layers, ["social", "team"]);

      const hr = await lab.json<{ data: { relation: string; layers: string[] } }>("GET", "/people/9601", admin);
      assert.equal(hr.body.data.relation, "admin");
      assert.deepEqual(hr.body.data.layers, ["social", "hr"]);
      // Even HR gets only the social layer here; the HR record is elsewhere.
      assertNoSensitive("admin social profile", hr.text, ["+60 3-5550 9601"]);
    });

    await t.test("a former employee is HR history: 404 to colleagues, visible to HR", async () => {
      assert.equal((await lab.call("GET", "/people/9604", carl)).status, 404);
      assert.equal((await lab.call("GET", "/people/9604/timeline", carl)).status, 404);
      assert.equal((await lab.call("GET", "/people/9604", admin)).status, 200);
      assert.equal((await lab.call("GET", "/people/999999", admin)).status, 404);
    });

    await t.test("links off a profile never reveal someone who has left", async () => {
      const lead = await lab.json<{ data: { directReports: Array<{ id: number }> } }>("GET", "/people/9600", carl);
      assert.deepEqual(lead.body.data.directReports.map((report) => report.id), [9601, 9602]);
      const orphan = await lab.json<{ data: { manager: unknown; chain: unknown[] } }>("GET", "/people/9605", carl);
      assert.equal(orphan.body.data.manager, null, "a manager who has left is not shown");
      assert.deepEqual(orphan.body.data.chain, []);
      const bella = await lab.json<{ data: { chain: Array<{ id: number }>; peers: Array<{ id: number }> } }>("GET", "/people/9602", carl);
      assert.deepEqual(bella.body.data.chain.map((link) => link.id), [9600]);
      assert.deepEqual(bella.body.data.peers.map((link) => link.id), [9601]);
    });

    await t.test("the org chart is social and roots anyone whose manager has left", async () => {
      const { status, body, text } = await lab.json<{ data: { nodes: Array<{ id: number; managerId: number | null }> } }>(
        "GET", "/org/chart", carl,
      );
      assert.equal(status, 200);
      const byId = new Map(body.data.nodes.map((node) => [node.id, node]));
      assert.equal(byId.has(9604), false);
      assert.equal(byId.get(9605)?.managerId, null);
      assert.equal(byId.get(9601)?.managerId, 9600);
      assertNoSensitive("org chart", text, ["+60 3-5550"]);
    });

    await t.test("editing About accepts only colleague-facing fields", async () => {
      const restricted = await lab.json("PUT", "/profile/about", adam, {
        about: "x", skills: [], sharePhone: false, job_title: "CEO",
      });
      assert.equal(restricted.status, 400);
      assert.match(restricted.text, /unsupported fields: job_title/);
      assert.equal((await lab.json("PUT", "/profile/about", adam, {
        about: "x", skills: ["y".repeat(41)], sharePhone: false,
      })).status, 400);
      assert.equal((await lab.json("PUT", "/profile/about", adam, {
        about: "x", skills: Array.from({ length: 31 }, (_, i) => `s${i}`), sharePhone: false,
      })).status, 400);
      assert.equal((await lab.json("PUT", "/profile/about", adam, { about: "x", skills: [] })).status, 400, "all three are required");

      const saved = await lab.json<{ data: { skills: string[] } }>("PUT", "/profile/about", adam, {
        about: "  I build the payroll engine and mentor.  ", skills: ["Payroll", "payroll", " SQL ", ""], sharePhone: true,
      });
      assert.equal(saved.status, 200, saved.text);
      assert.deepEqual(saved.body.data.skills, ["Payroll", "SQL"], "trimmed and de-duplicated");
      const now = await lab.json<{ data: { person: { phone: string } } }>("GET", "/people/9601", carl);
      assert.equal(now.body.data.person.phone, "+60 3-5550 9601", "sharing takes effect");

      const audit = (await db.query(
        "SELECT changes FROM public.audit_events WHERE action = 'PROFILE_UPDATED' ORDER BY id DESC LIMIT 1",
      )).rows[0];
      assert.deepEqual(audit.changes.share_phone, { before: false, after: true });
      assert.equal(JSON.stringify(audit.changes).includes("mentor"), false, "the text itself is not copied into the audit log");
    });

    await t.test("an account with no employee record has no colleague profile to edit", async () => {
      const refused = await lab.json("PUT", "/profile/about", admin, { about: null, skills: [], sharePhone: false });
      assert.equal(refused.status, 403);
      assert.equal((refused.body as { code: string }).code, "no_employee_record");
    });

    await t.test("employment changes reach the timeline with the right audience", async () => {
      const current = (await lab.json<{ data: Record<string, unknown> }>("GET", "/employees/9601", admin)).body.data;
      const updated = await lab.json("PUT", "/employees/9601", admin, {
        full_name: current.full_name, department_id: Number(current.department_id),
        employment_status: "probation", job_title: "Senior Engineer",
      });
      assert.equal(updated.status, 200, updated.text);

      const kinds = async (token: string) => (await lab.json<{ data: { events: Array<{ kind: string }> } }>(
        "GET", "/people/9601/timeline", token,
      )).body.data.events.map((event) => event.kind);

      const coworker = await kinds(carl);
      assert.ok(coworker.includes("job_title_changed"));
      assert.ok(coworker.includes("joined"), "the derived joined entry is company-visible");
      assert.equal(coworker.includes("status_changed"), false, "status changes are for the manager and HR");
      assert.ok((await kinds(hana)).includes("status_changed"), "the manager sees it");
      assert.ok((await kinds(admin)).includes("status_changed"), "HR sees it");
      assert.equal((await kinds(adam)).includes("status_changed"), false, "a management-tier event is not a self-tier one");
    });

    await t.test("the timeline is append-only in the database", async () => {
      await assert.rejects(db.query("UPDATE public.employee_events SET title = 'edited'"), /append-only/);
      await assert.rejects(db.query("DELETE FROM public.employee_events"), /append-only/);
    });
  });
});
