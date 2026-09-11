import type { Request, Response } from "express";
import { actingRole, isTeamMember } from "../auth/policy.js";
import { actorFromUser, recordAudit } from "../services/auditService.js";
import type { PoolClient } from "pg";
import pool from "../config/db.js";
import {
  ensureEntitlements,
  findOverlapping,
  getBalances,
  getUnpaidLeaveDays,
  loadLeaveSettings,
  loadPolicies,
  lockEmployeeLeave,
  upsertEntitlement,
} from "../services/leaveBalanceService.js";
import { getZonedNow } from "../utils/attendanceVerification.js";
import { parseIdParam } from "../utils/employeeValidation.js";
import {
  countWorkingDays,
  leaveTypes,
  round1,
  validateLeaveRequest,
  type LeaveType,
} from "../utils/leaveCalculation.js";

const leaveColumns = `id, employee_id, leave_type, start_date, end_date, reason, status,
  admin_comment, reviewed_by, reviewed_at, working_days, leave_year,
  cancelled_at, cancelled_by, created_at, updated_at`;

async function safeRollback(client: PoolClient): Promise<void> {
  try {
    await client.query("ROLLBACK");
  } catch {
    // The transaction is already lost; the caller's response still stands.
  }
}

function unavailable(response: Response, error: unknown, action: string): void {
  console.error(`Leave ${action} failed:`, error);
  response.status(503).json({
    success: false,
    message: "The database is temporarily unavailable. Please try again.",
  });
}

/** Resolves the employee behind the request, or answers 403. */
async function requireEmployeeId(
  request: Request,
  response: Response,
): Promise<number | null> {
  const employeeId = request.user?.employeeId ?? null;

  if (employeeId === null || !Number.isSafeInteger(employeeId) || employeeId <= 0) {
    response.status(403).json({
      success: false,
      message: "Authenticated user is not linked to an employee record",
    });
    return null;
  }

  return employeeId;
}

/** The current leave year in the configured timezone. */
async function currentLeaveYear(db: Pick<PoolClient, "query">): Promise<number> {
  const settings = await loadLeaveSettings(db);
  return Number(getZonedNow(settings?.timezone ?? "UTC").date.slice(0, 4));
}

// --------------------------------------------------------------- submission

export async function createLeaveRequest(
  request: Request,
  response: Response,
): Promise<void> {
  const employeeId = await requireEmployeeId(request, response);
  if (employeeId === null) return;

  const validation = validateLeaveRequest(request.body);
  if (!validation.valid) {
    response.status(400).json({
      success: false,
      message: "Check the highlighted leave details.",
      errors: validation.errors,
    });
    return;
  }

  const { data, leaveYear } = validation;
  let client: PoolClient;

  try {
    client = await pool.connect();
  } catch (error) {
    unavailable(response, error, "submission");
    return;
  }

  try {
    await client.query("BEGIN");

    const settings = await loadLeaveSettings(client);
    if (!settings) {
      await safeRollback(client);
      response.status(503).json({
        success: false,
        code: "settings_missing",
        message: "Company settings are not configured yet. Ask your administrator to set the working week.",
      });
      return;
    }

    // Serialise every balance-affecting write for this employee, so a second
    // simultaneous submission cannot pass the same overlap and balance checks.
    await lockEmployeeLeave(client, employeeId);

    const overlapping = await findOverlapping(client, employeeId, data.startDate, data.endDate);
    if (overlapping.length > 0) {
      await safeRollback(client);
      const clash = overlapping[0]!;
      response.status(409).json({
        success: false,
        code: "overlap",
        message: `This overlaps an existing ${clash.status} request from ${clash.start_date} to ${clash.end_date}.`,
      });
      return;
    }

    const workingDays = countWorkingDays(data.startDate, data.endDate, settings.working_days);
    if (workingDays === null) {
      await safeRollback(client);
      response.status(400).json({ success: false, message: "Those dates could not be interpreted." });
      return;
    }

    if (workingDays === 0) {
      await safeRollback(client);
      response.status(400).json({
        success: false,
        code: "no_working_days",
        message: "That range contains no working days, so there is no leave to take.",
      });
      return;
    }

    const policies = await loadPolicies(client);
    const policy = policies.get(data.leaveType);
    if (!policy || policy.active === false) {
      await safeRollback(client);
      response.status(400).json({
        success: false,
        message: "That leave type is not currently available.",
      });
      return;
    }

    if (policy.deducts_balance) {
      await ensureEntitlements(client, employeeId, leaveYear);
      const balances = await getBalances(client, employeeId, leaveYear);
      const balance = balances.find((entry) => entry.leaveType === data.leaveType);

      // Pending days count against availability here so an employee cannot queue
      // several requests that each look affordable on their own.
      if (balance && workingDays > balance.availableDays) {
        await safeRollback(client);
        response.status(409).json({
          success: false,
          code: "insufficient_balance",
          message:
            `This request needs ${workingDays} day${workingDays === 1 ? "" : "s"} but only ` +
            `${balance.availableDays} remain${balance.availableDays === 1 ? "s" : ""} for ${data.leaveType} leave in ${leaveYear}` +
            (balance.pendingDays > 0 ? `, with ${balance.pendingDays} already awaiting a decision.` : "."),
        });
        return;
      }
    }

    const created = await client.query(
      `INSERT INTO public.leave_requests
         (employee_id, leave_type, start_date, end_date, reason, working_days, leave_year)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       RETURNING ${leaveColumns}`,
      [employeeId, data.leaveType, data.startDate, data.endDate, data.reason, workingDays, leaveYear],
    );

    await client.query("COMMIT");

    response.status(201).json({
      success: true,
      message: "Leave request submitted successfully",
      data: { leave: created.rows[0] },
    });
  } catch (error) {
    await safeRollback(client);
    unavailable(response, error, "submission");
  } finally {
    client.release();
  }
}

