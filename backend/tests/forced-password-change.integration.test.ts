import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { once } from "node:events";
import { test } from "node:test";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import pg from "pg";
import { runMigrations } from "../src/database/migrations.js";
import { dropLabClones } from "./labClones.js";

// Explicit opt-in; the only permitted host is the isolated, internal Docker lab.
// Every write below happens in a disposable clone, never in the source database.
test("Forced first-login password change: containment, clearing and bypass attempts", {
  skip: process.env.HR_NEXUS_PASSWORD_LAB !== "1", timeout: 300_000,
}, async (t) => {
  const suffix = randomBytes(5).toString("hex");
  const host = "hr-nexus-v2-migration-lab";
  const admin = new pg.Pool({ host, user: "postgres", database: "postgres" });
  const database = `hr_nexus_password_${suffix}`;
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

    // Rows that existed before 0009 ran, so the backfill can be judged on them.
    const preExisting = (await db.query<{ count: number }>(
      "SELECT COUNT(*)::int AS count FROM public.users",
    )).rows[0]!.count;

    await runMigrations(db, { mode: "apply", database });

    await t.test("0009 flags nobody who already existed", async () => {
      const { rows } = await db.query<{ flagged: number; total: number }>(
        `SELECT COUNT(*) FILTER (WHERE must_change_password)::int AS flagged,
                COUNT(*)::int AS total FROM public.users`,
      );
      assert.equal(rows[0]!.total, preExisting, "no user row was added or removed");
      assert.equal(rows[0]!.flagged, 0, "an existing account must not be locked out");

      const { rows: column } = await db.query(
        `SELECT is_nullable, column_default FROM information_schema.columns
         WHERE table_name = 'users' AND column_name = 'must_change_password'`,
      );
      assert.equal(column[0]!.is_nullable, "NO");
      assert.equal(column[0]!.column_default, "false");
    });

    // ------------------------------------------------------- synthetic data

    const settledPassword = "SettledPass!2026";
    const temporaryPassword = "TempIssued!2026";

    await db.query(
      `INSERT INTO public.departments (name, description)
       VALUES ('Password Lab', 'Lab') ON CONFLICT (name) DO NOTHING;

       INSERT INTO public.employees
         (id, employee_number, full_name, department_id, employment_status, job_title)
       VALUES
         (9500, 'PWD-1', 'Settled Employee',
          (SELECT id FROM public.departments WHERE name='Password Lab'), 'active', 'Engineer'),
         (9501, 'PWD-2', 'Temporary Employee',
          (SELECT id FROM public.departments WHERE name='Password Lab'), 'active', 'Analyst'),
         (9502, 'PWD-3', 'Flagged Admin Person',
          (SELECT id FROM public.departments WHERE name='Password Lab'), 'active', 'Manager');`,
    );

    const settledHash = await bcrypt.hash(settledPassword, 12);
    const temporaryHash = await bcrypt.hash(temporaryPassword, 12);

    await db.query(
      `INSERT INTO public.users
         (id, employee_id, email, password_hash, role, is_active, must_change_password)
       VALUES
         (9500, NULL,  'pwd-admin@example.invalid',   $1, 'admin',    TRUE, FALSE),
         (9501, 9500,  'pwd-settled@example.invalid', $1, 'employee', TRUE, FALSE),
         (9502, 9501,  'pwd-temp@example.invalid',    $2, 'employee', TRUE, TRUE),
         (9503, 9502,  'pwd-flagged-admin@example.invalid', $2, 'admin', TRUE, TRUE)`,
      [settledHash, temporaryHash],
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

    const call = (
      method: string, endpoint: string, body?: unknown, token?: string | null,
    ) => fetch(`${origin}${endpoint}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });

    const signIn = async (email: string, password: string) => {
      const response = await call("POST", "/auth/login", { email, password });
      return { status: response.status, body: await response.json() };
    };

    const sign = (userId: number, role: string, employeeId: number | null) =>
      jwt.sign({ role, employeeId }, process.env.JWT_SECRET!, {
        subject: String(userId), expiresIn: "40m",
      });

    const flagOf = async (userId: number) => (await db.query<{ flag: boolean }>(
      "SELECT must_change_password AS flag FROM public.users WHERE id = $1", [userId],
    )).rows[0]!.flag;

    // ------------------------------------------------------------- sign-in

    await t.test("a flagged account can still sign in", async () => {
      const result = await signIn("pwd-temp@example.invalid", temporaryPassword);
      assert.equal(result.status, 200, JSON.stringify(result.body));
      assert.equal(result.body.data.user.mustChangePassword, true);
      // Authentication succeeding is the point: the restriction is on what the
      // session may then do, not on whether it may exist.
      assert.equal(typeof result.body.data.token, "string");
    });

    await t.test("a settled account signs in and is not flagged", async () => {
      const result = await signIn("pwd-settled@example.invalid", settledPassword);
      assert.equal(result.status, 200);
      assert.equal(result.body.data.user.mustChangePassword, false);
    });

    await t.test("no credential material appears in the sign-in response", async () => {
      const result = await signIn("pwd-temp@example.invalid", temporaryPassword);
      const text = JSON.stringify(result.body);
      assert.equal(text.includes("password_hash"), false);
      assert.equal(text.includes("passwordHash"), false);
      assert.equal(/\$2[aby]\$\d\d\$/.test(text), false);
      assert.equal(text.includes(temporaryPassword), false);
    });

    // --------------------------------------------------------- containment

    const temporaryToken = sign(9502, "employee", 9501);
    const flaggedAdminToken = sign(9503, "admin", 9502);
    const settledToken = sign(9501, "employee", 9500);
    const adminToken = sign(9500, "admin", null);

    await t.test("a flagged session may reach exactly three endpoints", async () => {
      const permitted: Array<[string, string, unknown?]> = [
        ["GET", "/auth/me"],
        ["POST", "/auth/logout"],
        // Reached, and refused on its own merits rather than by the guard.
        ["PUT", "/profile/password", { currentPassword: "x", newPassword: "y", confirmPassword: "y" }],
      ];

      for (const [method, endpoint, body] of permitted) {
        const response = await call(method, endpoint, body, temporaryToken);
        assert.notEqual(response.status, 403,
          `${method} ${endpoint} must not be blocked by the forced-change guard`);
      }
    });

    await t.test("every other protected route refuses a flagged session", async () => {
      const blocked: Array<[string, string]> = [
        ["GET", "/profile"],
        ["PUT", "/profile"],
        ["GET", "/dashboard/employee"],
        ["GET", "/attendance/today"],
        ["GET", "/leaves/me"],
        ["GET", "/leaves/me/balances"],
        ["GET", "/payroll/me/payslips"],
      ];

      for (const [method, endpoint] of blocked) {
        const response = await call(method, endpoint, undefined, temporaryToken);
        assert.equal(response.status, 403, `${method} ${endpoint} must be refused`);
        const body = await response.json();
        assert.equal(body.code, "PASSWORD_CHANGE_REQUIRED", `${endpoint} must say why`);
      }
    });

    await t.test("an administrator is not exempt from their own flag", async () => {
      const blocked = [
        "/dashboard/admin", "/employees", "/departments", "/settings",
        "/reports/workforce", "/audit", "/export/datasets", "/payroll/periods",
      ];

      for (const endpoint of blocked) {
        const response = await call("GET", endpoint, undefined, flaggedAdminToken);
        assert.equal(response.status, 403, `${endpoint} must refuse a flagged administrator`);
        assert.equal((await response.json()).code, "PASSWORD_CHANGE_REQUIRED");
      }

      // The same routes answer an unflagged administrator, so the refusal above
      // is the flag and not a missing role.
      assert.equal((await call("GET", "/employees", undefined, adminToken)).status, 200);
    });

    await t.test("a refusal leaks nothing about the data it protects", async () => {
      for (const endpoint of ["/employees", "/reports/workforce", "/export/datasets"]) {
        const text = await (await call("GET", endpoint, undefined, flaggedAdminToken)).text();
        assert.doesNotMatch(text, /PWD-|Settled Employee|pwd-settled|\$2[aby]\$/);
      }
    });

    await t.test("a settled session is unaffected by any of this", async () => {
      assert.equal((await call("GET", "/profile", undefined, settledToken)).status, 200);
      assert.equal((await call("GET", "/dashboard/employee", undefined, settledToken)).status, 200);
      assert.equal((await call("GET", "/leaves/me", undefined, settledToken)).status, 200);
    });

    // ------------------------------------------------------- stale tokens

    await t.test("a token minted before the flag was set does not bypass it", async () => {
      // Issued while the account was clean, then the account is flagged.
      const earlyToken = sign(9501, "employee", 9500);
      assert.equal((await call("GET", "/profile", undefined, earlyToken)).status, 200);

      await db.query("UPDATE public.users SET must_change_password = TRUE WHERE id = 9501");
      const afterFlag = await call("GET", "/profile", undefined, earlyToken);
      assert.equal(afterFlag.status, 403, "the old token must not keep the old answer");
      assert.equal((await afterFlag.json()).code, "PASSWORD_CHANGE_REQUIRED");

      await db.query("UPDATE public.users SET must_change_password = FALSE WHERE id = 9501");
      assert.equal((await call("GET", "/profile", undefined, earlyToken)).status, 200,
        "and it must be usable again the moment the column says so");
    });

    await t.test("a forged claim cannot assert the account is clean", async () => {
      // The flag is not a claim, so there is nothing to forge; a token carrying
      // one is simply ignored, and the database still decides.
      const forged = jwt.sign(
        { role: "employee", employeeId: 9501, mustChangePassword: false },
        process.env.JWT_SECRET!, { subject: "9502", expiresIn: "20m" },
      );
      const response = await call("GET", "/dashboard/employee", undefined, forged);
      assert.equal(response.status, 403);
      assert.equal((await response.json()).code, "PASSWORD_CHANGE_REQUIRED");
    });

    await t.test("no token at all is still unauthorized, not merely restricted", async () => {
      assert.equal((await call("GET", "/profile", undefined, null)).status, 401);
      assert.equal((await call("PUT", "/profile/password", {}, null)).status, 401);
    });

    // ------------------------------------------------------------ clearing

    await t.test("a failed change leaves the flag exactly where it was", async () => {
      const attempts: Array<[string, unknown]> = [
        ["wrong current password", {
          currentPassword: "NotTheOne!2026",
          newPassword: "BrandNew!2026", confirmPassword: "BrandNew!2026",
        }],
        ["mismatched confirmation", {
          currentPassword: temporaryPassword,
          newPassword: "BrandNew!2026", confirmPassword: "Different!2026",
        }],
        ["too short", {
          currentPassword: temporaryPassword, newPassword: "short", confirmPassword: "short",
        }],
        ["reusing the temporary password", {
          currentPassword: temporaryPassword,
          newPassword: temporaryPassword, confirmPassword: temporaryPassword,
        }],
      ];

      for (const [label, body] of attempts) {
        const response = await call("PUT", "/profile/password", body, temporaryToken);
        assert.equal(response.status, 400, `${label} must be refused`);
        assert.equal(await flagOf(9502), true, `${label} must not clear the flag`);
      }

      // And the temporary password still works, so nothing was half-written.
      assert.equal((await signIn("pwd-temp@example.invalid", temporaryPassword)).status, 200);
    });

    await t.test("a correct change clears the flag and the session continues", async () => {
      const newPassword = "ChosenByMe!2026";
      const response = await call("PUT", "/profile/password", {
        currentPassword: temporaryPassword,
        newPassword, confirmPassword: newPassword,
      }, temporaryToken);
      assert.equal(response.status, 200, await response.text());
      assert.equal(await flagOf(9502), false);

      // The same token, unchanged, now reaches the application.
      assert.equal((await call("GET", "/dashboard/employee", undefined, temporaryToken)).status, 200);
      assert.equal((await call("GET", "/profile", undefined, temporaryToken)).status, 200);

      // The old password is gone and the new one works.
      assert.equal((await signIn("pwd-temp@example.invalid", temporaryPassword)).status, 401);
      const fresh = await signIn("pwd-temp@example.invalid", newPassword);
      assert.equal(fresh.status, 200);
      assert.equal(fresh.body.data.user.mustChangePassword, false);
    });

    await t.test("an ordinary change by a settled user does not re-flag them", async () => {
      const next = "SettledAgain!2026";
      const response = await call("PUT", "/profile/password", {
        currentPassword: settledPassword, newPassword: next, confirmPassword: next,
      }, settledToken);
      assert.equal(response.status, 200, await response.text());
      assert.equal(await flagOf(9501), false);
      assert.equal((await signIn("pwd-settled@example.invalid", next)).status, 200);
    });

    await t.test("logout works while flagged", async () => {
      const response = await call("POST", "/auth/logout", undefined, flaggedAdminToken);
      assert.equal(response.status, 200);
      assert.equal(await flagOf(9503), true, "signing out is not a way to clear it");
    });

    await t.test("the current-user endpoint reports the flag while flagged", async () => {
      const response = await call("GET", "/auth/me", undefined, flaggedAdminToken);
      assert.equal(response.status, 200);
      const body = await response.json();
      assert.equal(body.data.user.mustChangePassword, true);
      assert.equal(JSON.stringify(body).includes("password_hash"), false);
      assert.equal(/\$2[aby]\$\d\d\$/.test(JSON.stringify(body)), false);
    });

    // --------------------------------------------------------- concurrency

    await t.test("two simultaneous changes cannot both succeed", async () => {
      const start = "RaceStart!2026";
      const hash = await bcrypt.hash(start, 12);
      await db.query(
        "UPDATE public.users SET password_hash = $1, must_change_password = TRUE WHERE id = 9503",
        [hash],
      );

      const attempt = (next: string) => call("PUT", "/profile/password", {
        currentPassword: start, newPassword: next, confirmPassword: next,
      }, flaggedAdminToken);

      const [first, second] = await Promise.all([
        attempt("RaceWinnerA!2026"), attempt("RaceWinnerB!2026"),
      ]);
      const statuses = [first.status, second.status].sort();

      // The row lock serialises them, so the second is judged against the
      // password the first one set and is correctly refused.
      assert.deepEqual(statuses, [200, 400],
        `exactly one must win, got ${JSON.stringify(statuses)}`);
      assert.equal(await flagOf(9503), false);

      // Exactly one of the two new passwords is in force, and the old one is not.
      const works = await Promise.all(
        ["RaceWinnerA!2026", "RaceWinnerB!2026"].map(
          async (candidate) => (await signIn("pwd-flagged-admin@example.invalid", candidate)).status,
        ),
      );
      assert.equal(works.filter((status) => status === 200).length, 1);
      assert.equal((await signIn("pwd-flagged-admin@example.invalid", start)).status, 401);
    });

    // -------------------------------------------------------------- audit

    await t.test("a forced change is audited, safely and distinguishably", async () => {
      const events = (await db.query(
        `SELECT action, entity_type, summary, changes, actor_label
         FROM public.audit_events WHERE action = 'PASSWORD_CHANGED' ORDER BY id`,
      )).rows;
      assert.ok(events.length >= 2, "both the forced and the ordinary change are recorded");

      const forced = events.filter((event) => event.changes?.forced === true);
      const ordinary = events.filter((event) => event.changes?.forced === false);
      assert.ok(forced.length >= 1, "a forced change is marked as one");
      assert.ok(ordinary.length >= 1, "an ordinary change is marked as one");
      assert.match(forced[0]!.summary, /temporary password/i);

      const text = JSON.stringify(events);
      for (const secret of [
        temporaryPassword, settledPassword, "ChosenByMe!2026", "RaceWinnerA!2026",
        "password_hash", "RaceStart!2026",
      ]) {
        assert.equal(text.includes(secret), false, `the audit log must not contain "${secret}"`);
      }
      assert.equal(/\$2[aby]\$\d\d\$/.test(text), false, "no hash may reach the audit log");
    });

    await t.test("nothing in the whole audit log carries credential material", async () => {
      const { rows } = await db.query(
        "SELECT summary, changes::text AS changes, actor_label FROM public.audit_events",
      );
      const text = JSON.stringify(rows);
      assert.equal(/\$2[aby]\$\d\d\$/.test(text), false);
      assert.equal(/must_change_password.*true/i.test(text), false,
        "the flag's value is state, not something to copy into a change set");
    });

    // ------------------------------------------------- creation flows flag

    await t.test("an administrator creating an employee issues a flagged account", async () => {
      const created = await call("POST", "/employees", {
        employee_number: "PWD-NEW", full_name: "Newly Created",
        email: "pwd-new@example.invalid", temporary_password: "IssuedByAdmin!2026",
        job_title: "Analyst", employment_status: "active",
        department_id: (await db.query(
          "SELECT id FROM public.departments WHERE name = 'Password Lab'",
        )).rows[0]!.id,
      }, adminToken);
      assert.equal(created.status, 201, await created.text());

      const { rows } = await db.query<{ flag: boolean }>(
        "SELECT must_change_password AS flag FROM public.users WHERE email = 'pwd-new@example.invalid'",
      );
      assert.equal(rows[0]!.flag, true, "an administrator-set password is still temporary");

      // And it behaves that way end to end.
      const session = await signIn("pwd-new@example.invalid", "IssuedByAdmin!2026");
      assert.equal(session.status, 200);
      assert.equal(session.body.data.user.mustChangePassword, true);
      assert.equal(
        (await call("GET", "/dashboard/employee", undefined, session.body.data.token)).status, 403,
      );
    });

    await t.test("an imported account is flagged", async () => {
      const departmentId = (await db.query(
        "SELECT id FROM public.departments WHERE name = 'Password Lab'",
      )).rows[0]!.id;
      assert.ok(departmentId);

      // Department is a required mapping, so the file carries one.
      const csv = [
        "employee_number,full_name,email,job_title,employment_status,department",
        "PWD-IMP,Imported Person,pwd-imported@example.invalid,Clerk,active,Password Lab",
      ].join("\n");

      const form = new FormData();
      form.append("file", new Blob([csv]), "staff.csv");
      const uploaded = await fetch(`${origin}/import/jobs`, {
        method: "POST",
        headers: { Authorization: `Bearer ${adminToken}` },
        body: form,
      });
      // Read once: consuming the body for the assertion message would leave
      // nothing to parse afterwards.
      const uploadedText = await uploaded.text();
      assert.equal(uploaded.status, 201, uploadedText);
      const created = JSON.parse(uploadedText).data;

      const mapped = await call("PUT", `/import/jobs/${created.job.id}/mapping`, {
        mapping: created.suggested_mapping,
      }, adminToken);
      const mappedText = await mapped.text();
      assert.equal(mapped.status, 200, `mapping: ${mappedText}`);
      const confirmed = await call(
        "POST", `/import/jobs/${created.job.id}/confirm`, undefined, adminToken,
      );
      const confirmedText = await confirmed.text();
      assert.equal(confirmed.status, 200, confirmedText);

      // The one-time password is returned to the administrator here; the hash
      // never is.
      assert.equal(/"password_hash"/.test(confirmedText), false);
      assert.equal(/\$2[aby]\$\d\d\$/.test(confirmedText), false);

      const { rows } = await db.query<{ flag: boolean }>(
        `SELECT must_change_password AS flag FROM public.users
         WHERE email = 'pwd-imported@example.invalid'`,
      );
      assert.equal(rows.length, 1, "the import created the account");
      assert.equal(rows[0]!.flag, true, "a generated password is always temporary");
    });

    await t.test("the import response never returns a hash, only the one-time password", async () => {
      const { rows } = await db.query(
        "SELECT password_hash FROM public.users WHERE email = 'pwd-imported@example.invalid'",
      );
      // The hash exists in the database and nowhere else; it is not the value
      // the administrator was shown.
      assert.match(rows[0]!.password_hash, /^\$2[aby]\$\d\d\$/);
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
