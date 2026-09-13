import type { Request, Response } from "express";
import type { PoolClient } from "pg";
import pool from "../config/db.js";
import { actorFromUser, recordAudit } from "../services/auditService.js";
import { payslipsPublished } from "../services/workflowNotifications.js";
import {
  calculatePeriod,
  lockPeriod,
  openPeriod,
  periodColumns,
  recordColumns,
  refreshRecordTotals,
  setCompensation,
} from "../services/payrollService.js";
import { parseIdParam } from "../utils/employeeValidation.js";
import {
  canTransition,
  isLocked,
  payrollStatuses,
  type PayrollStatus,
} from "../utils/payrollCalculation.js";
import { parseMoneyToSen, parseScaledQuantity } from "../utils/payrollMoney.js";

async function safeRollback(client: PoolClient): Promise<void> {
  try {
    await client.query("ROLLBACK");
  } catch {
    // The transaction is already lost; the caller's response still stands.
  }
}

function unavailable(response: Response, error: unknown, action: string): void {
  console.error(`Payroll ${action} failed:`, error);
  response.status(503).json({
    success: false,
    message: "The database is temporarily unavailable. Please try again.",
  });
}

/** Approved payroll is immutable; the database says so too. */
function lockedResponse(response: Response): void {
  response.status(409).json({
    success: false,
    code: "payroll_locked",
    message: "Approved payroll is final. Correct it with a reversal in a later period.",
  });
}

// ------------------------------------------------------------------- periods

export async function listPeriods(_request: Request, response: Response): Promise<void> {
  try {
    const result = await pool.query(
      `SELECT ${periodColumns},
              (SELECT count(*)::int FROM public.payroll_records r WHERE r.period_id = p.id) AS record_count,
              (SELECT COALESCE(SUM(net_sen), 0)::bigint FROM public.payroll_records r WHERE r.period_id = p.id) AS net_sen
       FROM public.payroll_periods p
       ORDER BY period_year DESC, period_month DESC`,
    );
    response.status(200).json({ success: true, data: { periods: result.rows } });
  } catch (error) {
    unavailable(response, error, "period list");
  }
}

export async function createPeriod(request: Request, response: Response): Promise<void> {
  const body = (request.body ?? {}) as Record<string, unknown>;
  const unsupported = Object.keys(body).filter((key) => !["year", "month", "note"].includes(key));
  if (unsupported.length > 0) {
    response.status(400).json({
      success: false,
      message: `The request contains unsupported fields: ${unsupported.sort().join(", ")}.`,
    });
    return;
  }

  const year = body.year;
  const month = body.month;
  if (typeof year !== "number" || !Number.isSafeInteger(year) || year < 1900 || year > 2999
      || typeof month !== "number" || !Number.isSafeInteger(month) || month < 1 || month > 12) {
    response.status(400).json({ success: false, message: "Enter a valid payroll year and month." });
    return;
  }

  let client: PoolClient;
  try {
    client = await pool.connect();
  } catch (error) {
    unavailable(response, error, "period creation");
    return;
  }

  try {
    await client.query("BEGIN");
    const period = await openPeriod(client, year, month, request.user!.id);
    await recordAudit({
      actor: actorFromUser(request.user, request.user?.email),
      action: "PAYROLL_PERIOD_OPENED",
      entityType: "payroll",
      entityId: period.id,
      summary: `Opened the payroll period for ${period.period_year}-${String(period.period_month).padStart(2, "0")}`,
      changes: {
        period_year: period.period_year,
        period_month: period.period_month,
        working_days: period.working_days,
      },
    }, client);

    await client.query("COMMIT");
    response.status(201).json({ success: true, message: "Payroll period opened.", data: { period } });
  } catch (error) {
    await safeRollback(client);
    if ((error as { code?: string }).code === "23505") {
      response.status(409).json({
        success: false,
        code: "period_exists",
        message: "A payroll period already exists for that month.",
      });
      return;
    }
    if (error instanceof RangeError) {
      response.status(400).json({ success: false, message: error.message });
      return;
    }
    unavailable(response, error, "period creation");
  } finally {
    client.release();
  }
}

