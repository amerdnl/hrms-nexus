import type { PoolClient } from "pg";
import { getUnpaidLeaveDays } from "./leaveBalanceService.js";
import {
  calculatePayroll,
  monthBounds,
  workingDaysInMonth,
  type ManualLine,
  type PayrollStatus,
} from "../utils/payrollCalculation.js";

export interface PayrollPeriod {
  id: string;
  period_year: number;
  period_month: number;
  start_date: string;
  end_date: string;
  status: PayrollStatus;
  working_days: number;
  working_days_pattern: number[];
  note: string | null;
  calculated_at: string | null;
  reviewed_at: string | null;
  approved_at: string | null;
  paid_at: string | null;
}

export const periodColumns = `id, period_year, period_month, start_date::text, end_date::text,
  status, working_days, working_days_pattern, note,
  calculated_at, reviewed_at, approved_at, paid_at, created_at`;

export const recordColumns = `id, period_id, employee_id, employee_number, full_name,
  department_name, job_title, compensation_id, basic_salary_sen, allowance_sen,
  overtime_rate_sen, overtime_hours, unpaid_leave_days, working_days,
  gross_sen, deductions_sen, net_sen, calculated_at`;

/** Serialises payroll work for one period; released at commit or rollback. */
export async function lockPeriod(client: PoolClient, periodId: string): Promise<PayrollPeriod | null> {
  const result = await client.query<PayrollPeriod>(
    `SELECT ${periodColumns} FROM public.payroll_periods WHERE id = $1 FOR UPDATE`,
    [periodId],
  );
  return result.rows[0] ?? null;
}

/**
 * Opens a period, snapshotting the working week from Company Settings.
 *
 * The snapshot is what makes a finished payroll stable: changing the working week
 * afterwards cannot restate a period that has already been calculated.
 */
export async function openPeriod(
  client: PoolClient,
  year: number,
  month: number,
  createdBy: number,
): Promise<PayrollPeriod> {
  const settings = await client.query<{ working_days: number[] }>(
    "SELECT working_days FROM public.company_settings WHERE id = 1",
  );
  const pattern = settings.rows[0]?.working_days ?? [1, 2, 3, 4, 5];
  const { start, end } = monthBounds(year, month);
  const workingDays = workingDaysInMonth(year, month, pattern);

  if (workingDays <= 0) {
    throw new RangeError("The configured working week has no working days in this month");
  }

  const created = await client.query<PayrollPeriod>(
    `INSERT INTO public.payroll_periods
       (period_year, period_month, start_date, end_date, working_days,
        working_days_pattern, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     RETURNING ${periodColumns}`,
    [year, month, start, end, workingDays, pattern, createdBy],
  );

  return created.rows[0]!;
}

interface Candidate {
  employee_id: number;
  employee_number: string;
  full_name: string;
  department_name: string | null;
  job_title: string | null;
  compensation_id: string | null;
  basic_salary_sen: string | null;
  allowance_sen: string | null;
  overtime_rate_sen: string | null;
}

/**
 * Employees to be paid for a period, with the compensation in effect on its last
 * day.
 *
 * V1 does not pro-rate: the compensation effective at period end applies to the
 * whole period, so a mid-period joiner, leaver or raise is paid in full. That is
 * a stated limitation, surfaced in the UI, not a silent behaviour.
 */
export async function loadCandidates(
  client: PoolClient,
  period: PayrollPeriod,
): Promise<Candidate[]> {
  const result = await client.query<Candidate>(
    `SELECT e.id AS employee_id, e.employee_number, e.full_name,
            d.name AS department_name, e.job_title,
            c.id AS compensation_id, c.basic_salary_sen, c.allowance_sen, c.overtime_rate_sen
     FROM public.employees e
     LEFT JOIN public.departments d ON d.id = e.department_id
     LEFT JOIN LATERAL (
       SELECT id, basic_salary_sen, allowance_sen, overtime_rate_sen
       FROM public.employee_compensation
       WHERE employee_id = e.id
         AND effective_from <= $1::date
         AND (effective_to IS NULL OR effective_to >= $1::date)
       ORDER BY effective_from DESC
       LIMIT 1
     ) c ON TRUE
     ORDER BY e.employee_number`,
    [period.end_date],
  );
  return result.rows;
}