// ----------------------------------------------------------------- reading

export async function getMyLeaveRequests(
  request: Request,
  response: Response,
): Promise<void> {
  const employeeId = await requireEmployeeId(request, response);
  if (employeeId === null) return;

  try {
    const result = await pool.query(
      `SELECT ${leaveColumns} FROM public.leave_requests
       WHERE employee_id = $1 ORDER BY created_at DESC`,
      [employeeId],
    );

    response.status(200).json({
      success: true,
      message: "Leave history retrieved successfully",
      data: { leaves: result.rows },
    });
  } catch (error) {
    unavailable(response, error, "history lookup");
  }
}

/** The signed-in employee's own balances. */
export async function getMyLeaveBalances(
  request: Request,
  response: Response,
): Promise<void> {
  const employeeId = await requireEmployeeId(request, response);
  if (employeeId === null) return;

  let client: PoolClient;
  try {
    client = await pool.connect();
  } catch (error) {
    unavailable(response, error, "balance lookup");
    return;
  }

  try {
    const year = Number(request.query.year ?? await currentLeaveYear(client));
    if (!Number.isSafeInteger(year) || year < 1900 || year > 2999) {
      response.status(400).json({ success: false, message: "Invalid leave year." });
      return;
    }

    // Materialise the default grant on first view so a new employee sees a real
    // entitlement rather than zeros.
    await client.query("BEGIN");
    await ensureEntitlements(client, employeeId, year);
    await client.query("COMMIT");

    const balances = await getBalances(client, employeeId, year);
    response.status(200).json({ success: true, data: { leaveYear: year, balances } });
  } catch (error) {
    await safeRollback(client);
    unavailable(response, error, "balance lookup");
  } finally {
    client.release();
  }
}

