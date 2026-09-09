import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { once } from "node:events";
import { test } from "node:test";
import jwt from "jsonwebtoken";
import pg from "pg";
import { loadMigrations, runMigrations } from "../src/database/migrations.js";

// Explicit opt-in; the only permitted host is the isolated, internal Docker lab.
// Every write below happens in a disposable clone, never in the source database.
test("Payroll V1: migration 0007 and the authenticated payroll workflow", {
  skip: process.env.HR_NEXUS_PAYROLL_LAB !== "1", timeout: 240_000,
}, async (t) => {
  const suffix = randomBytes(5).toString("hex");
  const host = "hr-nexus-v2-migration-lab";
  const admin = new pg.Pool({ host, user: "postgres", database: "postgres" });
  const database = `hr_nexus_payroll_${suffix}`;
  let pool: pg.Pool | undefined;
  let appPool: pg.Pool | undefined;
  let server: ReturnType<import("express").Express["listen"]> | undefined;

  try {
    await admin.query(`CREATE DATABASE "${database}" TEMPLATE hr_nexus_v2_settings_baseline`);
    pool = new pg.Pool({ host, user: "postgres", database });
    const db = pool;

    const orphansBefore = (await db.query(
      `SELECT id, employee_id FROM public.attendance a
       WHERE NOT EXISTS (SELECT 1 FROM public.employees e WHERE e.id = a.employee_id) ORDER BY id`,
    )).rows;

    const migrations = await loadMigrations();
    const seventh = migrations.find((migration) => migration.version === "0007")!;
    assert.equal(seventh.filename, "0007_payroll.sql");

    await t.test("0007 applies additively and leaves existing data untouched", async () => {
      assert.deepEqual(
        (await runMigrations(db, { mode: "apply", database })).newlyApplied.slice(-1),
        ["0007"],
      );
      assert.deepEqual(
        (await db.query(
          `SELECT id, employee_id FROM public.attendance a
           WHERE NOT EXISTS (SELECT 1 FROM public.employees e WHERE e.id = a.employee_id) ORDER BY id`,
        )).rows,
        orphansBefore,
      );

      const tables = (await db.query(
        `SELECT tablename FROM pg_tables WHERE schemaname='public'
           AND (tablename LIKE 'payroll%' OR tablename = 'employee_compensation') ORDER BY tablename`,
      )).rows.map((row) => row.tablename);
      assert.deepEqual(tables, ["employee_compensation", "payroll_items", "payroll_periods", "payroll_records"]);

      // Every money column is an integer type; none is floating point.
      const floats = (await db.query(
        `SELECT table_name, column_name, data_type FROM information_schema.columns
         WHERE table_schema='public'
           AND (table_name LIKE 'payroll%' OR table_name='employee_compensation')
           AND data_type IN ('double precision', 'real')`,
      )).rows;
      assert.deepEqual(floats, [], "payroll must contain no floating point column");
    });

    await t.test("repeat apply is a no-op with exactly one 0007 ledger row", async () => {
      assert.deepEqual((await runMigrations(db, { mode: "apply", database })).newlyApplied, []);
      assert.equal((await db.query(
        "SELECT count(*)::integer FROM schema_migrations WHERE version='0007'",
      )).rows[0].count, 1);
    });

    // ---------------------------------------------------- authenticated setup

    await db.query(
      `INSERT INTO public.departments (name, description) VALUES ('Engineering','Lab')
         ON CONFLICT (name) DO NOTHING;
       INSERT INTO public.employees (id, employee_number, full_name, department_id, employment_status, job_title)
       VALUES (9800, 'PR-1', 'Aisyah Rahman',
               (SELECT id FROM public.departments WHERE name='Engineering'), 'active', 'Engineer'),
              (9801, 'PR-2', 'Daniel Tan',
               (SELECT id FROM public.departments WHERE name='Engineering'), 'active', 'Analyst'),
              (9802, 'PR-3', 'No Salary Yet',
               (SELECT id FROM public.departments WHERE name='Engineering'), 'active', 'Intern');
       INSERT INTO public.users (id, employee_id, email, password_hash, role, is_active)
       VALUES (9800, NULL, 'pay-admin@example.invalid', 'unusable-lab-hash', 'admin', TRUE),
              (9801, 9800, 'pay-one@example.invalid', 'unusable-lab-hash', 'employee', TRUE),
              (9802, 9801, 'pay-two@example.invalid', 'unusable-lab-hash', 'employee', TRUE);
       UPDATE public.company_settings
         SET timezone='Asia/Kuala_Lumpur', working_days=ARRAY[1,2,3,4,5]::smallint[] WHERE id=1;`,
    );

    process.env.DATABASE_URL = `postgresql://postgres@${host}/${database}`;
    process.env.JWT_SECRET = randomBytes(32).toString("hex");
    const { default: app } = await import("../src/app.js");
    ({ default: appPool } = await import("../src/config/db.js"));
    server = app.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const base = `http://127.0.0.1:${address.port}/api/payroll`;

    const adminToken = jwt.sign({ role: "admin", employeeId: null }, process.env.JWT_SECRET, {
      subject: "9800", expiresIn: "40m",
    });
    const employeeToken = jwt.sign({ role: "employee", employeeId: 9800 }, process.env.JWT_SECRET, {
      subject: "9801", expiresIn: "40m",
    });
    const otherToken = jwt.sign({ role: "employee", employeeId: 9801 }, process.env.JWT_SECRET, {
      subject: "9802", expiresIn: "40m",
    });

    const call = async (method: string, endpoint: string, body?: unknown, token: string | null = adminToken) => {
      const response = await fetch(`${base}${endpoint}`, {
        method,
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      const text = await response.text();
      return { status: response.status, body: text ? JSON.parse(text) : {} };
    };

    // September 2026 has 22 Monday-to-Friday working days.
    const YEAR = 2026;
    const MONTH = 9;
    let periodId = "";

    await t.test("compensation is append-only history, and the API refuses unsafe money", async () => {
      const created = await call("POST", "/compensation/9800", {
        basicSalary: "3000.00", allowance: "250.00", overtimeRate: "20.50",
        effectiveFrom: "2026-01-01", note: "Initial",
      });
      assert.equal(created.status, 201, JSON.stringify(created.body));

      // A raise closes the previous row rather than editing it.
      assert.equal((await call("POST", "/compensation/9800", {
        basicSalary: "3600.00", allowance: "250.00", overtimeRate: "20.50",
        effectiveFrom: "2026-10-01", note: "Raise",
      })).status, 201);

      const history = (await call("GET", "/compensation/9800")).body.data.compensation;
      assert.equal(history.length, 2);
      const earlier = history.find((row: { effective_from: string }) => row.effective_from === "2026-01-01");
      assert.equal(earlier.basic_salary_sen, "300000");
      assert.equal(earlier.effective_to, "2026-09-30", "the earlier row is closed, not overwritten");

      await call("POST", "/compensation/9801", {
        basicSalary: "2200.00", allowance: "0", overtimeRate: "0", effectiveFrom: "2026-01-01",
      });

      for (const bad of [
        { basicSalary: "3000.555", effectiveFrom: "2026-01-01" },
        { basicSalary: "-3000", effectiveFrom: "2026-01-01" },
        { basicSalary: "3000", effectiveFrom: "not-a-date" },
        { basicSalary: 3000.5, effectiveFrom: "2026-01-01" },
        { basicSalary: "3000", effectiveFrom: "2026-01-01", employeeId: 9 },
      ]) {
        assert.equal((await call("POST", "/compensation/9800", bad)).status, 400, JSON.stringify(bad));
      }
    });

    await t.test("a period snapshots the working week and refuses a duplicate month", async () => {
      const created = await call("POST", "/periods", { year: YEAR, month: MONTH });
      assert.equal(created.status, 201, JSON.stringify(created.body));
      periodId = created.body.data.period.id;
      assert.equal(created.body.data.period.working_days, 22);
      assert.equal(created.body.data.period.status, "draft");
      assert.deepEqual(created.body.data.period.working_days_pattern, [1, 2, 3, 4, 5]);

      const duplicate = await call("POST", "/periods", { year: YEAR, month: MONTH });
      assert.equal(duplicate.status, 409);
      assert.equal(duplicate.body.code, "period_exists");
    });

    await t.test("calculation uses the salary effective at period end and reports who was skipped", async () => {
      const calculated = await call("POST", `/periods/${periodId}/calculate`, {});
      assert.equal(calculated.status, 200, JSON.stringify(calculated.body));
      const summary = calculated.body.data.summary;

      assert.equal(summary.calculated, 2);
      // An employee with no compensation is named, not silently omitted. The
      // baseline database carries its own employee, who is skipped for the same
      // reason, so the check is on membership rather than an exact count.
      const skippedNumbers = summary.skipped.map((entry: { employeeNumber: string }) => entry.employeeNumber);
      assert.ok(skippedNumbers.includes("PR-3"), skippedNumbers.join(","));
      assert.ok(summary.skipped.every(
        (entry: { reason: string }) => /No compensation/.test(entry.reason),
      ));

      const record = (await db.query(
        "SELECT * FROM payroll_records WHERE period_id = $1 AND employee_id = 9800", [periodId],
      )).rows[0];
      // The September row is the one effective on 30 September, not the October raise.
      assert.equal(record.basic_salary_sen, "300000");
      assert.equal(record.allowance_sen, "25000");
      assert.equal(record.gross_sen, "325000");
      assert.equal(record.deductions_sen, "0");
      assert.equal(record.net_sen, "325000");
      // Identity is snapshotted onto the record.
      assert.equal(record.employee_number, "PR-1");
      assert.equal(record.department_name, "Engineering");

      const period = (await db.query("SELECT status FROM payroll_periods WHERE id=$1", [periodId])).rows[0];
      assert.equal(period.status, "calculated");
    });

    await t.test("recalculating is idempotent and never duplicates a record", async () => {
      const before = (await db.query(
        "SELECT count(*)::int AS count FROM payroll_records WHERE period_id=$1", [periodId],
      )).rows[0].count;

      await call("POST", `/periods/${periodId}/calculate`, {});
      await call("POST", `/periods/${periodId}/calculate`, {});

      const after = (await db.query(
        "SELECT count(*)::int AS count, COALESCE(SUM(net_sen),0)::bigint AS net FROM payroll_records WHERE period_id=$1",
        [periodId],
      )).rows[0];
      assert.equal(after.count, before);
      assert.equal(after.net, "545000");

      // Derived lines are regenerated, not appended.
      const lines = (await db.query(
        `SELECT count(*)::int AS count FROM payroll_items i
         JOIN payroll_records r ON r.id = i.record_id
         WHERE r.period_id = $1 AND r.employee_id = 9800`, [periodId],
      )).rows[0].count;
      assert.equal(lines, 2, "basic and allowance only");
    });

    await t.test("two simultaneous calculations cannot both write", async () => {
      const [first, second] = await Promise.all([
        call("POST", `/periods/${periodId}/calculate`, {}),
        call("POST", `/periods/${periodId}/calculate`, {}),
      ]);
      assert.deepEqual([first.status, second.status], [200, 200]);
      // The unique constraint makes a duplicate impossible regardless of timing.
      assert.equal((await db.query(
        "SELECT count(*)::int AS count FROM payroll_records WHERE period_id=$1 AND employee_id=9800",
        [periodId],
      )).rows[0].count, 1);
    });

    await t.test("approved unpaid leave deducts a rounded daily rate", async () => {
      // Two unpaid working days inside September.
      await db.query(
        `INSERT INTO leave_requests (employee_id, leave_type, start_date, end_date, reason,
                                     status, working_days, leave_year)
         VALUES (9800, 'unpaid', '2026-09-07', '2026-09-08', 'Lab', 'approved', 2, 2026)`,
      );
      await call("POST", `/periods/${periodId}/calculate`, {});

      const record = (await db.query(
        "SELECT * FROM payroll_records WHERE period_id=$1 AND employee_id=9800", [periodId],
      )).rows[0];
      assert.equal(record.unpaid_leave_days, "2.0");
      // 300000 * 2 / 22 = 27272.72... -> 27273 half-up, rounded once.
      assert.equal(record.deductions_sen, "27273");
      assert.equal(record.net_sen, String(325000 - 27273));

      const line = (await db.query(
        `SELECT amount_sen FROM payroll_items i JOIN payroll_records r ON r.id=i.record_id
         WHERE r.period_id=$1 AND r.employee_id=9800 AND i.code='unpaid_leave'`, [periodId],
      )).rows[0];
      assert.equal(line.amount_sen, "27273");
    });

    await t.test("only the unpaid days inside the period are deducted", async () => {
      // A request straddling the month boundary must not be charged in full.
      await db.query("DELETE FROM leave_requests WHERE employee_id = 9800");
      await db.query(
        `INSERT INTO leave_requests (employee_id, leave_type, start_date, end_date, reason,
                                     status, working_days, leave_year)
         VALUES (9800, 'unpaid', '2026-09-28', '2026-10-02', 'Straddles', 'approved', 5, 2026)`,
      );
      await call("POST", `/periods/${periodId}/calculate`, {});

      const record = (await db.query(
        "SELECT unpaid_leave_days FROM payroll_records WHERE period_id=$1 AND employee_id=9800", [periodId],
      )).rows[0];
      // 28, 29, 30 September are working days; 1 and 2 October belong to next month.
      assert.equal(record.unpaid_leave_days, "3.0");

      // Pending and rejected unpaid leave must never reach payroll.
      await db.query("DELETE FROM leave_requests WHERE employee_id = 9800");
      await db.query(
        `INSERT INTO leave_requests (employee_id, leave_type, start_date, end_date, reason,
                                     status, working_days, leave_year)
         VALUES (9800, 'unpaid', '2026-09-14', '2026-09-15', 'Pending', 'pending', 2, 2026),
                (9800, 'unpaid', '2026-09-16', '2026-09-17', 'Rejected', 'rejected', 2, 2026),
                (9800, 'annual', '2026-09-21', '2026-09-22', 'Paid leave', 'approved', 2, 2026)`,
      );
      await call("POST", `/periods/${periodId}/calculate`, {});
      assert.equal((await db.query(
        "SELECT unpaid_leave_days FROM payroll_records WHERE period_id=$1 AND employee_id=9800", [periodId],
      )).rows[0].unpaid_leave_days, "0.0");
      await db.query("DELETE FROM leave_requests WHERE employee_id = 9800");
      await call("POST", `/periods/${periodId}/calculate`, {});
    });

    await t.test("overtime and manual lines survive recalculation and reach the totals", async () => {
      const recordId = (await db.query(
        "SELECT id FROM payroll_records WHERE period_id=$1 AND employee_id=9800", [periodId],
      )).rows[0].id;

      assert.equal((await call("PUT", `/records/${recordId}/overtime`, { hours: "7.25" })).status, 200);
      assert.equal((await call("POST", `/records/${recordId}/items`, {
        itemType: "earning", label: "Performance bonus", amount: "500.00",
      })).status, 201);
      assert.equal((await call("POST", `/records/${recordId}/items`, {
        itemType: "deduction", label: "EPF (entered manually)", amount: "330.00", isStatutory: true,
      })).status, 201);

      await call("POST", `/periods/${periodId}/calculate`, {});
      const record = (await db.query("SELECT * FROM payroll_records WHERE id=$1", [recordId])).rows[0];

      // Overtime 20.50 x 7.25 = 148.625 -> 148.63.
      // Gross = 3000 + 250 + 148.63 + 500 bonus = 3898.63.
      assert.equal(record.overtime_hours, "7.25");
      assert.equal(record.gross_sen, "389863");
      assert.equal(record.deductions_sen, "33000");
      assert.equal(record.net_sen, String(389863 - 33000));

      // Manual lines are inputs: recalculation keeps exactly one of each.
      const manual = (await db.query(
        "SELECT count(*)::int AS count FROM payroll_items WHERE record_id=$1 AND is_manual=TRUE", [recordId],
      )).rows[0].count;
      assert.equal(manual, 2, "manual lines must not be duplicated or lost");

      // A statutory line is always manual; nothing computes one.
      const statutory = (await db.query(
        "SELECT is_manual FROM payroll_items WHERE record_id=$1 AND is_statutory=TRUE", [recordId],
      )).rows[0];
      assert.equal(statutory.is_manual, true);

      // A derived line cannot be deleted through the manual-item route.
      const derived = (await db.query(
        "SELECT id FROM payroll_items WHERE record_id=$1 AND code='basic'", [recordId],
      )).rows[0];
      assert.equal((await call("DELETE", `/records/${recordId}/items/${derived.id}`)).status, 404);
    });

    await t.test("the state machine refuses every unsafe transition", async () => {
      // Forward only, one step at a time.
      assert.equal((await call("PUT", `/periods/${periodId}/status`, { status: "approved" })).status, 409);
      assert.equal((await call("PUT", `/periods/${periodId}/status`, { status: "paid" })).status, 409);
      assert.equal((await call("PUT", `/periods/${periodId}/status`, { status: "nonsense" })).status, 400);

      assert.equal((await call("PUT", `/periods/${periodId}/status`, { status: "reviewed" })).status, 200);
      // A reviewed period can be reopened for correction.
      assert.equal((await call("PUT", `/periods/${periodId}/status`, { status: "calculated" })).status, 200);
      assert.equal((await call("PUT", `/periods/${periodId}/status`, { status: "reviewed" })).status, 200);
      assert.equal((await call("PUT", `/periods/${periodId}/status`, { status: "approved" })).status, 200);

      // Nothing moves back out of approval.
      for (const status of ["draft", "calculated", "reviewed"]) {
        const refused = await call("PUT", `/periods/${periodId}/status`, { status });
        assert.equal(refused.status, 409, status);
        assert.equal(refused.body.code, "invalid_transition");
      }
    });

    await t.test("approved payroll is immutable, enforced by the database itself", async () => {
      const recordId = (await db.query(
        "SELECT id FROM payroll_records WHERE period_id=$1 AND employee_id=9800", [periodId],
      )).rows[0].id;

      // Through the API.
      assert.equal((await call("POST", `/periods/${periodId}/calculate`, {})).status, 409);
      assert.equal((await call("PUT", `/records/${recordId}/overtime`, { hours: "1" })).status, 409);
      assert.equal((await call("POST", `/records/${recordId}/items`, {
        itemType: "deduction", label: "Late", amount: "10.00",
      })).status, 409);

      // And directly against the database, which is the point of the trigger.
      for (const sql of [
        `UPDATE payroll_records SET net_sen = 1 WHERE id = ${recordId}`,
        `DELETE FROM payroll_records WHERE id = ${recordId}`,
        `UPDATE payroll_items SET amount_sen = 1 WHERE record_id = ${recordId}`,
        `DELETE FROM payroll_items WHERE record_id = ${recordId}`,
        `INSERT INTO payroll_items (record_id, item_type, code, label, amount_sen)
         VALUES (${recordId}, 'deduction', 'manual', 'Sneaky', 100)`,
      ]) {
        await assert.rejects(db.query(sql), { code: "23514" }, sql);
      }
    });

    await t.test("a later salary change does not rewrite an approved payslip", async () => {
      const before = (await db.query(
        "SELECT basic_salary_sen, gross_sen, net_sen FROM payroll_records WHERE period_id=$1 AND employee_id=9800",
        [periodId],
      )).rows[0];

      assert.equal((await call("POST", "/compensation/9800", {
        basicSalary: "9999.00", allowance: "999.00", overtimeRate: "99.00",
        effectiveFrom: "2026-09-01", note: "Backdated change",
      })).status, 201);

      const after = (await db.query(
        "SELECT basic_salary_sen, gross_sen, net_sen FROM payroll_records WHERE period_id=$1 AND employee_id=9800",
        [periodId],
      )).rows[0];
      assert.deepEqual(after, before, "an approved payslip must be unaffected by a later salary change");
    });

    await t.test("payslips are visible only to their owner, and only once approved", async () => {
      const mine = await call("GET", "/me/payslips", undefined, employeeToken);
      assert.equal(mine.status, 200);
      assert.equal(mine.body.data.payslips.length, 1);
      const payslipId = mine.body.data.payslips[0].id;

      const detail = await call("GET", `/me/payslips/${payslipId}`, undefined, employeeToken);
      assert.equal(detail.status, 200);
      assert.equal(detail.body.data.record.employee_number, "PR-1");

      // Another employee's payslip is simply not found.
      assert.equal((await call("GET", `/me/payslips/${payslipId}`, undefined, otherToken)).status, 404);
      // An administrator has no employee record, so has no payslips of their own.
      assert.equal((await call("GET", "/me/payslips", undefined, adminToken)).status, 403);
    });

    await t.test("a draft period's figures are not published as payslips", async () => {
      const draft = await call("POST", "/periods", { year: YEAR, month: 10 });
      assert.equal(draft.status, 201);
      const draftId = draft.body.data.period.id;
      await call("POST", `/periods/${draftId}/calculate`, {});

      const mine = await call("GET", "/me/payslips", undefined, employeeToken);
      // Still only the approved September payslip.
      assert.equal(mine.body.data.payslips.length, 1);
      assert.equal(mine.body.data.payslips[0].period_month, 9);
    });

    await t.test("payment is the only step after approval, and it locks too", async () => {
      assert.equal((await call("PUT", `/periods/${periodId}/status`, { status: "paid" })).status, 200);
      for (const status of ["approved", "reviewed", "calculated", "draft"]) {
        assert.equal((await call("PUT", `/periods/${periodId}/status`, { status })).status, 409, status);
      }
      assert.equal((await call("POST", `/periods/${periodId}/calculate`, {})).status, 409);
    });

    await t.test("the period summary reports totals for the reporting milestone", async () => {
      const summary = await call("GET", `/periods/${periodId}/summary`);
      assert.equal(summary.status, 200);
      assert.equal(summary.body.data.totals.employees, 2);
      assert.ok(Number(summary.body.data.totals.gross_sen) > 0);
      assert.equal(summary.body.data.byDepartment[0].department_name, "Engineering");
    });

    await t.test("payroll endpoints enforce their roles", async () => {
      const cases: Array<[string, string, string | null, number]> = [
        ["GET", "/periods", null, 401],
        ["GET", "/periods", employeeToken, 403],
        ["POST", "/periods", employeeToken, 403],
        ["GET", "/compensation/9800", employeeToken, 403],
        ["POST", "/compensation/9800", employeeToken, 403],
        ["GET", `/periods/${periodId}/summary`, employeeToken, 403],
        ["GET", "/me/payslips", null, 401],
      ];
      for (const [method, endpoint, token, expected] of cases) {
        const result = await call(method, endpoint, method === "POST" ? {} : undefined, token);
        assert.equal(result.status, expected, `${method} ${endpoint}`);
      }
    });

    await t.test("a failed calculation leaves no partial payroll behind", async () => {
      const period = await call("POST", "/periods", { year: YEAR, month: 11 });
      const failingId = period.body.data.period.id;

      // Force a failure part way through, without invalidating rows that already
      // exist: only an insert for this period and this employee is impossible.
      await db.query(
        `ALTER TABLE payroll_records ADD CONSTRAINT tmp_fail
         CHECK (period_id <> ${failingId} OR employee_id <> 9801)`,
      );
      try {
        const result = await call("POST", `/periods/${failingId}/calculate`, {});
        assert.equal(result.status, 503);
        // The whole transaction rolled back: not even the first employee remains.
        assert.equal((await db.query(
          "SELECT count(*)::int AS count FROM payroll_records WHERE period_id=$1", [failingId],
        )).rows[0].count, 0);
        assert.equal((await db.query(
          "SELECT status FROM payroll_periods WHERE id=$1", [failingId],
        )).rows[0].status, "draft");
      } finally {
        await db.query("ALTER TABLE payroll_records DROP CONSTRAINT tmp_fail");
      }
    });

    await t.test("the protected orphan attendance rows are untouched by the whole suite", async () => {
      assert.deepEqual(
        (await db.query(
          `SELECT id, employee_id FROM public.attendance a
           WHERE NOT EXISTS (SELECT 1 FROM public.employees e WHERE e.id = a.employee_id) ORDER BY id`,
        )).rows,
        orphansBefore,
      );
    });
  } finally {
    if (server) await new Promise<void>((resolve) => server!.close(() => resolve()));
    if (appPool) await appPool.end();
    if (pool) await pool.end();
    await admin.end();
  }
});