export interface CalculationSummary {
  calculated: number;
  /** Employees with no compensation effective in this period, named not hidden. */
  skipped: Array<{ employeeId: number; employeeNumber: string; fullName: string; reason: string }>;
  grossSen: number;
  deductionsSen: number;
  netSen: number;
}

/**
 * Calculates every employee in the period.
 *
 * Runs inside the caller's transaction. Manual lines are inputs, not outputs:
 * they are read first, fed into the calculation, and left in place, while every
 * derived line is regenerated. Recalculating therefore never loses an
 * administrator's adjustment and never double-counts it.
 */
export async function calculatePeriod(
  client: PoolClient,
  period: PayrollPeriod,
): Promise<CalculationSummary> {
  const candidates = await loadCandidates(client, period);
  const summary: CalculationSummary = {
    calculated: 0, skipped: [], grossSen: 0, deductionsSen: 0, netSen: 0,
  };

  // Manual lines already recorded for this period, keyed by employee.
  const manualRows = await client.query<{
    employee_id: number; item_type: "earning" | "deduction";
    code: string; label: string; amount_sen: string; is_statutory: boolean;
  }>(
    `SELECT r.employee_id, i.item_type, i.code, i.label, i.amount_sen, i.is_statutory
     FROM public.payroll_items i
     JOIN public.payroll_records r ON r.id = i.record_id
     WHERE r.period_id = $1 AND i.is_manual = TRUE`,
    [period.id],
  );

  const manualByEmployee = new Map<number, { earnings: ManualLine[]; deductions: ManualLine[] }>();
  for (const row of manualRows.rows) {
    const entry = manualByEmployee.get(row.employee_id)
      ?? { earnings: [], deductions: [] };
    const line: ManualLine = {
      code: row.code, label: row.label,
      amountSen: Number(row.amount_sen), isStatutory: row.is_statutory,
    };
    (row.item_type === "earning" ? entry.earnings : entry.deductions).push(line);
    manualByEmployee.set(row.employee_id, entry);
  }

  for (const candidate of candidates) {
    if (candidate.compensation_id === null) {
      summary.skipped.push({
        employeeId: candidate.employee_id,
        employeeNumber: candidate.employee_number,
        fullName: candidate.full_name,
        reason: "No compensation is effective for this period",
      });
      continue;
    }

    // Existing overtime hours are an administrator input and must survive a
    // recalculation, so they are read back rather than reset.
    const existing = await client.query<{ overtime_hours: string }>(
      "SELECT overtime_hours FROM public.payroll_records WHERE period_id = $1 AND employee_id = $2",
      [period.id, candidate.employee_id],
    );
    const overtimeHours = Number(existing.rows[0]?.overtime_hours ?? 0);

    const unpaidDays = await getUnpaidLeaveDays(
      client, candidate.employee_id, period.start_date, period.end_date,
      period.working_days_pattern,
    );

    const manual = manualByEmployee.get(candidate.employee_id) ?? { earnings: [], deductions: [] };
    const result = calculatePayroll({
      basicSalarySen: Number(candidate.basic_salary_sen),
      allowanceSen: Number(candidate.allowance_sen),
      overtimeRateSen: Number(candidate.overtime_rate_sen),
      overtimeHundredths: Math.round(overtimeHours * 100),
      unpaidLeaveTenths: Math.round(unpaidDays * 10),
      workingDays: period.working_days,
      manualEarnings: manual.earnings,
      manualDeductions: manual.deductions,
    });

    const upserted = await client.query<{ id: string }>(
      `INSERT INTO public.payroll_records
         (period_id, employee_id, employee_number, full_name, department_name, job_title,
          compensation_id, basic_salary_sen, allowance_sen, overtime_rate_sen,
          overtime_hours, unpaid_leave_days, working_days,
          gross_sen, deductions_sen, net_sen, calculated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,CURRENT_TIMESTAMP)
       ON CONFLICT (period_id, employee_id) DO UPDATE SET
         employee_number = EXCLUDED.employee_number,
         full_name = EXCLUDED.full_name,
         department_name = EXCLUDED.department_name,
         job_title = EXCLUDED.job_title,
         compensation_id = EXCLUDED.compensation_id,
         basic_salary_sen = EXCLUDED.basic_salary_sen,
         allowance_sen = EXCLUDED.allowance_sen,
         overtime_rate_sen = EXCLUDED.overtime_rate_sen,
         unpaid_leave_days = EXCLUDED.unpaid_leave_days,
         working_days = EXCLUDED.working_days,
         gross_sen = EXCLUDED.gross_sen,
         deductions_sen = EXCLUDED.deductions_sen,
         net_sen = EXCLUDED.net_sen,
         calculated_at = CURRENT_TIMESTAMP,
         updated_at = CURRENT_TIMESTAMP
       RETURNING id`,
      [
        period.id, candidate.employee_id, candidate.employee_number, candidate.full_name,
        candidate.department_name, candidate.job_title, candidate.compensation_id,
        Number(candidate.basic_salary_sen), Number(candidate.allowance_sen),
        Number(candidate.overtime_rate_sen), overtimeHours, unpaidDays,
        period.working_days, result.grossSen, result.deductionsSen, result.netSen,
      ],
    );

    const recordId = upserted.rows[0]!.id;

    // Only derived lines are replaced; manual lines are left exactly as entered.
    await client.query(
      "DELETE FROM public.payroll_items WHERE record_id = $1 AND is_manual = FALSE",
      [recordId],
    );

    for (const line of result.lines.filter((entry) => !entry.isManual)) {
      await client.query(
        `INSERT INTO public.payroll_items
           (record_id, item_type, code, label, amount_sen, is_manual, is_statutory)
         VALUES ($1,$2,$3,$4,$5,FALSE,FALSE)`,
        [recordId, line.itemType, line.code, line.label, line.amountSen],
      );
    }

    summary.calculated += 1;
    summary.grossSen += result.grossSen;
    summary.deductionsSen += result.deductionsSen;
    summary.netSen += result.netSen;
  }

  return summary;
}