export async function getAllLeaveRequests(
  request: Request,
  response: Response,
): Promise<void> {
  const status = typeof request.query.status === "string" ? request.query.status.trim() : "";
  const employee = typeof request.query.employee === "string" ? request.query.employee.trim() : "";
  const date = typeof request.query.date === "string" ? request.query.date.trim() : "";

  const allowedStatuses = ["pending", "approved", "rejected", "cancelled"];
  if (status && !allowedStatuses.includes(status)) {
    response.status(400).json({ success: false, message: "Invalid leave status filter" });
    return;
  }
  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    response.status(400).json({ success: false, message: "Invalid date filter" });
    return;
  }

  const values: string[] = [];
  const conditions: string[] = [];

  if (status) {
    values.push(status);
    conditions.push(`lr.status = $${values.length}`);
  }
  if (employee) {
    values.push(`%${employee}%`);
    conditions.push(`e.full_name ILIKE $${values.length}`);
  }
  if (date) {
    values.push(date);
    conditions.push(`$${values.length}::date BETWEEN lr.start_date AND lr.end_date`);
  }

  try {
    const result = await pool.query(
      `SELECT lr.id, lr.employee_id, e.full_name AS employee_name, d.name AS department_name,
              lr.leave_type, lr.start_date, lr.end_date, lr.reason, lr.status,
              lr.admin_comment, lr.reviewed_by, lr.reviewed_at, lr.working_days,
              lr.leave_year, lr.cancelled_at, lr.cancelled_by, lr.created_at, lr.updated_at
       FROM public.leave_requests lr
       JOIN public.employees e ON lr.employee_id = e.id
       LEFT JOIN public.departments d ON e.department_id = d.id
       ${conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : ""}
       ORDER BY lr.created_at DESC`,
      values,
    );

    response.status(200).json({
      success: true,
      message: "Leave requests retrieved successfully",
      data: { leaves: result.rows },
    });
  } catch (error) {
    unavailable(response, error, "list");
  }
}

export async function getLeaveRequestById(
  request: Request,
  response: Response,
): Promise<void> {
  const leaveId = parseIdParam(request.params.id);
  if (leaveId === null) {
    response.status(400).json({ success: false, message: "Invalid leave request ID" });
    return;
  }

  const employeeId = await requireEmployeeId(request, response);
  if (employeeId === null) return;

  try {
    const result = await pool.query(
      `SELECT ${leaveColumns} FROM public.leave_requests WHERE id = $1 AND employee_id = $2`,
      [leaveId, employeeId],
    );

    if (result.rowCount === 0) {
      response.status(404).json({ success: false, message: "Leave request not found" });
      return;
    }

    response.status(200).json({
      success: true,
      message: "Leave request retrieved successfully",
      data: { leave: result.rows[0] },
    });
  } catch (error) {
    unavailable(response, error, "detail lookup");
  }
}

// -------------------------------------------------------------- decisions

/**
 * Approve or reject, atomically.
 *
 * Only a pending request can be decided. The guard is part of the UPDATE itself,
 * so two simultaneous approvals cannot both succeed and the balance cannot be
 * deducted twice -- usage is derived from this row, and this row changes once.
 */
