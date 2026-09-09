import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { once } from "node:events";
import { test } from "node:test";
import ExcelJS from "exceljs";
import jwt from "jsonwebtoken";
import pg from "pg";
import { loadMigrations, runMigrations } from "../src/database/migrations.js";

// Explicit opt-in; the only permitted host is the isolated, internal Docker lab.
// Every write below happens in a disposable clone, never in the source database.
test("Company import: migration 0004 and the authenticated import workflow", {
  skip: process.env.HR_NEXUS_IMPORT_LAB !== "1", timeout: 180_000,
}, async (t) => {
  const suffix = randomBytes(5).toString("hex");
  const host = "hr-nexus-v2-migration-lab";
  const admin = new pg.Pool({ host, user: "postgres", database: "postgres" });
  const database = `hr_nexus_import_${suffix}`;
  let pool: pg.Pool | undefined;
  let appPool: pg.Pool | undefined;
  let server: ReturnType<import("express").Express["listen"]> | undefined;

  try {
    await admin.query(`CREATE DATABASE "${database}" TEMPLATE hr_nexus_v2_settings_baseline`);
    pool = new pg.Pool({ host, user: "postgres", database });
    const db = pool;

    async function fingerprint() {
      const data: Record<string, unknown> = {};
      for (const table of ["departments", "employees", "users", "leave_requests", "attendance"]) {
        data[table] = (await db.query(
          `SELECT count(*)::integer, md5(COALESCE(jsonb_agg(to_jsonb(t) ORDER BY id)::text,'[]')) AS digest FROM public.${table} t`,
        )).rows;
      }
      data.orphans = (await db.query(
        "SELECT id, employee_id FROM public.attendance a WHERE NOT EXISTS (SELECT 1 FROM public.employees e WHERE e.id = a.employee_id) ORDER BY id",
      )).rows;
      // Scoped to the pre-existing business sequences: 0004 legitimately adds its
      // own, and those must not make this comparison look like business drift.
      data.sequences = (await db.query(
        `SELECT * FROM pg_sequences WHERE schemaname='public'
           AND sequencename NOT LIKE 'import%' ORDER BY sequencename`,
      )).rows;
      return data;
    }

    const migrations = await loadMigrations();
    const fourth = migrations.find((migration) => migration.version === "0004")!;
    assert.equal(fourth.filename, "0004_import_jobs.sql");

    const before = await fingerprint();
    const earlierLedger = (await db.query("SELECT * FROM schema_migrations WHERE version='0001'")).rows;

    await t.test("0004 applies additively and leaves business data untouched", async () => {
      assert.deepEqual(
        (await runMigrations(db, { mode: "apply", database })).newlyApplied,
        ["0002", "0003", "0004"],
      );

      // Import history is entirely new; nothing existing moved.
      assert.deepEqual(await fingerprint(), before);
      assert.deepEqual((await db.query("SELECT * FROM schema_migrations WHERE version='0001'")).rows, earlierLedger);
      assert.deepEqual(
        (await db.query("SELECT filename, checksum FROM schema_migrations WHERE version='0004'")).rows,
        [{ filename: fourth.filename, checksum: fourth.checksum }],
      );

      const tables = (await db.query(
        "SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename LIKE 'import%' ORDER BY tablename",
      )).rows.map((row) => row.tablename);
      assert.deepEqual(tables, ["import_job_rows", "import_jobs"]);

      // Import history must never be able to cascade into workforce records.
      const employeeFk = (await db.query(
        `SELECT confdeltype FROM pg_constraint
         WHERE conrelid = 'public.import_job_rows'::regclass AND contype = 'f'
           AND confrelid = 'public.employees'::regclass`,
      )).rows[0];
      assert.equal(employeeFk.confdeltype, "r");
    });

    await t.test("repeat apply is a no-op with exactly one 0004 ledger row", async () => {
      assert.deepEqual((await runMigrations(db, { mode: "apply", database })).newlyApplied, []);
      assert.equal((await db.query(
        "SELECT count(*)::integer FROM schema_migrations WHERE version='0004'",
      )).rows[0].count, 1);
    });

    await t.test("0004 refuses to adopt a pre-existing import table", async () => {
      const other = `hr_nexus_import_clash_${suffix}`;
      await admin.query(`CREATE DATABASE "${other}" TEMPLATE hr_nexus_v2_settings_baseline`);
      const clashPool = new pg.Pool({ host, user: "postgres", database: other });
      try {
        await clashPool.query("CREATE TABLE public.import_jobs (id integer)");
        await assert.rejects(
          runMigrations(clashPool, { mode: "apply", database: other }),
          /rolled back/i,
        );
        assert.equal((await clashPool.query(
          "SELECT count(*)::integer FROM schema_migrations WHERE version='0004'",
        )).rows[0].count, 0);
      } finally {
        await clashPool.end();
      }
    });

    // ------------------------------------------------ authenticated API setup

    await db.query(
      `INSERT INTO public.departments (name, description) VALUES
         ('Engineering','Lab fixture'), ('Finance','Lab fixture')
         ON CONFLICT (name) DO NOTHING;
       INSERT INTO public.employees (id, employee_number, full_name, department_id, employment_status)
       VALUES (9100, 'IMPORT-LAB-1', 'Import Lab Employee',
               (SELECT id FROM public.departments WHERE name = 'Engineering'), 'active');
       INSERT INTO public.users (id, employee_id, email, password_hash, role, is_active)
       VALUES (9100, NULL, 'import-admin@example.invalid', 'unusable-lab-hash', 'admin', TRUE),
              (9101, 9100, 'import-employee@example.invalid', 'unusable-lab-hash', 'employee', TRUE)`,
    );

    process.env.DATABASE_URL = `postgresql://postgres@${host}/${database}`;
    process.env.JWT_SECRET = randomBytes(32).toString("hex");
    const { default: app } = await import("../src/app.js");
    ({ default: appPool } = await import("../src/config/db.js"));
    server = app.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const base = `http://127.0.0.1:${address.port}/api/import`;

    const adminToken = jwt.sign({ role: "admin", employeeId: null }, process.env.JWT_SECRET, {
      subject: "9100", expiresIn: "20m",
    });

    const call = (method: string, endpoint: string, body?: unknown, token = adminToken) =>
      fetch(`${base}${endpoint}`, {
        method,
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });

    /** Reads a response body exactly once, and reports it when the status is wrong. */
    async function expectJson(response: Response, status: number, label = ""): Promise<any> {
      const text = await response.text();
      assert.equal(response.status, status, `${label} ${text}`.trim());
      return text ? JSON.parse(text) : {};
    }

    async function uploadFile(
      content: string | Buffer,
      filename: string,
      token = adminToken,
    ): Promise<Response> {
      const form = new FormData();
      form.append("file", new Blob([content as BlobPart]), filename);
      return fetch(`${base}/jobs`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: form,
      });
    }

    const header = "Staff ID,Employee Name,Work Email,Division,Position,Status,Date Joined";
    const csvOf = (...lines: string[]) => [header, ...lines].join("\n");

    /** Upload, accept the suggested mapping, and return the job id and preview. */
    async function prepare(csv: string) {
      const created = (await expectJson(await uploadFile(csv, "staff.csv"), 201, "upload")).data;
      const mapped = await call("PUT", `/jobs/${created.job.id}/mapping`, {
        mapping: created.suggested_mapping,
      });
      return {
        id: created.job.id,
        created,
        preview: (await expectJson(mapped, 200, "mapping")).data,
      };
    }

    await t.test("only administrators can reach the import workflow", async () => {
      const employeeToken = jwt.sign({ role: "employee", employeeId: 9100 }, process.env.JWT_SECRET!, {
        subject: "9101", expiresIn: "10m",
      });
      for (const [method, endpoint] of [
        ["GET", "/jobs"], ["GET", "/template"], ["GET", "/fields"],
        ["GET", "/jobs/1"], ["POST", "/jobs/1/confirm"],
      ] as const) {
        assert.equal((await call(method, endpoint, undefined, null as unknown as string)).status, 401, endpoint);
        assert.equal((await call(method, endpoint, undefined, employeeToken)).status, 403, endpoint);
      }
      assert.equal((await uploadFile("a,b\n1,2", "x.csv", null as unknown as string)).status, 401);
      assert.equal((await uploadFile("a,b\n1,2", "x.csv", employeeToken)).status, 403);
    });

    await t.test("the template downloads and lists the supported fields", async () => {
      const template = await call("GET", "/template");
      assert.equal(template.status, 200);
      assert.match(template.headers.get("content-type") ?? "", /text\/csv/);
      const body = await template.text();
      assert.match(body.split("\r\n")[0]!, /^employee_number,full_name,email,department/);
      // Passwords are not importable, so the template must not invite one.
      assert.doesNotMatch(body, /password/i);

      const fields = (await (await call("GET", "/fields")).json()).data;
      assert.ok(fields.some((f: { field: string; required: boolean }) => f.field === "email" && f.required));
      assert.ok(fields.every((f: { field: string }) => f.field !== "temporary_password"));
    });

    await t.test("unreadable and oversized uploads are refused before any job exists", async () => {
      for (const [content, name, expected] of [
        ["", "empty.csv", /empty or has no header/i],
        ["only,headers\n", "headers.csv", /no data rows/i],
        ["not a workbook", "fake.xlsx", /valid Excel workbook/i],
        ["a,b\n1,2", "notes.txt", /\.csv or \.xlsx/i],
      ] as const) {
        const response = await uploadFile(content, name);
        assert.equal(response.status, 400, name);
        assert.match((await response.json()).message, expected);
      }
      const oversized = await uploadFile(Buffer.alloc(6 * 1024 * 1024, 0x61), "big.csv");
      assert.equal(oversized.status, 400);
      assert.match((await oversized.json()).message, /larger than/i);

      assert.equal((await db.query("SELECT count(*)::integer FROM import_jobs")).rows[0].count, 0);
    });

    await t.test("headers are auto-mapped and unknown columns are reported", async () => {
      const uploaded = await uploadFile(
        "Staff ID,Employee Name,Work Email,Division,Cost Centre,Password\nE1,Aisyah,a@example.invalid,Engineering,CC1,secret123",
        "staff.csv",
      );
      assert.equal(uploaded.status, 201);
      const data = (await uploaded.json()).data;
      assert.equal(data.suggested_mapping.employee_number, 0);
      assert.equal(data.suggested_mapping.department, 3);
      assert.deepEqual(data.unmatched_headers, ["Cost Centre"]);
      // A credential column is named as deliberately ignored, not silently dropped.
      assert.deepEqual(data.ignored_password_headers, ["Password"]);
      assert.equal(data.job.status, "pending");
      assert.equal(data.sample.length, 1);

      // The credential cell is blanked before the file is stored or echoed back,
      // so a customer's spreadsheet password never lands in the import history.
      assert.deepEqual(data.sample[0], ["E1", "Aisyah", "a@example.invalid", "Engineering", "CC1", ""]);
      const stored = (await db.query(
        "SELECT source_rows::text AS rows FROM import_jobs WHERE id = $1", [data.job.id],
      )).rows[0].rows;
      assert.ok(!stored.includes("secret123"), "a spreadsheet password reached the database");
    });

    await t.test("a mapping missing a required field is refused", async () => {
      const uploaded = await uploadFile("Staff ID,Employee Name\nE1,Aisyah", "partial.csv");
      const created = (await uploaded.json()).data;
      const mapped = await call("PUT", `/jobs/${created.job.id}/mapping`, {
        mapping: created.suggested_mapping,
      });
      assert.equal(mapped.status, 400);
      const errors = (await mapped.json()).errors.join(" | ");
      assert.match(errors, /Email must be mapped/i);
      assert.match(errors, /Department must be mapped/i);
    });

    await t.test("a validated preview classifies every row without writing", async () => {
      const employeesBefore = (await db.query("SELECT count(*)::integer FROM employees")).rows[0].count;
      const { id, preview } = await prepare(csvOf(
        "E100,Aisyah Rahman,aisyah@example.invalid,Engineering,Software Engineer,Active,2024-03-01",
        "E101,Daniel Tan,daniel@example.invalid,Finance,Accountant,Probation,15/04/2023",
        "E102,Farah Ibrahim,not-an-email,Engineering,Analyst,Active,2024-01-05",
        "E103,Kumar Raj,kumar@example.invalid,Marketing,Analyst,Active,2024-01-05",
        "E104,Mei Ling Wong,import-admin@example.invalid,Engineering,Analyst,Active,2024-01-05",
      ));

      assert.deepEqual(preview.summary, {
        total: 5, new: 2, update: 0, unchanged: 0, conflict: 1, invalid: 2, warnings: 0,
      });
      // Marketing is referenced but does not exist, so it is offered for creation.
      assert.deepEqual(preview.missing_departments, ["Marketing"]);

      const job = (await (await call("GET", `/jobs/${id}`)).json()).data;
      assert.equal(job.status, "ready");
      assert.equal(job.total_rows, 5);

      const rows = (await (await call("GET", `/jobs/${id}/rows`)).json());
      assert.equal(rows.pagination.total, 5);
      assert.equal(rows.data[2].classification, "invalid");
      assert.match(rows.data[2].issues[0].message, /not a valid address/i);
      assert.equal(rows.data[4].classification, "conflict");
      assert.match(rows.data[4].issues.at(-1).message, /administrator account/i);

      const conflicts = (await (await call("GET", `/jobs/${id}/rows?classification=conflict`)).json());
      assert.equal(conflicts.pagination.total, 1);

      // Nothing has been written to the workforce by validation alone.
      assert.equal((await db.query("SELECT count(*)::integer FROM employees")).rows[0].count, employeesBefore);
    });

    await t.test("confirming imports new rows only, and returns credentials once", async () => {
      const { id } = await prepare(csvOf(
        "E200,Aisyah Rahman,aisyah200@example.invalid,Engineering,Software Engineer,Active,2024-03-01",
        "E201,Daniel Tan,daniel201@example.invalid,Finance,Accountant,Probation,2023-04-15",
        "E202,Farah Ibrahim,farah202@example.invalid,Engineering,Analyst,Resigned,2022-01-05",
      ));

      const result = (await expectJson(await call("POST", `/jobs/${id}/confirm`, {}), 200, "confirm")).data;
      assert.equal(result.created, 3);
      assert.equal(result.updated, 0);
      assert.equal(result.credentials.length, 3);
      assert.ok(result.credentials.every((c: { temporary_password: string }) => c.temporary_password.length >= 20));

      const created = (await db.query(
        `SELECT e.employee_number, e.employment_status, e.employment_date, u.email, u.is_active
         FROM employees e JOIN users u ON u.employee_id = e.id
         WHERE e.employee_number LIKE 'E20%' ORDER BY e.employee_number`,
      )).rows;
      assert.equal(created.length, 3);
      assert.equal(created[0].employment_status, "active");
      assert.equal(created[0].is_active, true);
      assert.equal(created[1].is_active, true, "probation keeps a usable sign-in");
      // A resigned import must not produce a usable account.
      assert.equal(created[2].employment_status, "resigned");
      assert.equal(created[2].is_active, false);
      assert.equal(created[0].employment_date.toISOString().slice(0, 10), "2024-03-01");

      // No plaintext credential is persisted anywhere in the import history.
      const stored = (await db.query(
        "SELECT source_rows::text || coalesce((SELECT string_agg(row_data::text,'') FROM import_job_rows WHERE job_id = $1),'') AS blob FROM import_jobs WHERE id = $1",
        [id],
      )).rows[0].blob;
      for (const credential of result.credentials) {
        assert.ok(!stored.includes(credential.temporary_password), "password leaked into history");
      }

      const job = (await (await call("GET", `/jobs/${id}`)).json()).data;
      assert.equal(job.status, "completed");
      assert.equal(job.created_count, 3);
      assert.ok(job.completed_at);

      // Re-confirming an applied job must not import a second copy.
      const again = await call("POST", `/jobs/${id}/confirm`, {});
      assert.equal(again.status, 409);
      assert.equal((await db.query(
        "SELECT count(*)::integer FROM employees WHERE employee_number LIKE 'E20%'",
      )).rows[0].count, 3);
    });

    await t.test("re-importing the same file is unchanged, and updates need opt-in", async () => {
      const changed = csvOf(
        "E200,Aisyah Rahman,aisyah200@example.invalid,Engineering,Principal Engineer,Active,2024-03-01",
        "E201,Daniel Tan,daniel201@example.invalid,Finance,Accountant,Probation,2023-04-15",
      );

      // Without opt-in the update row is previewed but deliberately not applied.
      const first = await prepare(changed);
      assert.equal(first.preview.summary.update, 1);
      assert.equal(first.preview.summary.unchanged, 1);
      const withoutOptIn = await call("POST", `/jobs/${first.id}/confirm`, {});
      assert.equal(withoutOptIn.status, 200);
      assert.equal((await withoutOptIn.json()).data.updated, 0);
      assert.equal((await db.query(
        "SELECT job_title FROM employees WHERE employee_number = 'E200'",
      )).rows[0].job_title, "Software Engineer");

      const second = await prepare(changed);
      const withOptIn = await call("POST", `/jobs/${second.id}/confirm`, { apply_updates: true });
      assert.equal(withOptIn.status, 200);
      const applied = (await withOptIn.json()).data;
      assert.equal(applied.updated, 1);
      assert.equal(applied.created, 0);
      assert.equal((await db.query(
        "SELECT job_title FROM employees WHERE employee_number = 'E200'",
      )).rows[0].job_title, "Principal Engineer");

      // A third pass now sees no differences at all.
      const third = await prepare(changed);
      assert.equal(third.preview.summary.unchanged, 2);
      assert.equal(third.preview.summary.update, 0);
    });

    await t.test("missing departments are created only when explicitly requested", async () => {
      const csv = csvOf("E300,New Starter,starter300@example.invalid,Operations,Analyst,Active,2024-06-01");

      const refused = await prepare(csv);
      assert.deepEqual(refused.preview.missing_departments, ["Operations"]);
      assert.equal(refused.preview.summary.invalid, 1);
      const withoutOptIn = await call("POST", `/jobs/${refused.id}/confirm`, {});
      assert.equal((await withoutOptIn.json()).data.created, 0);
      assert.equal((await db.query(
        "SELECT count(*)::integer FROM departments WHERE name = 'Operations'",
      )).rows[0].count, 0);

      const accepted = await prepare(csv);
      const confirmed = await call("POST", `/jobs/${accepted.id}/confirm`, {
        create_missing_departments: true,
      });
      assert.equal(confirmed.status, 200);
      const result = (await confirmed.json()).data;
      assert.deepEqual(result.created_departments, ["Operations"]);
      assert.equal(result.created, 1);
      assert.equal((await db.query(
        `SELECT d.name FROM employees e JOIN departments d ON d.id = e.department_id
         WHERE e.employee_number = 'E300'`,
      )).rows[0].name, "Operations");
    });

    await t.test("an XLSX workbook imports through the same path", async () => {
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet("Staff");
      sheet.addRow(["Staff ID", "Employee Name", "Work Email", "Division", "Date Joined"]);
      sheet.addRow(["E400", "Nurul Hakim", "nurul400@example.invalid", "Engineering", new Date(Date.UTC(2024, 4, 20))]);
      const buffer = Buffer.from(await workbook.xlsx.writeBuffer());

      const created = (await expectJson(await uploadFile(buffer, "staff.xlsx"), 201, "xlsx upload")).data;
      await call("PUT", `/jobs/${created.job.id}/mapping`, { mapping: created.suggested_mapping });
      const confirmed = await expectJson(
        await call("POST", `/jobs/${created.job.id}/confirm`, {}), 200, "xlsx confirm");
      assert.equal(confirmed.data.created, 1);

      const row = (await db.query(
        "SELECT employment_date FROM employees WHERE employee_number = 'E400'",
      )).rows[0];
      assert.equal(row.employment_date.toISOString().slice(0, 10), "2024-05-20");
    });

    await t.test("a concurrent duplicate email fails one import whole, writing nothing", async () => {
      const csv = (marker: string) => csvOf(
        `E5${marker}0,First Person,shared-race@example.invalid,Engineering,Analyst,Active,2024-06-01`,
        `E5${marker}1,Second Person,other-${marker}@example.invalid,Engineering,Analyst,Active,2024-06-01`,
      );

      const left = await prepare(csv("1"));
      const right = await prepare(csv("2"));

      const [a, b] = await Promise.all([
        call("POST", `/jobs/${left.id}/confirm`, {}),
        call("POST", `/jobs/${right.id}/confirm`, {}),
      ]);
      const statuses = [a.status, b.status].sort();
      assert.deepEqual(statuses, [200, 409], `${a.status}/${b.status}`);

      // Exactly one account holds the shared address...
      assert.equal((await db.query(
        "SELECT count(*)::integer FROM users WHERE lower(btrim(email)) = 'shared-race@example.invalid'",
      )).rows[0].count, 1);

      // ...and the losing import wrote none of its rows, not even the unique one.
      const marker = a.status === 409 ? "1" : "2";
      assert.equal((await db.query(
        "SELECT count(*)::integer FROM employees WHERE employee_number LIKE $1",
        [`E5${marker}%`],
      )).rows[0].count, 0);

      const failed = (await db.query(
        "SELECT status, error_message FROM import_jobs WHERE id = $1",
        [marker === "1" ? left.id : right.id],
      )).rows[0];
      assert.equal(failed.status, "failed");
      assert.match(failed.error_message, /changed since the preview|no records were changed/i);
    });

    await t.test("a stale preview is re-validated against live data at confirmation", async () => {
      const csv = csvOf("E600,Late Arrival,late600@example.invalid,Engineering,Analyst,Active,2024-06-01");
      const staged = await prepare(csv);
      assert.equal(staged.preview.summary.new, 1);

      // The same person is created by hand between preview and confirmation.
      await db.query(
        `WITH e AS (
           INSERT INTO employees (employee_number, full_name, department_id, employment_status)
           VALUES ('E600','Late Arrival',(SELECT id FROM departments WHERE name='Engineering'),'active')
           RETURNING id)
         INSERT INTO users (employee_id, email, password_hash, role, is_active)
         SELECT e.id, 'late600@example.invalid', 'unusable-lab-hash', 'employee', TRUE FROM e`,
      );

      const result = (await expectJson(
        await call("POST", `/jobs/${staged.id}/confirm`, {}), 200, "stale confirm")).data;
      // Re-validation reclassifies the row rather than attempting a duplicate insert.
      assert.equal(result.created, 0);
      assert.equal(result.summary.new, 0);
      assert.equal((await db.query(
        "SELECT count(*)::integer FROM employees WHERE employee_number = 'E600'",
      )).rows[0].count, 1);
    });

    await t.test("import history records every run for audit", async () => {
      const history = (await (await call("GET", "/jobs")).json());
      assert.ok(history.pagination.total >= 8);
      const statuses = new Set(history.data.map((job: { status: string }) => job.status));
      assert.ok(statuses.has("completed"));
      assert.ok(statuses.has("failed"));
      assert.ok(history.data.every((job: { initiated_by: number }) => job.initiated_by === 9100));
      assert.ok(history.data.every(
        (job: { initiated_by_email: string }) => job.initiated_by_email === "import-admin@example.invalid",
      ));
      // Newest first.
      const times = history.data.map((job: { created_at: string }) => Date.parse(job.created_at));
      assert.deepEqual(times, [...times].sort((x, y) => y - x));
    });

    await t.test("the protected orphan attendance rows are untouched by the whole suite", async () => {
      assert.deepEqual(
        (await db.query(
          "SELECT id, employee_id FROM public.attendance a WHERE NOT EXISTS (SELECT 1 FROM public.employees e WHERE e.id = a.employee_id) ORDER BY id",
        )).rows,
        before.orphans,
      );
    });
  } finally {
    if (server) await new Promise<void>((resolve) => server!.close(() => resolve()));
    if (appPool) await appPool.end();
    if (pool) await pool.end();
    await admin.end();
  }
});