export async function getPeriod(request: Request, response: Response): Promise<void> {
  const id = parseIdParam(request.params.id);
  if (id === null) {
    response.status(400).json({ success: false, message: "Invalid payroll period ID" });
    return;
  }

  try {
    const period = await pool.query(
      `SELECT ${periodColumns} FROM public.payroll_periods WHERE id = $1`, [id],
    );
    if (period.rowCount === 0) {
      response.status(404).json({ success: false, message: "Payroll period not found" });
      return;
    }

    const records = await pool.query(
      `SELECT ${recordColumns} FROM public.payroll_records
       WHERE period_id = $1 ORDER BY employee_number`,
      [id],
    );

    response.status(200).json({
      success: true,
      data: { period: period.rows[0], records: records.rows },
    });
  } catch (error) {
    unavailable(response, error, "period lookup");
  }
}

/**
 * Calculates or recalculates a period.
 *
 * One transaction with the period row locked, so two simultaneous calculations
 * cannot both write. The unique constraint on (period, employee) means a
 * duplicate record is impossible even if that lock were bypassed.
 */
export async function calculatePayrollPeriod(request: Request, response: Response): Promise<void> {
  const id = parseIdParam(request.params.id);
  if (id === null) {
    response.status(400).json({ success: false, message: "Invalid payroll period ID" });
    return;
  }

  let client: PoolClient;
  try {
    client = await pool.connect();
  } catch (error) {
    unavailable(response, error, "calculation");
    return;
  }

  try {
    await client.query("BEGIN");
    const period = await lockPeriod(client, String(id));

    if (!period) {
      await safeRollback(client);
      response.status(404).json({ success: false, message: "Payroll period not found" });
      return;
    }
    if (isLocked(period.status)) {
      await safeRollback(client);
      lockedResponse(response);
      return;
    }

    const summary = await calculatePeriod(client, period);

    if (period.status !== "calculated") {
      await client.query(
        `UPDATE public.payroll_periods
         SET status = 'calculated', calculated_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [period.id],
      );
    } else {
      await client.query(
        "UPDATE public.payroll_periods SET calculated_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = $1",
        [period.id],
      );
    }

    await recordAudit({
      actor: actorFromUser(request.user, request.user?.email),
      action: "PAYROLL_CALCULATED",
      entityType: "payroll",
      entityId: period.id,
      summary:
        `Calculated payroll for ${period.period_year}-${String(period.period_month).padStart(2, "0")}: ` +
        `${summary.calculated} paid, ${summary.skipped.length} skipped`,
      changes: { calculated: summary.calculated, skipped: summary.skipped.length },
    }, client);

    await client.query("COMMIT");
    response.status(200).json({
      success: true,
      message: `Calculated ${summary.calculated} employee${summary.calculated === 1 ? "" : "s"}.`,
      data: { summary },
    });
  } catch (error) {
    await safeRollback(client);
    unavailable(response, error, "calculation");
  } finally {
    client.release();
  }
}

/** Moves a period through the approval states, refusing anything else. */
export async function transitionPeriod(request: Request, response: Response): Promise<void> {
  const id = parseIdParam(request.params.id);
  if (id === null) {
    response.status(400).json({ success: false, message: "Invalid payroll period ID" });
    return;
  }

  const status = (request.body ?? {}).status;
  if (typeof status !== "string" || !payrollStatuses.includes(status as PayrollStatus)) {
    response.status(400).json({
      success: false,
      message: `Status must be one of: ${payrollStatuses.join(", ")}.`,
    });
    return;
  }

  let client: PoolClient;
  try {
    client = await pool.connect();
  } catch (error) {
    unavailable(response, error, "transition");
    return;
  }

  try {
    await client.query("BEGIN");
    const period = await lockPeriod(client, String(id));

    if (!period) {
      await safeRollback(client);
      response.status(404).json({ success: false, message: "Payroll period not found" });
      return;
    }

    const target = status as PayrollStatus;
    if (!canTransition(period.status, target)) {
      await safeRollback(client);
      response.status(409).json({
        success: false,
        code: "invalid_transition",
        message: `Payroll cannot move from ${period.status} to ${target}.`,
      });
      return;
    }

    if (target === "approved") {
      const empty = await client.query(
        "SELECT count(*)::int AS count FROM public.payroll_records WHERE period_id = $1",
        [period.id],
      );
      if (empty.rows[0].count === 0) {
        await safeRollback(client);
        response.status(409).json({
          success: false,
          code: "nothing_to_approve",
          message: "This period has no payroll records to approve.",
        });
        return;
      }
    }

    const stamps: Record<string, string> = {
      reviewed: "reviewed_at", approved: "approved_at", paid: "paid_at",
    };
    const actor: Record<string, string> = { approved: "approved_by", paid: "paid_by" };

    await client.query(
      `UPDATE public.payroll_periods
       SET status = $2, updated_at = CURRENT_TIMESTAMP
           ${stamps[target] ? `, ${stamps[target]} = CURRENT_TIMESTAMP` : ""}
           ${actor[target] ? `, ${actor[target]} = $3` : ""}
       WHERE id = $1`,
      actor[target] ? [period.id, target, request.user!.id] : [period.id, target],
    );

    await recordAudit({
      actor: actorFromUser(request.user, request.user?.email),
      action:
        target === "approved" ? "PAYROLL_APPROVED"
        : target === "paid" ? "PAYROLL_PAID"
        : "PAYROLL_STATE_CHANGED",
      entityType: "payroll",
      entityId: period.id,
      summary:
        `Payroll ${period.period_year}-${String(period.period_month).padStart(2, "0")} ` +
        `moved from ${period.status} to ${target}`,
      changes: { status: { before: period.status, after: target } },
    }, client);
    // Approval is the moment payslips become visible to their employees.
    if (target === "approved") await payslipsPublished(client, period, request.user?.id ?? null);

    await client.query("COMMIT");
    response.status(200).json({ success: true, message: `Payroll ${target}.` });
  } catch (error) {
    await safeRollback(client);
    // The database trigger is the final authority on transitions.
    if ((error as { code?: string }).code === "23514") {
      response.status(409).json({
        success: false,
        code: "invalid_transition",
        message: (error as { message?: string }).message ?? "That payroll transition is not allowed.",
      });
      return;
    }
    unavailable(response, error, "transition");
  } finally {
    client.release();
  }
}

// ------------------------------------------------------------------- records

async function loadRecordWithItems(
  db: Pick<PoolClient, "query">,
  recordId: number,
): Promise<{ record: Record<string, unknown>; items: unknown[]; period: Record<string, unknown> } | null> {
  const record = await db.query(
    `SELECT ${recordColumns} FROM public.payroll_records WHERE id = $1`, [recordId],
  );
  if (record.rowCount === 0) return null;

  const [items, period] = await Promise.all([
    db.query(
      `SELECT id, item_type, code, label, amount_sen, is_manual, is_statutory, note
       FROM public.payroll_items WHERE record_id = $1 ORDER BY item_type DESC, id`,
      [recordId],
    ),
    db.query(
      `SELECT ${periodColumns} FROM public.payroll_periods WHERE id = $1`,
      [record.rows[0].period_id],
    ),
  ]);

  return { record: record.rows[0], items: items.rows, period: period.rows[0] };
}

export async function getRecord(request: Request, response: Response): Promise<void> {
  const id = parseIdParam(request.params.recordId);
  if (id === null) {
    response.status(400).json({ success: false, message: "Invalid payroll record ID" });
    return;
  }

  try {
    const detail = await loadRecordWithItems(pool, id);
    if (!detail) {
      response.status(404).json({ success: false, message: "Payroll record not found" });
      return;
    }
    response.status(200).json({ success: true, data: detail });
  } catch (error) {
    unavailable(response, error, "record lookup");
  }
}

/** Records an administrator's overtime hours for one employee in a period. */
export async function setOvertime(request: Request, response: Response): Promise<void> {
  const id = parseIdParam(request.params.recordId);
  if (id === null) {
    response.status(400).json({ success: false, message: "Invalid payroll record ID" });
    return;
  }

  const hours = parseScaledQuantity((request.body ?? {}).hours, 2, 1000);
  if (!hours.ok) {
    response.status(400).json({ success: false, message: "Enter overtime hours from 0 to 1000." });
    return;
  }

  let client: PoolClient;
  try {
    client = await pool.connect();
  } catch (error) {
    unavailable(response, error, "overtime update");
    return;
  }

  try {
    await client.query("BEGIN");
    const owner = await client.query<{ period_id: string; status: PayrollStatus }>(
      `SELECT r.period_id, p.status FROM public.payroll_records r
       JOIN public.payroll_periods p ON p.id = r.period_id
       WHERE r.id = $1 FOR UPDATE OF r`,
      [id],
    );

    const ownerRow = owner.rows[0];
    if (!ownerRow) {
      await safeRollback(client);
      response.status(404).json({ success: false, message: "Payroll record not found" });
      return;
    }
    if (isLocked(ownerRow.status)) {
      await safeRollback(client);
      lockedResponse(response);
      return;
    }

    await client.query(
      "UPDATE public.payroll_records SET overtime_hours = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $1",
      [id, hours.scaled / 100],
    );
    await client.query("COMMIT");

    response.status(200).json({
      success: true,
      message: "Overtime saved. Recalculate the period to apply it.",
    });
  } catch (error) {
    await safeRollback(client);
    unavailable(response, error, "overtime update");
  } finally {
    client.release();
  }
}

/** Adds a manual earning or deduction line, including a hand-entered statutory line. */
export async function addManualItem(request: Request, response: Response): Promise<void> {
  const id = parseIdParam(request.params.recordId);
  if (id === null) {
    response.status(400).json({ success: false, message: "Invalid payroll record ID" });
    return;
  }

  const body = (request.body ?? {}) as Record<string, unknown>;
  const errors: Record<string, string> = {};

  const itemType = body.itemType;
  if (itemType !== "earning" && itemType !== "deduction") {
    errors.itemType = "Choose an earning or a deduction.";
  }
  const label = typeof body.label === "string" ? body.label.trim() : "";
  if (!label || label.length > 120) errors.label = "Enter a label of up to 120 characters.";

  const amount = parseMoneyToSen(body.amount);
  if (!amount.ok) errors.amount = "Enter an amount such as 250.00.";
  if (amount.ok && amount.sen <= 0) errors.amount = "Enter an amount greater than zero.";

  if (body.isStatutory !== undefined && typeof body.isStatutory !== "boolean") {
    errors.isStatutory = "isStatutory must be true or false.";
  }

  if (Object.keys(errors).length > 0) {
    response.status(400).json({ success: false, message: "Check the highlighted fields.", errors });
    return;
  }

  let client: PoolClient;
  try {
    client = await pool.connect();
  } catch (error) {
    unavailable(response, error, "manual item");
    return;
  }

  try {
    await client.query("BEGIN");
    const owner = await client.query<{ status: PayrollStatus }>(
      `SELECT p.status FROM public.payroll_records r
       JOIN public.payroll_periods p ON p.id = r.period_id
       WHERE r.id = $1 FOR UPDATE OF r`,
      [id],
    );

    const ownerRow = owner.rows[0];
    if (!ownerRow) {
      await safeRollback(client);
      response.status(404).json({ success: false, message: "Payroll record not found" });
      return;
    }
    if (isLocked(ownerRow.status)) {
      await safeRollback(client);
      lockedResponse(response);
      return;
    }

    await client.query(
      `INSERT INTO public.payroll_items
         (record_id, item_type, code, label, amount_sen, is_manual, is_statutory, note, created_by)
       VALUES ($1,$2,$3,$4,$5,TRUE,$6,$7,$8)`,
      [
        id, itemType, body.isStatutory === true ? "statutory" : "manual",
        label, (amount as { sen: number }).sen, body.isStatutory === true,
        typeof body.note === "string" ? body.note.trim().slice(0, 500) || null : null,
        request.user!.id,
      ],
    );

    await refreshRecordTotals(client, String(id));
    await client.query("COMMIT");

    response.status(201).json({ success: true, message: "Line added." });
  } catch (error) {
    await safeRollback(client);
    unavailable(response, error, "manual item");
  } finally {
    client.release();
  }
}

export async function deleteManualItem(request: Request, response: Response): Promise<void> {
  const recordId = parseIdParam(request.params.recordId);
  const itemId = parseIdParam(request.params.itemId);
  if (recordId === null || itemId === null) {
    response.status(400).json({ success: false, message: "Invalid payroll identifier" });
    return;
  }

  let client: PoolClient;
  try {
    client = await pool.connect();
  } catch (error) {
    unavailable(response, error, "manual item removal");
    return;
  }

  try {
    await client.query("BEGIN");
    const owner = await client.query<{ status: PayrollStatus }>(
      `SELECT p.status FROM public.payroll_records r
       JOIN public.payroll_periods p ON p.id = r.period_id
       WHERE r.id = $1 FOR UPDATE OF r`,
      [recordId],
    );

    const ownerRow = owner.rows[0];
    if (!ownerRow) {
      await safeRollback(client);
      response.status(404).json({ success: false, message: "Payroll record not found" });
      return;
    }
    if (isLocked(ownerRow.status)) {
      await safeRollback(client);
      lockedResponse(response);
      return;
    }

    // Only a manual line can be removed; a derived line belongs to the calculation.
    const deleted = await client.query(
      "DELETE FROM public.payroll_items WHERE id = $1 AND record_id = $2 AND is_manual = TRUE RETURNING id",
      [itemId, recordId],
    );

    if (deleted.rowCount === 0) {
      await safeRollback(client);
      response.status(404).json({
        success: false,
        message: "That line was not found, or is a calculated line that cannot be removed.",
      });
      return;
    }

    await refreshRecordTotals(client, String(recordId));
    await recordAudit({
      actor: actorFromUser(request.user, request.user?.email),
      action: "PAYROLL_LINE_REMOVED",
      entityType: "payroll",
      entityId: recordId,
      summary: `Removed manual line #${itemId} from payroll record #${recordId}`,
      changes: { item_id: itemId },
    }, client);

    await client.query("COMMIT");
    response.status(200).json({ success: true, message: "Line removed." });
  } catch (error) {
    await safeRollback(client);
    unavailable(response, error, "manual item removal");
  } finally {
    client.release();
  }
}

