import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { runMigrations } from "../src/database/migrations.js";
import { UNUSABLE_HASH, withLab } from "./labHarness.js";

type LayoutResponse = {
  data: { available: boolean; layout: { version: number; items: unknown[] } | null; revision: number | null };
  code?: string;
};

// Explicit opt-in; the only permitted host is the isolated, internal Docker lab.
test("Dashboard personalization: migration 0017 and each account's own Home layout", {
  skip: process.env.HR_NEXUS_V3_LAB !== "1", timeout: 240_000,
}, async (t) => {
  await withLab(t, { label: "dash" }, async (lab) => {
    const { db } = lab;
    await db.query(
      `INSERT INTO public.departments (name) VALUES ('Dash Lab');
       INSERT INTO public.employees (id, employee_number, full_name, department_id, employment_status, job_title, employment_date)
       SELECT v.id, v.num, v.name, (SELECT id FROM public.departments WHERE name = 'Dash Lab'), 'active', 'Staff', '2024-01-15'
       FROM (VALUES (9400, 'DSH-ANA', 'Ana Employee'), (9401, 'DSH-MAX', 'Max Manager')) AS v(id, num, name);
       UPDATE public.employees SET manager_id = 9401 WHERE id = 9400;
       INSERT INTO public.users (id, employee_id, email, password_hash, role, is_active) VALUES
         (9490, NULL, 'dash-admin@example.invalid', '${UNUSABLE_HASH}', 'admin', TRUE),
         (9491, 9400, 'dash-ana@example.invalid', '${UNUSABLE_HASH}', 'employee', TRUE),
         (9492, 9401, 'dash-max@example.invalid', '${UNUSABLE_HASH}', 'employee', TRUE);`,
    );
    const admin = lab.sign(9490, "admin", null);
    const ana = lab.sign(9491, "employee", 9400);
    const max = lab.sign(9492, "employee", 9401);

    const put = (token: string | null, layout: unknown) =>
      lab.json<LayoutResponse>("PUT", "/dashboard/layout", token, { layout });
    const rowsFor = async (userId: number) =>
      (await db.query("SELECT count(*)::integer AS count FROM public.user_dashboard_layouts WHERE user_id = $1", [userId])).rows[0].count;

    await t.test("0017 adds one empty table, recorded once, and re-applying is a no-op", async () => {
      assert.ok((await db.query("SELECT to_regclass('public.user_dashboard_layouts') AS name")).rows[0].name);
      assert.equal((await db.query("SELECT count(*)::integer AS count FROM public.user_dashboard_layouts")).rows[0].count, 0);
      assert.equal((await db.query("SELECT count(*)::integer AS count FROM public.schema_migrations WHERE version = '0017'")).rows[0].count, 1);
      assert.deepEqual((await runMigrations(db, { mode: "apply", database: lab.database })).newlyApplied, []);
    });

    await t.test("with nothing saved, every account gets the default Home", async () => {
      for (const token of [admin, ana, max]) {
        const read = await lab.json<LayoutResponse>("GET", "/dashboard/layout", token);
        assert.equal(read.status, 200, read.text);
        assert.equal(read.body.data.available, true);
        assert.equal(read.body.data.layout, null);
      }
      assert.equal((await lab.call("GET", "/dashboard/layout")).status, 401);
    });

    const anaLayout = {
      version: 1,
      items: [
        { kind: "widget", widget: "my-attendance", size: "small" },
        { kind: "stack", id: "stack-ana001", size: "medium", widgets: ["action-center", "my-tasks"], smart: true },
      ],
    };

    await t.test("an account saves, reads back and resets only its own layout", async () => {
      const saved = await put(ana, anaLayout);
      assert.equal(saved.status, 200, saved.text);
      assert.deepEqual(saved.body.data.layout, anaLayout);
      assert.equal(saved.body.data.revision, 1);

      const changed = await put(ana, { ...anaLayout, items: anaLayout.items.slice(1) });
      assert.equal(changed.body.data.revision, 2);
      const read = await lab.json<LayoutResponse>("GET", "/dashboard/layout", ana);
      assert.deepEqual(read.body.data.layout, { ...anaLayout, items: anaLayout.items.slice(1) });

      assert.equal((await lab.json<LayoutResponse>("GET", "/dashboard/layout", max)).body.data.layout, null, "another account is untouched");

      // Presentation only: nothing about access is stored.
      const stored = (await db.query("SELECT layout FROM public.user_dashboard_layouts WHERE user_id = 9491")).rows[0].layout;
      assert.deepEqual(Object.keys(stored).sort(), ["items", "version"]);

      const reset = await lab.json<LayoutResponse>("DELETE", "/dashboard/layout", ana);
      assert.equal(reset.status, 200);
      assert.equal(reset.body.data.layout, null);
      assert.equal((await lab.json<LayoutResponse>("GET", "/dashboard/layout", ana)).body.data.layout, null);
      assert.equal(await rowsFor(9491), 0);
    });

    await t.test("each widget is checked against what the account may use", async () => {
      const refusals: Array<[string | null, unknown, number, string | undefined]> = [
        [ana, { version: 1, items: [{ kind: "widget", widget: "headcount", size: "small" }] }, 403, "widget_not_allowed"],
        [ana, { version: 1, items: [{ kind: "widget", widget: "team-today", size: "medium" }] }, 403, "widget_not_allowed"],
        [admin, { version: 1, items: [{ kind: "widget", widget: "my-payslip", size: "small" }] }, 403, "widget_not_allowed"],
        [admin, { version: 1, items: [{ kind: "stack", id: "stack-hr0001", size: "small", widgets: ["headcount", "team-leave"], smart: false }] }, 403, "widget_not_allowed"],
        [admin, { version: 1, items: [{ kind: "widget", widget: "headcount", size: "large" }] }, 400, "unsupported_size"],
        [admin, { version: 1, items: [{ kind: "widget", widget: "salary-browser", size: "small" }] }, 400, "unknown_widget"],
        [admin, "everything", 400, "invalid_layout"],
        [null, anaLayout, 401, undefined],
      ];
      for (const [token, layout, status, code] of refusals) {
        const refused = await put(token, layout);
        assert.equal(refused.status, status, `${JSON.stringify(layout)} -> ${refused.text}`);
        if (code) assert.equal(refused.body.code, code);
      }
      assert.equal(await rowsFor(9490), 0, "a refused layout stores nothing");
      assert.equal(await rowsFor(9491), 0);

      const manager = await put(max, { version: 1, items: [{ kind: "widget", widget: "team-today", size: "medium" }] });
      assert.equal(manager.status, 200, manager.text);
    });

    await t.test("a saved layout never outlives the access it was saved with", async () => {
      const saved = await put(max, {
        version: 1,
        items: [
          { kind: "widget", widget: "team-leave", size: "small" },
          { kind: "stack", id: "stack-max001", size: "medium", widgets: ["team-today", "company-updates"], smart: true },
          { kind: "widget", widget: "whos-out", size: "medium" },
        ],
      });
      assert.equal(saved.status, 200, saved.text);

      // Max's only report moves to another manager.
      await db.query("UPDATE public.employees SET manager_id = NULL WHERE id = 9400");
      try {
        const read = await lab.json<LayoutResponse>("GET", "/dashboard/layout", max);
        assert.deepEqual(read.body.data.layout, {
          version: 1,
          items: [
            { kind: "widget", widget: "company-updates", size: "medium" },
            { kind: "widget", widget: "whos-out", size: "medium" },
          ],
        });
        // The stored row is not a grant and is not rewritten by reading it.
        const stored = (await db.query("SELECT layout FROM public.user_dashboard_layouts WHERE user_id = 9492")).rows[0].layout;
        assert.equal(JSON.stringify(stored).includes("team-leave"), true);
        assert.equal((await lab.call("GET", "/team", max)).status, 403, "and the team data itself stays refused");
      } finally {
        await db.query("UPDATE public.employees SET manager_id = 9401 WHERE id = 9400");
      }
    });

    await t.test("the database refuses a malformed or oversized layout even without the API", async () => {
      await assert.rejects(
        db.query("INSERT INTO public.user_dashboard_layouts (user_id, layout) VALUES (9490, '[]'::jsonb)"),
        { code: "23514" },
      );
      await assert.rejects(
        db.query(
          `INSERT INTO public.user_dashboard_layouts (user_id, layout)
           VALUES (9490, jsonb_build_object('version', 1, 'items', '[]'::jsonb, 'padding', repeat('x', 20000)))`,
        ),
        { code: "23514" },
      );
    });

    await t.test("without 0017, Home stays the default and saving says personalization is unavailable", async () => {
      const rollback = await readFile(new URL("../../docs/sql/rollback_0017_dashboard_layouts.sql", import.meta.url), "utf8");
      await db.query(rollback);

      const read = await lab.json<LayoutResponse>("GET", "/dashboard/layout", max);
      assert.equal(read.status, 200, read.text);
      assert.deepEqual(read.body.data, { available: false, layout: null, revision: null, updatedAt: null });
      const refused = await put(max, { version: 1, items: [] });
      assert.equal(refused.status, 503);
      assert.equal(refused.body.code, "personalization_unavailable");
      assert.equal((await lab.call("DELETE", "/dashboard/layout", max)).status, 503);
      // The rest of Home is unaffected.
      assert.equal((await lab.call("GET", "/action-center", max)).status, 200);

      assert.deepEqual((await runMigrations(db, { mode: "apply", database: lab.database })).newlyApplied, ["0017"]);
      const restored = await lab.json<LayoutResponse>("GET", "/dashboard/layout", max);
      assert.equal(restored.body.data.available, true);
      assert.equal(restored.body.data.layout, null);
    });
  });
});