/** Recomputes one record's stored totals from its lines, after a manual change. */
export async function refreshRecordTotals(
  client: PoolClient,
  recordId: string,
): Promise<void> {
  await client.query(
    `UPDATE public.payroll_records r SET
       gross_sen = totals.gross,
       deductions_sen = totals.deductions,
       net_sen = totals.gross - totals.deductions,
       updated_at = CURRENT_TIMESTAMP
     FROM (
       SELECT
         COALESCE(SUM(amount_sen) FILTER (WHERE item_type = 'earning'), 0) AS gross,
         COALESCE(SUM(amount_sen) FILTER (WHERE item_type = 'deduction'), 0) AS deductions
       FROM public.payroll_items WHERE record_id = $1
     ) totals
     WHERE r.id = $1`,
    [recordId],
  );
}

/**
 * Closes the currently open compensation row and opens a new one.
 *
 * History is append-only: an existing row is never rewritten, so a payslip can
 * always be explained by the compensation that produced it.
 */
export async function setCompensation(
  client: PoolClient,
  input: {
    employeeId: number; basicSalarySen: number; allowanceSen: number;
    overtimeRateSen: number; effectiveFrom: string; note: string | null; createdBy: number;
  },
): Promise<{ id: string }> {
  await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`compensation:${input.employeeId}`]);

  // Anything already covering this date, or starting later, is closed off first.
  await client.query(
    `UPDATE public.employee_compensation
     SET effective_to = ($2::date - INTERVAL '1 day')::date, updated_at = CURRENT_TIMESTAMP
     WHERE employee_id = $1
       AND effective_from < $2::date
       AND (effective_to IS NULL OR effective_to >= $2::date)`,
    [input.employeeId, input.effectiveFrom],
  );

  const inserted = await client.query<{ id: string }>(
    `INSERT INTO public.employee_compensation
       (employee_id, basic_salary_sen, allowance_sen, overtime_rate_sen,
        effective_from, note, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     ON CONFLICT (employee_id, effective_from) DO UPDATE SET
       basic_salary_sen = EXCLUDED.basic_salary_sen,
       allowance_sen = EXCLUDED.allowance_sen,
       overtime_rate_sen = EXCLUDED.overtime_rate_sen,
       note = EXCLUDED.note,
       updated_at = CURRENT_TIMESTAMP
     RETURNING id`,
    [
      input.employeeId, input.basicSalarySen, input.allowanceSen,
      input.overtimeRateSen, input.effectiveFrom, input.note, input.createdBy,
    ],
  );

  return inserted.rows[0]!;
}