// -------------------------------------------------------------- compensation

export async function getCompensation(request: Request, response: Response): Promise<void> {
  const employeeId = parseIdParam(request.params.employeeId);
  if (employeeId === null) {
    response.status(400).json({ success: false, message: "Invalid employee ID" });
    return;
  }

  try {
    const result = await pool.query(
      `SELECT id, basic_salary_sen, allowance_sen, overtime_rate_sen,
              effective_from::text, effective_to::text, note, created_at
       FROM public.employee_compensation
       WHERE employee_id = $1 ORDER BY effective_from DESC`,
      [employeeId],
    );
    response.status(200).json({ success: true, data: { compensation: result.rows } });
  } catch (error) {
    unavailable(response, error, "compensation lookup");
  }
}

export async function createCompensation(request: Request, response: Response): Promise<void> {
  const employeeId = parseIdParam(request.params.employeeId);
  if (employeeId === null) {
    response.status(400).json({ success: false, message: "Invalid employee ID" });
    return;
  }

  const body = (request.body ?? {}) as Record<string, unknown>;
  const allowed = ["basicSalary", "allowance", "overtimeRate", "effectiveFrom", "note"];
  const unsupported = Object.keys(body).filter((key) => !allowed.includes(key));
  if (unsupported.length > 0) {
    response.status(400).json({
      success: false,
      message: `The request contains unsupported fields: ${unsupported.sort().join(", ")}.`,
    });
    return;
  }

  const errors: Record<string, string> = {};
  const basic = parseMoneyToSen(body.basicSalary);
  if (!basic.ok) errors.basicSalary = "Enter a basic salary such as 3500.00.";
  const allowance = parseMoneyToSen(body.allowance ?? "0");
  if (!allowance.ok) errors.allowance = "Enter an allowance such as 250.00.";
  const overtime = parseMoneyToSen(body.overtimeRate ?? "0");
  if (!overtime.ok) errors.overtimeRate = "Enter an hourly overtime rate such as 20.00.";

  const effectiveFrom = typeof body.effectiveFrom === "string" ? body.effectiveFrom.trim() : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveFrom)
      || Number.isNaN(Date.parse(`${effectiveFrom}T00:00:00Z`))) {
    errors.effectiveFrom = "Enter an effective date in YYYY-MM-DD format.";
  }

  if (Object.keys(errors).length > 0) {
    response.status(400).json({ success: false, message: "Check the highlighted fields.", errors });
    return;
  }

  let client: PoolClient;
  try {
    client = await pool.connect();
  } catch (error) {
    unavailable(response, error, "compensation update");
    return;
  }

  try {
    await client.query("BEGIN");
    const employee = await client.query("SELECT id FROM public.employees WHERE id = $1", [employeeId]);
    if (employee.rowCount === 0) {
      await safeRollback(client);
      response.status(404).json({ success: false, message: "Employee not found" });
      return;
    }

    await setCompensation(client, {
      employeeId,
      basicSalarySen: (basic as { sen: number }).sen,
      allowanceSen: (allowance as { sen: number }).sen,
      overtimeRateSen: (overtime as { sen: number }).sen,
      effectiveFrom,
      note: typeof body.note === "string" ? body.note.trim().slice(0, 500) || null : null,
      createdBy: request.user!.id,
    });

    // Amounts are recorded in sen, exactly as stored. A salary change is one of
    // the highest-value events in the system and the figures are the point of it.
    await recordAudit({
      actor: actorFromUser(request.user, request.user?.email),
      action: "SALARY_CHANGED",
      entityType: "compensation",
      entityId: employeeId,
      summary: `Set compensation for employee #${employeeId}, effective ${effectiveFrom}`,
      changes: {
        basic_salary_sen: (basic as { sen: number }).sen,
        allowance_sen: (allowance as { sen: number }).sen,
        overtime_rate_sen: (overtime as { sen: number }).sen,
        effective_from: effectiveFrom,
      },
    }, client);

    await client.query("COMMIT");
    response.status(201).json({
      success: true,
      message: "Compensation saved. Payslips already approved are unchanged.",
    });
  } catch (error) {
    await safeRollback(client);
    unavailable(response, error, "compensation update");
  } finally {
    client.release();
  }
}