export async function updateLeaveStatus(
  request: Request,
  response: Response,
): Promise<void> {
  const leaveId = parseIdParam(request.params.id);
  if (leaveId === null) {
    response.status(400).json({ success: false, message: "Invalid leave request ID" });
    return;
  }

  const body = (request.body ?? {}) as Record<string, unknown>;
  const status = typeof body.status === "string" ? body.status.trim() : "";
  const adminComment =
    typeof body.adminComment === "string" && body.adminComment.trim()
      ? body.adminComment.trim().slice(0, 1000)
      : null;

  if (status !== "approved" && status !== "rejected") {
    response.status(400).json({ success: false, message: "Status must be approved or rejected" });
    return;
  }

  let client: PoolClient;
  try {
    client = await pool.connect();
  } catch (error) {
    unavailable(response, error, "decision");
    return;
  }

  try {
    await client.query("BEGIN");

    const existing = await client.query<{
      employee_id: number; status: string; leave_type: LeaveType;
      leave_year: number | null; working_days: string | null;
      start_date: string; end_date: string;
    }>(
      `SELECT employee_id, status, leave_type, leave_year, working_days,
              start_date::text, end_date::text
       FROM public.leave_requests WHERE id = $1 FOR UPDATE`,
      [leaveId],
    );

    const leave = existing.rows[0];
    if (!leave) {
      await safeRollback(client);
      response.status(404).json({ success: false, message: "Leave request not found" });
      return;
    }

    const actor = request.user!;

    // Nobody decides their own request - not a manager, and not an
    // administrator whose account is linked to an employee record either.
    if (actor.employeeId !== null && Number(leave.employee_id) === actor.employeeId) {
      await safeRollback(client);
      response.status(403).json({
        success: false,
        code: "own_request",
        message: "You cannot decide your own leave request.",
      });
      return;
    }

    // A manager decides only for a current direct report. Checked here, inside
    // the transaction that holds the request's lock, against the reporting line
    // as it is now - not as it was when the manager's page loaded. Anything
    // else is "not found", so a request outside the team is not confirmed to
    // exist.
    const viaManagerScope = actor.role !== "admin";
    if (viaManagerScope
        && (actor.employeeId === null
          || !(await isTeamMember(actor.employeeId, Number(leave.employee_id), client)))) {
      await safeRollback(client);
      response.status(404).json({ success: false, message: "Leave request not found" });
      return;
    }

    if (leave.status !== "pending") {
      await safeRollback(client);
      response.status(409).json({
        success: false,
        code: "already_decided",
        message: `This request was already ${leave.status}. Only a pending request can be decided.`,
      });
      return;
    }

    await lockEmployeeLeave(client, leave.employee_id);

    // Re-check the balance at the moment of approval: other requests may have
    // been approved since this one was submitted.
    if (status === "approved") {
      const policies = await loadPolicies(client);
      const policy = policies.get(leave.leave_type);
      const days = Number(leave.working_days ?? 0);
      const year = leave.leave_year;

      if (policy?.deducts_balance && year !== null) {
        const balances = await getBalances(client, leave.employee_id, year);
        const balance = balances.find((entry) => entry.leaveType === leave.leave_type);
        // This request's own days are still counted as pending, so add them back
        // before comparing; otherwise the request is measured against itself.
        const availableExcludingThis = round1((balance?.availableDays ?? 0) + days);

        if (balance && days > availableExcludingThis) {
          await safeRollback(client);
          response.status(409).json({
            success: false,
            code: "insufficient_balance",
            message:
              `Approving this would exceed the ${leave.leave_type} balance for ${year}: ` +
              `${days} day${days === 1 ? "" : "s"} requested, ${availableExcludingThis} available.`,
          });
          return;
        }
      }
    }

    const updated = await client.query(
      `UPDATE public.leave_requests
       SET status = $1, admin_comment = $2, reviewed_by = $3,
           reviewed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE id = $4 AND status = 'pending'
       RETURNING ${leaveColumns}`,
      [status, adminComment, request.user!.id, leaveId],
    );

    if (updated.rowCount === 0) {
      await safeRollback(client);
      response.status(409).json({
        success: false,
        code: "already_decided",
        message: "This request was decided by someone else. Reload to see its current status.",
      });
      return;
    }

    const decided = updated.rows[0];
    await recordAudit({
      actor: {
        ...actorFromUser(request.user, request.user?.email),
        // Says which authority was exercised: "manager" when decided through
        // team scope, so the log can tell it apart from an HR decision.
        role: actingRole(actor, viaManagerScope),
      },
      action: status === "approved" ? "LEAVE_APPROVED" : "LEAVE_REJECTED",
      entityType: "leave",
      entityId: leaveId,
      summary:
        `${status === "approved" ? "Approved" : "Rejected"} ${decided.leave_type} leave ` +
        `for employee #${decided.employee_id}, ${decided.start_date} to ${decided.end_date}`,
      changes: {
        status: { before: "pending", after: status },
        working_days: decided.working_days,
        admin_comment: adminComment ?? null,
      },
    }, client);

    await client.query("COMMIT");

    response.status(200).json({
      success: true,
      message: `Leave request ${status} successfully`,
      data: { leave: decided },
    });
  } catch (error) {
    await safeRollback(client);
    unavailable(response, error, "decision");
  } finally {
    client.release();
  }
}

/**
 * Cancels a request, releasing its days.
 *
 * An employee may cancel their own request; an administrator may cancel anyone's.
 * A request that has already started cannot be cancelled, because the days have
 * been taken -- an administrator corrects those through a reversal instead. The
 * row is kept and marked, never deleted, so history stays intact.
 */
