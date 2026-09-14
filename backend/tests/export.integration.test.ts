import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { once } from "node:events";
import { test } from "node:test";
import ExcelJS from "exceljs";
import jwt from "jsonwebtoken";
import pg from "pg";
import { runMigrations } from "../src/database/migrations.js";
import { parseCsv } from "../src/utils/spreadsheet.js";
import { dropLabClones } from "./labClones.js";

// Explicit opt-in; the only permitted host is the isolated, internal Docker lab.
// Every write below happens in a disposable clone, never in the source database.
test("Company Data Export: authorization, exposure, exactness and audit", {
  skip: process.env.HR_NEXUS_EXPORT_LAB !== "1", timeout: 300_000,
}, async (t) => {
  const suffix = randomBytes(5).toString("hex");
  const host = "hr-nexus-v2-migration-lab";
  const admin = new pg.Pool({ host, user: "postgres", database: "postgres" });
  const database = `hr_nexus_export_${suffix}`;
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

    await runMigrations(db, { mode: "apply", database });

    // ------------------------------------------------------- synthetic data
    // Includes a deliberately hostile name and note, and real coordinates that
    // must not come out the other side.

    await db.query(
      `INSERT INTO public.departments (name, description)
       VALUES ('Export Engineering', 'Lab'), ('Export Finance', '=HYPERLINK("http://evil","click")')
       ON CONFLICT (name) DO NOTHING;

       INSERT INTO public.employees
         (id, employee_number, full_name, department_id, employment_status, job_title,
          employment_date, phone, date_of_birth)
       VALUES
         (9600, 'EXP-1', 'Aisyah Rahman',
          (SELECT id FROM public.departments WHERE name='Export Engineering'),
          'active', 'Engineer', '2024-01-15', '+60123456789', '1995-04-02'),
         (9601, 'EXP-2', '=cmd|'' /C calc''!A0',
          (SELECT id FROM public.departments WHERE name='Export Finance'),
          'active', 'Analyst', '2025-02-01', '+60129999999', '1990-11-30');

       INSERT INTO public.users (id, employee_id, email, password_hash, role, is_active)
       VALUES (9600, NULL, 'exp-admin@example.invalid',
               '$2b$12$abcdefghijklmnopqrstuvABCDEFGHIJKLMNOPQRSTUVWXYZ012345', 'admin', TRUE),
              (9601, 9600, 'exp-one@example.invalid',
               '$2b$12$zyxwvutsrqponmlkjihgfZYXWVUTSRQPONMLKJIHGFEDCBA987654', 'employee', TRUE);

       UPDATE public.company_settings
         SET timezone='Asia/Kuala_Lumpur', working_days=ARRAY[1,2,3,4,5]::smallint[],
             office_latitude = 3.139003, office_longitude = 101.686004,
             attendance_radius_meters = 150
         WHERE id = 1;

       INSERT INTO public.attendance
         (employee_id, attendance_date, check_in_time, check_out_time, status, late_minutes,
          verification_method, verification_status, admin_note,
          check_in_latitude, check_in_longitude, check_in_accuracy_meters, check_in_distance_meters)
       VALUES
         (9600, '2026-09-01', '09:00', '18:00', 'present', 0, 'QR_LOCATION', 'verified', NULL,
          3.139001, 101.686002, 12.5, 20.0),
         (9600, '2026-09-02', '09:25', '18:00', 'late', 25, 'QR_LOCATION', 'verified',
          '=1+1 hostile note', 3.139001, 101.686002, 12.5, 20.0),
         (9601, '2026-09-01', '08:55', '17:30', 'present', 0, 'ADMIN_OVERRIDE', 'manual', NULL,
          NULL, NULL, NULL, NULL);

       INSERT INTO public.leave_requests
         (employee_id, leave_type, start_date, end_date, reason, status, working_days, leave_year)
       VALUES
         (9600, 'annual', '2026-09-10', '2026-09-11', 'Trip', 'approved', 2, 2026),
         (9601, 'medical', '2026-09-15', '2026-09-15', '=SUM(A1)', 'pending', 1, 2026);

       INSERT INTO public.leave_entitlements
         (employee_id, leave_year, leave_type, entitled_days, carried_forward_days,
          adjustment_days, source)
       VALUES (9600, 2026, 'annual', 12, 0, 0, 'policy'),
              (9601, 2026, 'annual', 12, 0, 0, 'policy');

       INSERT INTO public.employee_compensation
         (employee_id, basic_salary_sen, allowance_sen, overtime_rate_sen, effective_from)
       VALUES (9600, 1234567, 25000, 2050, '2026-01-01'),
              (9601, 450000, 50000, 3000, '2026-01-01');

       INSERT INTO public.import_jobs
         (file_name, import_type, initiated_by, status, source_headers, source_rows,
          column_mapping, total_rows, completed_at)
       VALUES ('staff.xlsx', 'employees', 9600, 'completed',
               '["employee_number","temporary_password"]'::jsonb,
               '[{"employee_number":"EXP-9","temporary_password":"PlaintextLeak!42"}]'::jsonb,
               '{"employee_number":"employee_number"}'::jsonb, 1, CURRENT_TIMESTAMP);`,
    );

    process.env.DATABASE_URL = `postgresql://postgres@${host}/${database}`;
    process.env.JWT_SECRET = randomBytes(32).toString("hex");
    const { default: app } = await import("../src/app.js");
    ({ default: appPool } = await import("../src/config/db.js"));
    // Imported here, not at the top of the file: exportService pulls in the
    // connection pool at module load, and a static import would build that pool
    // against the container's DATABASE_URL before the line above points it at
    // this clone.
    const { datasets } = await import("../src/services/exportService.js");
    server = app.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const origin = `http://127.0.0.1:${address.port}/api`;

    const adminToken = jwt.sign({ role: "admin", employeeId: null }, process.env.JWT_SECRET, {
      subject: "9600", expiresIn: "60m",
    });
    const employeeToken = jwt.sign({ role: "employee", employeeId: 9600 }, process.env.JWT_SECRET, {
      subject: "9601", expiresIn: "60m",
    });

    const call = async (endpoint: string, token: string | null = adminToken) =>
      fetch(`${origin}${endpoint}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });

    // A payroll period built through the real service, so exported money is
    // money the application itself produced.
    const period = await (await fetch(`${origin}/payroll/periods`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ year: 2026, month: 9 }),
    })).json();
    const periodId = period.data.period.id;
    await fetch(`${origin}/payroll/periods/${periodId}/calculate`, {
      method: "POST", headers: { Authorization: `Bearer ${adminToken}` },
    });

    const csvOf = async (key: string) => parseCsv(await (await call(`/export/datasets/${key}/csv`)).text());
    const workbookOf = async () => {
      const buffer = Buffer.from(await (await call("/export/workbook")).arrayBuffer());
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
      return { workbook, buffer };
    };

    // ------------------------------------------------------- authorization

    await t.test("every export route is administrator-only", async () => {
      const endpoints = [
        "/export/datasets", "/export/workbook",
        ...datasets.map((dataset) => `/export/datasets/${dataset.key}/csv`),
      ];

      for (const endpoint of endpoints) {
        assert.equal((await call(endpoint, null)).status, 401, `${endpoint} must reject anonymous`);
        assert.equal((await call(endpoint, employeeToken)).status, 403, `${endpoint} must reject an employee`);
      }
    });

    await t.test("a refusal leaks nothing about the data it protects", async () => {
      for (const endpoint of ["/export/workbook", "/export/datasets/payroll-records/csv"]) {
        const refused = await call(endpoint, employeeToken);
        const body = await refused.text();
        assert.equal(refused.status, 403);
        assert.doesNotMatch(body, /EXP-|Aisyah|1234567|12345\.67|exp-admin/);
      }
    });

    await t.test("only declared datasets can be named", async () => {
      // The key indexes a fixed map, so there is no table name to smuggle in.
      // A traversal attempt is normalised away by the router before it arrives,
      // which is why this asserts "not data" rather than a particular status.
      const traversal = await call("/export/datasets/../../etc/passwd/csv");
      assert.notEqual(traversal.status, 200);

      // `users` is a real table and deliberately not an exportable dataset:
      // account rows go out through `user-accounts`, without the hash.
      assert.equal((await call("/export/datasets/users/csv")).status, 404);
      assert.equal((await call("/export/datasets/audit_events/csv")).status, 404);
      assert.equal((await call("/export/datasets/nonsense/csv")).status, 404);
    });

    // ----------------------------------------------------------- exposure

    await t.test("no credential material is in any export", async () => {
      const { buffer } = await workbookOf();
      // The workbook is a zip; the strings live compressed, so it is read back
      // through ExcelJS rather than scanned as bytes.
      const { workbook } = await workbookOf();
      let text = "";
      workbook.eachSheet((sheet) => {
        sheet.eachRow((row) => { text += row.values?.toString() ?? ""; });
      });

      for (const secret of [
        "$2b$12$", "password_hash", "PlaintextLeak!42", "token_hash", "temporary_password",
      ]) {
        assert.equal(text.includes(secret), false, `the workbook must not contain "${secret}"`);
      }
      assert.ok(buffer.length > 0);

      for (const dataset of datasets) {
        const csv = await (await call(`/export/datasets/${dataset.key}/csv`)).text();
        for (const secret of ["$2b$12$", "password_hash", "PlaintextLeak!42", "token_hash"]) {
          assert.equal(csv.includes(secret), false, `${dataset.key} must not contain "${secret}"`);
        }
      }
    });

    await t.test("no coordinate, accuracy or distance is in any export", async () => {
      for (const dataset of datasets) {
        const csv = await (await call(`/export/datasets/${dataset.key}/csv`)).text();
        // Coordinates and the column words are unique enough to find anywhere.
        for (const value of ["3.139001", "101.686002", "3.139003", "101.686004", "latitude", "longitude", "accuracy", "distance"]) {
          assert.equal(
            csv.toLowerCase().includes(value.toLowerCase()), false,
            `${dataset.key} must not contain "${value}"`,
          );
        }
        // The accuracy (12.5) and distance (20.0) are short numbers that also
        // occur inside ordinary values - a timestamp with 20.0 in its seconds
        // failed this once - so they are checked as whole cells.
        const cells = (await csvOf(dataset.key)).flat();
        for (const value of ["12.5", "12.50", "20.0", "20.00"]) {
          assert.equal(cells.includes(value), false, `${dataset.key} must not contain a "${value}" cell`);
        }
      }
      // The radius is a rule, not a place, and is deliberately kept.
      const settings = await csvOf("company-settings");
      assert.ok(settings.some((row) => row[0] === "Attendance radius (metres)" && row[1] === "150"));
    });

    await t.test("uploaded file contents are not exported, only the job's outcome", async () => {
      const rows = await csvOf("import-history");
      const header = rows[0]!.join("|");
      assert.match(header, /File name/);
      assert.doesNotMatch(header, /Source rows|Source headers|Column mapping/i);
      assert.ok(rows.some((row) => row.includes("staff.xlsx")));
      assert.equal(rows.flat().some((cell) => cell.includes("PlaintextLeak")), false);
    });

    // ----------------------------------------------- injection and exactness

    await t.test("a hostile name is neutralised in CSV and in XLSX", async () => {
      const rows = await csvOf("employees");
      const nameColumn = rows[0]!.indexOf("Full name");
      const hostile = rows.find((row) => row[nameColumn]?.includes("cmd|"));
      assert.ok(hostile, "the hostile employee must be exported, not dropped");

      // Neutralised, and not quoted: the field holds no comma, quote or newline,
      // so quoting it would be noise. Quoting is not what makes it safe.
      assert.equal(hostile[nameColumn], "'=cmd|' /C calc'!A0");

      const csv = await (await call("/export/datasets/employees/csv")).text();
      assert.equal(csv.includes(",=cmd"), false, "no field may begin with a bare =");
      // A phone number starting with "+" is neutralised for the same reason.
      assert.match(csv, /'\+60123456789/);

      const { workbook } = await workbookOf();
      const sheet = workbook.getWorksheet("Employees")!;
      let found = false;
      sheet.eachRow((row) => {
        const value = row.getCell(3).value;
        if (typeof value === "string" && value.includes("cmd|")) {
          found = true;
          assert.equal(value.startsWith("'="), true, "the cell must be neutralised");
          assert.equal(row.getCell(3).formula, undefined);
        }
      });
      assert.ok(found, "the hostile employee name must be present, neutralised");
    });

    await t.test("payroll money is exact and matches the stored sen", async () => {
      const stored = (await db.query<{ id: string; gross: string; deductions: string; net: string }>(
        `SELECT id::text, gross_sen::text AS gross, deductions_sen::text AS deductions,
                net_sen::text AS net
         FROM public.payroll_records ORDER BY id`,
      )).rows;
      assert.ok(stored.length > 0);

      const rows = await csvOf("payroll-records");
      const header = rows[0]!;
      const idColumn = header.indexOf("Record ID");
      const grossColumn = header.indexOf("Gross (MYR)");
      const netColumn = header.indexOf("Net (MYR)");

      const exact = (sen: string) => {
        const value = BigInt(sen);
        const negative = value < 0n;
        const absolute = negative ? -value : value;
        return `${negative ? "-" : ""}${absolute / 100n}.${String(absolute % 100n).padStart(2, "0")}`;
      };

      for (const record of stored) {
        const row = rows.find((candidate) => candidate[idColumn] === record.id);
        assert.ok(row, `record ${record.id} must be exported`);
        assert.equal(row[grossColumn], exact(record.gross));
        assert.equal(row[netColumn], exact(record.net));
      }

      // 1234567 sen is the case a float would ruin.
      const compensation = await csvOf("compensation");
      assert.ok(compensation.some((row) => row.includes("12345.67")));
      assert.equal(compensation.flat().includes("12345.669999999999"), false);
    });

    await t.test("the workbook carries the same money as the CSV", async () => {
      const { workbook } = await workbookOf();
      const sheet = workbook.getWorksheet("Payroll records")!;
      const headers = (sheet.getRow(1).values as unknown[]).map((value) => String(value ?? ""));
      const netColumn = headers.indexOf("Net (MYR)");
      assert.ok(netColumn > 0);

      const csv = await csvOf("payroll-records");
      const csvNet = csv[1]![csv[0]!.indexOf("Net (MYR)")];
      assert.equal(sheet.getRow(2).getCell(netColumn).value, csvNet);
      assert.equal(typeof sheet.getRow(2).getCell(netColumn).value, "string");
    });

    // -------------------------------------------------------- structure

    await t.test("the workbook has one visible sheet per dataset, in order", async () => {
      const { workbook } = await workbookOf();
      assert.equal(workbook.worksheets.length, datasets.length);

      workbook.worksheets.forEach((sheet, index) => {
        assert.equal(sheet.state, "visible", `${sheet.name} must be visible`);
        assert.equal(sheet.name, datasets[index]!.label.slice(0, 31));

        const headers = (sheet.getRow(1).values as unknown[])
          .slice(1).map((value) => String(value ?? ""));
        assert.deepEqual(headers, [...datasets[index]!.headers],
          `${sheet.name} column order must be the declared one`);
      });
    });

    await t.test("every CSV header matches its declared column order", async () => {
      for (const dataset of datasets) {
        const rows = await csvOf(dataset.key);
        assert.deepEqual(rows[0], [...dataset.headers], `${dataset.key} header mismatch`);
      }
    });

    await t.test("the dataset listing describes what can be exported", async () => {
      const body = await (await call("/export/datasets")).json();
      assert.equal(body.data.datasets.length, datasets.length);
      assert.equal(body.data.maxRowsPerDataset, 10_000);
      for (const entry of body.data.datasets) {
        assert.equal(typeof entry.label, "string");
        assert.equal(typeof entry.description, "string");
      }
    });

    await t.test("an empty dataset exports a header and nothing else", async () => {
      await db.query("DELETE FROM public.payroll_items");
      const rows = await csvOf("payroll-items");
      assert.equal(rows.length, 1);
      assert.deepEqual(rows[0], [...datasets.find((d) => d.key === "payroll-items")!.headers]);

      const { workbook } = await workbookOf();
      const sheet = workbook.getWorksheet("Payroll line items")!;
      assert.equal(sheet.getRow(2).getCell(1).value, "No records.");
    });

    // ------------------------------------------------------------- audit

    // The audit log refuses DELETE by design, so these tests take a high-water
    // mark and read forward from it rather than clearing the table.
    const auditMark = async (): Promise<string> => (await db.query<{ mark: string }>(
      "SELECT COALESCE(MAX(id), 0)::text AS mark FROM public.audit_events",
    )).rows[0]!.mark;

    const auditSince = async (mark: string) => (await db.query(
      `SELECT action, entity_type, entity_id, summary, changes
       FROM public.audit_events WHERE id > $1 ORDER BY id`, [mark],
    )).rows;

    await t.test("an export is recorded, without recording what was exported", async () => {
      const mark = await auditMark();
      await call("/export/datasets/payroll-records/csv");

      const events = await auditSince(mark);
      assert.equal(events.length, 1);
      assert.equal(events[0].action, "DATA_EXPORTED");
      assert.equal(events[0].entity_type, "export");
      assert.equal(events[0].entity_id, "csv");
      assert.match(events[0].summary, /Exported 1 dataset as CSV/);

      // Counts and names only: no salary, no name, no row content.
      const changes = JSON.stringify(events[0].changes);
      assert.match(changes, /payroll-records/);
      assert.doesNotMatch(changes, /EXP-|Aisyah|12345\.67|1234567/);
    });

    await t.test("a workbook export is recorded once, naming every dataset", async () => {
      const mark = await auditMark();
      await call("/export/workbook");

      const events = await auditSince(mark);
      assert.equal(events.length, 1);
      assert.equal(events[0].entity_id, "xlsx");
      assert.match(events[0].summary, new RegExp(`Exported ${datasets.length} datasets as XLSX`));
    });

    await t.test("a refused export records nothing", async () => {
      const mark = await auditMark();
      await call("/export/workbook", employeeToken);
      await call("/export/datasets/employees/csv", null);

      assert.deepEqual(await auditSince(mark), []);
    });

    await t.test("exporting writes nothing except the audit entry", async () => {
      const fingerprint = async () => (await db.query<{ state: string }>(
        `SELECT string_agg(source, '|' ORDER BY source) AS state FROM (
           SELECT 'employees:' || count(*)::text AS source FROM public.employees
           UNION ALL SELECT 'attendance:' || count(*)::text FROM public.attendance
           UNION ALL SELECT 'leave:' || count(*)::text FROM public.leave_requests
           UNION ALL SELECT 'periods:' || count(*)::text FROM public.payroll_periods
           UNION ALL SELECT 'records:' || count(*)::text FROM public.payroll_records
           UNION ALL SELECT 'compensation:' || count(*)::text FROM public.employee_compensation
           UNION ALL SELECT 'settings:' || max(revision)::text FROM public.company_settings
           UNION ALL SELECT 'users:' || count(*)::text FROM public.users
         ) s`,
      )).rows[0]!.state;

      const before = await fingerprint();
      await call("/export/workbook");
      for (const dataset of datasets) await call(`/export/datasets/${dataset.key}/csv`);
      assert.equal(await fingerprint(), before);
    });

    await t.test("the audit log itself is only ever read", async () => {
      const before = (await db.query(
        "SELECT COUNT(*)::int AS count FROM public.audit_events",
      )).rows[0].count;
      await call("/export/datasets/audit-events/csv");
      const after = (await db.query(
        "SELECT COUNT(*)::int AS count FROM public.audit_events",
      )).rows[0].count;
      // Exactly one new row: the entry recording this very export.
      assert.equal(after, before + 1);

      // And the database still refuses to change history.
      await assert.rejects(
        () => db.query("UPDATE public.audit_events SET summary = 'tampered'"),
        /append-only/,
      );
    });

    // ------------------------------------------------------- repeatability

    await t.test("exporting twice over unchanged data gives an identical file", async () => {
      const first = await (await call("/export/datasets/employees/csv")).text();
      const second = await (await call("/export/datasets/employees/csv")).text();
      assert.equal(first, second);
      assert.ok(first.length > 0);
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