// ----------------------------------------------------------------- payslips

/**
 * An employee's own payslips.
 *
 * Restricted to their own records, and only once the payroll is approved or
 * paid: a draft figure is not a payslip.
 */
export async function getMyPayslips(request: Request, response: Response): Promise<void> {
  const employeeId = request.user?.employeeId ?? null;
  if (employeeId === null) {
    response.status(403).json({
      success: false,
      message: "Authenticated user is not linked to an employee record",
    });
    return;
  }

  try {
    const result = await pool.query(
      `SELECT r.id, r.period_id, p.period_year, p.period_month, p.status,
              r.gross_sen, r.deductions_sen, r.net_sen, p.paid_at
       FROM public.payroll_records r
       JOIN public.payroll_periods p ON p.id = r.period_id
       WHERE r.employee_id = $1 AND p.status IN ('approved', 'paid')
       ORDER BY p.period_year DESC, p.period_month DESC`,
      [employeeId],
    );
    response.status(200).json({ success: true, data: { payslips: result.rows } });
  } catch (error) {
    unavailable(response, error, "payslip list");
  }
}

export async function getMyPayslip(request: Request, response: Response): Promise<void> {
  const employeeId = request.user?.employeeId ?? null;
  const recordId = parseIdParam(request.params.recordId);

  if (employeeId === null) {
    response.status(403).json({
      success: false,
      message: "Authenticated user is not linked to an employee record",
    });
    return;
  }
  if (recordId === null) {
    response.status(400).json({ success: false, message: "Invalid payslip ID" });
    return;
  }

  try {
    // Ownership and publication are both part of the lookup, so another
    // employee's payslip is simply not found.
    const owned = await pool.query(
      `SELECT r.id FROM public.payroll_records r
       JOIN public.payroll_periods p ON p.id = r.period_id
       WHERE r.id = $1 AND r.employee_id = $2 AND p.status IN ('approved', 'paid')`,
      [recordId, employeeId],
    );
    if (owned.rowCount === 0) {
      response.status(404).json({ success: false, message: "Payslip not found" });
      return;
    }

    const detail = await loadRecordWithItems(pool, recordId);
    response.status(200).json({ success: true, data: detail });
  } catch (error) {
    unavailable(response, error, "payslip lookup");
  }
}