export async function cancelLeaveRequest(
  request: Request,
  response: Response,
): Promise<void> {
  const leaveId = parseIdParam(request.params.id);
  if (leaveId === null) {
    response.status(400).json({ success: false, message: "Invalid leave request ID" });
    return;
  }

  const isAdmin = request.user?.role === "admin";
  let client: PoolClient;

  try {
    client = await pool.connect();
  } catch (error) {
    unavailable(response, error, "cancellation");
    return;
  }

  try {
    await client.query("BEGIN");

    const existing = await client.query<{
      employee_id: number; status: string; start_date: string;
    }>(
      `SELECT employee_id, status, start_date::text
       FROM public.leave_requests WHERE id = $1 FOR UPDATE`,
      [leaveId],
    );

    const leave = existing.rows[0];
    if (!leave) {
      await safeRollback(client);
      response.status(404).json({ success: false, message: "Leave request not found" });
      return;
    }

    if (!isAdmin && leave.employee_id !== request.user?.employeeId) {
      await safeRollback(client);
      // Not found rather than forbidden: another employee's request should not be
      // confirmed to exist.
      response.status(404).json({ success: false, message: "Leave request not found" });
      return;
    }

    if (leave.status === "cancelled") {
      await safeRollback(client);
      response.status(409).json({
        success: false, code: "already_cancelled",
        message: "This request is already cancelled.",
      });
      return;
    }

    if (leave.status === "rejected") {
      await safeRollback(client);
      response.status(409).json({
        success: false, code: "already_decided",
        message: "A rejected request cannot be cancelled; it already consumes nothing.",
      });
      return;
    }

    const today = getZonedNow((await loadLeaveSettings(client))?.timezone ?? "UTC").date;
    if (leave.start_date <= today) {
      await safeRollback(client);
      response.status(409).json({
        success: false,
        code: "already_started",
        message: "Leave that has already started cannot be cancelled. Ask an administrator to correct it.",
      });
      return;
    }

    const updated = await client.query(
      `UPDATE public.leave_requests
       SET status = 'cancelled', cancelled_at = CURRENT_TIMESTAMP, cancelled_by = $2,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND status IN ('pending', 'approved')
       RETURNING ${leaveColumns}`,
      [leaveId, request.user!.id],
    );

    if (updated.rowCount === 0) {
      await safeRollback(client);
      response.status(409).json({
        success: false,
        message: "This request changed while you were cancelling it. Reload to see its current status.",
      });
      return;
    }

    const cancelled = updated.rows[0];
    await recordAudit({
      actor: actorFromUser(request.user, request.user?.email),
      action: "LEAVE_CANCELLED",
      entityType: "leave",
      entityId: leaveId,
      summary:
        `Cancelled ${cancelled.leave_type} leave for employee #${cancelled.employee_id}, ` +
        `${cancelled.start_date} to ${cancelled.end_date}`,
      changes: { status: { before: "pending or approved", after: "cancelled" } },
    }, client);

    await client.query("COMMIT");

    response.status(200).json({
      success: true,
      message: "Leave request cancelled. Its days are available again.",
      data: { leave: cancelled },
    });
  } catch (error) {
    await safeRollback(client);
    unavailable(response, error, "cancellation");
  } finally {
    client.release();
  }
}

// ------------------------------------------------------- admin management

export async function getLeavePolicies(_request: Request, response: Response): Promise<void> {
  try {
    const result = await pool.query(
      `SELECT leave_type, default_annual_days, deducts_balance, is_paid, active
       FROM public.leave_policies ORDER BY leave_type`,
    );
    response.status(200).json({ success: true, data: { policies: result.rows } });
  } catch (error) {
    unavailable(response, error, "policy lookup");
  }
}

export async function updateLeavePolicy(request: Request, response: Response): Promise<void> {
  const leaveType = String(request.params.leaveType ?? "");
  if (!leaveTypes.includes(leaveType as LeaveType)) {
    response.status(404).json({ success: false, message: "Unknown leave type" });
    return;
  }

  const body = (request.body ?? {}) as Record<string, unknown>;
  const unsupported = Object.keys(body).filter(
    (key) => !["defaultAnnualDays", "deductsBalance", "isPaid", "active"].includes(key),
  );
  if (unsupported.length > 0) {
    response.status(400).json({
      success: false,
      message: `The request contains unsupported fields: ${unsupported.sort().join(", ")}.`,
    });
    return;
  }

  const days = body.defaultAnnualDays;
  if (typeof days !== "number" || !Number.isFinite(days) || days < 0 || days > 366) {
    response.status(400).json({ success: false, message: "Enter a default of 0 to 366 days." });
    return;
  }
  for (const flag of ["deductsBalance", "isPaid", "active"]) {
    if (body[flag] !== undefined && typeof body[flag] !== "boolean") {
      response.status(400).json({ success: false, message: `${flag} must be true or false.` });
      return;
    }
  }

  try {
    const result = await pool.query(
      `UPDATE public.leave_policies
       SET default_annual_days = $2,
           deducts_balance = COALESCE($3, deducts_balance),
           is_paid = COALESCE($4, is_paid),
           active = COALESCE($5, active),
           updated_at = CURRENT_TIMESTAMP
       WHERE leave_type = $1
       RETURNING leave_type, default_annual_days, deducts_balance, is_paid, active`,
      [leaveType, round1(days), body.deductsBalance ?? null, body.isPaid ?? null, body.active ?? null],
    );

    const policy = result.rows[0];
    await recordAudit({
      actor: actorFromUser(request.user, request.user?.email),
      action: "LEAVE_POLICY_CHANGED",
      entityType: "leave_policy",
      entityId: leaveType,
      summary: `Changed the ${leaveType} leave policy`,
      changes: {
        default_annual_days: policy?.default_annual_days ?? null,
        deducts_balance: policy?.deducts_balance ?? null,
        is_paid: policy?.is_paid ?? null,
        active: policy?.active ?? null,
      },
    });

    response.status(200).json({
      success: true,
      message: "Leave policy updated. Existing grants are unchanged.",
      data: { policy },
    });
  } catch (error) {
    unavailable(response, error, "policy update");
  }
}

/** An administrator's view of one employee's balances and grants. */
export async function getEmployeeLeaveBalances(
  request: Request,
  response: Response,
): Promise<void> {
  const employeeId = parseIdParam(request.params.employeeId);
  if (employeeId === null) {
    response.status(400).json({ success: false, message: "Invalid employee ID" });
    return;
  }

  let client: PoolClient;
  try {
    client = await pool.connect();
  } catch (error) {
    unavailable(response, error, "balance lookup");
    return;
  }

  try {
    const year = Number(request.query.year ?? await currentLeaveYear(client));
    if (!Number.isSafeInteger(year) || year < 1900 || year > 2999) {
      response.status(400).json({ success: false, message: "Invalid leave year." });
      return;
    }

    const employee = await client.query("SELECT id FROM public.employees WHERE id = $1", [employeeId]);
    if (employee.rowCount === 0) {
      response.status(404).json({ success: false, message: "Employee not found" });
      return;
    }

    await client.query("BEGIN");
    await ensureEntitlements(client, employeeId, year);
    await client.query("COMMIT");

    const [balances, grants] = await Promise.all([
      getBalances(client, employeeId, year),
      client.query(
        `SELECT leave_type, entitled_days, carried_forward_days, adjustment_days, source, note
         FROM public.leave_entitlements WHERE employee_id = $1 AND leave_year = $2
         ORDER BY leave_type`,
        [employeeId, year],
      ),
    ]);

    response.status(200).json({
      success: true,
      data: { employeeId, leaveYear: year, balances, entitlements: grants.rows },
    });
  } catch (error) {
    await safeRollback(client);
    unavailable(response, error, "balance lookup");
  } finally {
    client.release();
  }
}