/** Period totals, shaped for the reporting milestone to consume. */
export async function getPeriodSummary(request: Request, response: Response): Promise<void> {
  const id = parseIdParam(request.params.id);
  if (id === null) {
    response.status(400).json({ success: false, message: "Invalid payroll period ID" });
    return;
  }

  try {
    const totals = await pool.query(
      `SELECT count(*)::int AS employees,
              COALESCE(SUM(gross_sen), 0)::bigint AS gross_sen,
              COALESCE(SUM(deductions_sen), 0)::bigint AS deductions_sen,
              COALESCE(SUM(net_sen), 0)::bigint AS net_sen
       FROM public.payroll_records WHERE period_id = $1`,
      [id],
    );

    const byDepartment = await pool.query(
      `SELECT COALESCE(department_name, 'Unassigned') AS department_name,
              count(*)::int AS employees,
              COALESCE(SUM(gross_sen), 0)::bigint AS gross_sen,
              COALESCE(SUM(net_sen), 0)::bigint AS net_sen
       FROM public.payroll_records WHERE period_id = $1
       GROUP BY 1 ORDER BY 1`,
      [id],
    );

    response.status(200).json({
      success: true,
      data: { totals: totals.rows[0], byDepartment: byDepartment.rows },
    });
  } catch (error) {
    unavailable(response, error, "period summary");
  }
}