/** Creates or replaces one grant. Usage is never touched. */
export async function setEmployeeEntitlement(
  request: Request,
  response: Response,
): Promise<void> {
  const employeeId = parseIdParam(request.params.employeeId);
  if (employeeId === null) {
    response.status(400).json({ success: false, message: "Invalid employee ID" });
    return;
  }

  const body = (request.body ?? {}) as Record<string, unknown>;
  const allowed = ["leaveYear", "leaveType", "entitledDays", "carriedForwardDays", "adjustmentDays", "note"];
  const unsupported = Object.keys(body).filter((key) => !allowed.includes(key));
  if (unsupported.length > 0) {
    response.status(400).json({
      success: false,
      message: `The request contains unsupported fields: ${unsupported.sort().join(", ")}.`,
    });
    return;
  }

  const errors: Record<string, string> = {};
  const year = body.leaveYear;
  if (typeof year !== "number" || !Number.isSafeInteger(year) || year < 1900 || year > 2999) {
    errors.leaveYear = "Enter a leave year between 1900 and 2999.";
  }
  const leaveType = typeof body.leaveType === "string" ? body.leaveType : "";
  if (!leaveTypes.includes(leaveType as LeaveType)) {
    errors.leaveType = `Leave type must be one of: ${leaveTypes.join(", ")}.`;
  }

  const number = (field: string, min: number, max: number) => {
    const raw = body[field];
    if (raw === undefined) return 0;
    if (typeof raw !== "number" || !Number.isFinite(raw) || raw < min || raw > max) {
      errors[field] = `Enter a number from ${min} to ${max}.`;
      return 0;
    }
    return raw;
  };
  const entitledDays = number("entitledDays", 0, 366);
  const carriedForwardDays = number("carriedForwardDays", 0, 366);
  const adjustmentDays = number("adjustmentDays", -366, 366);

  if (round1(entitledDays + carriedForwardDays + adjustmentDays) < 0) {
    errors.adjustmentDays = "The total grant cannot be negative.";
  }
  const note = typeof body.note === "string" ? body.note.trim().slice(0, 1000) || null : null;

  if (Object.keys(errors).length > 0) {
    response.status(400).json({ success: false, message: "Check the highlighted fields.", errors });
    return;
  }

  let client: PoolClient;
  try {
    client = await pool.connect();
  } catch (error) {
    unavailable(response, error, "entitlement update");
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

    await lockEmployeeLeave(client, employeeId);
    const entitlement = await upsertEntitlement(client, {
      employeeId,
      leaveYear: year as number,
      leaveType: leaveType as LeaveType,
      entitledDays,
      carriedForwardDays,
      adjustmentDays,
      source: "manual",
      note,
    });
    await recordAudit({
      actor: actorFromUser(request.user, request.user?.email),
      action: "LEAVE_ENTITLEMENT_CHANGED",
      entityType: "leave",
      entityId: employeeId,
      summary: `Set the ${leaveType} entitlement for employee #${employeeId} in ${year}`,
      changes: {
        leave_type: leaveType,
        leave_year: year,
        entitled_days: entitledDays,
        carried_forward_days: carriedForwardDays,
        adjustment_days: adjustmentDays,
      },
    }, client);

    await client.query("COMMIT");

    response.status(200).json({
      success: true,
      message: "Entitlement saved. Days already taken are unaffected.",
      data: { entitlement },
    });
  } catch (error) {
    await safeRollback(client);
    unavailable(response, error, "entitlement update");
  } finally {
    client.release();
  }
}

/**
 * Unpaid leave in a period, for payroll.
 *
 * Exposed now so payroll consumes one agreed definition rather than
 * reimplementing which leave types cost money.
 */
export async function getUnpaidLeaveSummary(
  request: Request,
  response: Response,
): Promise<void> {
  const employeeId = parseIdParam(request.params.employeeId);
  const startDate = String(request.query.startDate ?? "");
  const endDate = String(request.query.endDate ?? "");

  if (employeeId === null) {
    response.status(400).json({ success: false, message: "Invalid employee ID" });
    return;
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
    response.status(400).json({ success: false, message: "Provide startDate and endDate as YYYY-MM-DD." });
    return;
  }
  if (startDate > endDate) {
    response.status(400).json({ success: false, message: "startDate cannot be after endDate." });
    return;
  }

  try {
    // The configured working week decides which days inside the window count.
    const settings = await loadLeaveSettings(pool);
    const days = await getUnpaidLeaveDays(
      pool, employeeId, startDate, endDate, settings?.working_days ?? [1, 2, 3, 4, 5],
    );
    response.status(200).json({
      success: true,
      data: { employeeId, startDate, endDate, unpaidLeaveDays: days },
    });
  } catch (error) {
    unavailable(response, error, "unpaid leave lookup");
  }
}
