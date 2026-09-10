/**
 * Writing and reading the audit trail.
 *
 * Two rules shape everything here:
 *
 * 1. **An audit write must never break the action it records, and must never
 *    silently destroy it either.** Where the caller owns a transaction the entry
 *    joins it, so a rolled-back change leaves no entry claiming it happened.
 *
 *    That join is wrapped in a SAVEPOINT, and the reason matters: in PostgreSQL
 *    a failed statement poisons the whole transaction, so simply catching the
 *    error would turn the caller's COMMIT into a rollback. The business change
 *    would vanish while the API still answered 200 - which is exactly what
 *    happened before this was fixed, on a database where audit_events did not
 *    yet exist. The savepoint confines the failure to the audit insert, so the
 *    change still commits and only the entry is lost.
 * 2. **Nothing sensitive reaches the table.** Every change set goes through
 *    `fitChanges`, which redacts by key name and enforces the same 8 KB ceiling
 *    the database checks.
 */
import type { Pool, PoolClient } from "pg";
import pool from "../config/db.js";
import type { AuthenticatedUser } from "../types/auth.js";
import { fitChanges } from "../utils/auditRedaction.js";

type Db = Pick<PoolClient, "query"> | Pool;

/**
 * The actions this system records. A closed list rather than free text, so the
 * log stays filterable and a typo cannot invent a new category.
 */
export const auditActions = [
  "LOGIN",
  "LOGIN_FAILED",
  "LOGOUT",
  "PASSWORD_CHANGED",
  "EMPLOYEE_CREATED",
  "EMPLOYEE_UPDATED",
  "EMPLOYEE_DEACTIVATED",
  "EMPLOYEE_REACTIVATED",
  "DEPARTMENT_CREATED",
  "DEPARTMENT_UPDATED",
  "DEPARTMENT_DELETED",
  "SETTINGS_CHANGED",
  "IMPORT_STARTED",
  "IMPORT_COMPLETED",
  "IMPORT_FAILED",
  "ATTENDANCE_CORRECTED",
  "ATTENDANCE_MANUAL_CREATED",
  "LEAVE_APPROVED",
  "LEAVE_REJECTED",
  "LEAVE_CANCELLED",
  "LEAVE_POLICY_CHANGED",
  "LEAVE_ENTITLEMENT_CHANGED",
  "SALARY_CHANGED",
  "PAYROLL_PERIOD_OPENED",
  "PAYROLL_CALCULATED",
  "PAYROLL_STATE_CHANGED",
  "PAYROLL_APPROVED",
  "PAYROLL_PAID",
  "PAYROLL_LINE_ADDED",
  "PAYROLL_LINE_REMOVED",
  "DATA_EXPORTED",
] as const;

export type AuditAction = (typeof auditActions)[number];

export const auditEntityTypes = [
  "auth", "employee", "department", "settings", "import",
  "attendance", "leave", "leave_policy", "compensation", "payroll", "export",
] as const;

export type AuditEntityType = (typeof auditEntityTypes)[number];

export interface AuditActor {
  userId: number | null;
  employeeId: number | null;
  /** Snapshot label, normally the account email. */
  label: string;
  role: string | null;
}

export interface AuditInput {
  actor: AuditActor;
  action: AuditAction;
  entityType: AuditEntityType;
  entityId?: string | number | null;
  summary: string;
  changes?: unknown;
  outcome?: "success" | "failure";
}

/** Builds an actor from an authenticated request, with a readable label. */
export function actorFromUser(
  user: AuthenticatedUser | undefined,
  label: string | null | undefined,
): AuditActor {
  if (!user) {
    return { userId: null, employeeId: null, label: label ?? "anonymous", role: null };
  }
  return {
    userId: user.id,
    employeeId: user.employeeId,
    label: label ?? `user #${user.id}`,
    role: user.role,
  };
}

/** An actor for something the system did on nobody's behalf. */
export const systemActor: AuditActor = {
  userId: null, employeeId: null, label: "System", role: null,
};

const MAX_LABEL = 160;
const MAX_SUMMARY = 500;
const MAX_ENTITY_ID = 64;

/**
 * Records one event.
 *
 * Pass `db` when the caller owns a transaction so the entry commits or rolls
 * back with the change it describes. Omit it and the write goes on the pool.
 */
export async function recordAudit(input: AuditInput, db: Db = pool): Promise<void> {
  // A PoolClient has release(); a Pool does not. Only the former can be inside a
  // caller's transaction, and only there is a savepoint meaningful.
  const transactional = "release" in db;

  try {
    if (transactional) await db.query("SAVEPOINT hr_nexus_audit");

    await db.query(
      `INSERT INTO public.audit_events
         (actor_user_id, actor_employee_id, actor_label, actor_role,
          action, entity_type, entity_id, summary, changes, outcome)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        input.actor.userId,
        input.actor.employeeId,
        // Untrusted input reaches actor_label on a failed sign-in, so it is
        // truncated here as well as bounded by the column.
        input.actor.label.slice(0, MAX_LABEL),
        input.actor.role,
        input.action,
        input.entityType,
        input.entityId === null || input.entityId === undefined
          ? null : String(input.entityId).slice(0, MAX_ENTITY_ID),
        input.summary.slice(0, MAX_SUMMARY),
        JSON.stringify(fitChanges(input.changes ?? null)),
        input.outcome ?? "success",
      ],
    );
    if (transactional) await db.query("RELEASE SAVEPOINT hr_nexus_audit");
  } catch (error) {
    // Losing an entry is bad; losing the change it describes would be worse, so
    // the failure is contained rather than propagated.
    console.error(`Audit write failed for ${input.action}:`, error);

    if (transactional) {
      try {
        await db.query("ROLLBACK TO SAVEPOINT hr_nexus_audit");
      } catch (rollbackError) {
        // The transaction is already unusable; the caller's own error handling
        // will see that and roll back properly.
        console.error("Audit savepoint rollback failed:", rollbackError);
      }
    }
  }
}

// ------------------------------------------------------------------ reading

export interface AuditQuery {
  action?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  actorUserId?: number | null;
  outcome?: string | null;
  from?: string | null;
  to?: string | null;
  limit: number;
  offset: number;
}

export interface AuditRow {
  id: string;
  occurred_at: string;
  actor_user_id: number | null;
  actor_label: string;
  actor_role: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  summary: string;
  changes: unknown;
  outcome: string;
}

/**
 * Reads a page of the log, newest first.
 *
 * Every filter is parameterised and every value the caller can influence has
 * already been validated against a closed list or parsed as a number by the
 * controller; nothing here interpolates user input into SQL.
 */
export async function listAudit(
  query: AuditQuery,
  db: Db = pool,
): Promise<{ rows: AuditRow[]; total: number }> {
  const parameters: unknown[] = [];
  const clauses: string[] = [];

  const add = (sql: string, value: unknown) => {
    parameters.push(value);
    clauses.push(sql.replace("$?", `$${parameters.length}`));
  };

  if (query.action) add("action = $?", query.action);
  if (query.entityType) add("entity_type = $?", query.entityType);
  if (query.entityId) add("entity_id = $?", query.entityId);
  if (query.actorUserId != null) add("actor_user_id = $?", query.actorUserId);
  if (query.outcome) add("outcome = $?", query.outcome);
  if (query.from) add("occurred_at >= $?::date", query.from);
  // Inclusive of the whole end day rather than midnight at its start.
  if (query.to) add("occurred_at < ($?::date + INTERVAL '1 day')", query.to);

  const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";

  const totals = await db.query<{ count: string }>(
    `SELECT count(*)::text AS count FROM public.audit_events ${where}`,
    parameters,
  );

  const rows = await db.query<AuditRow>(
    `SELECT id::text, occurred_at, actor_user_id, actor_label, actor_role,
            action, entity_type, entity_id, summary, changes, outcome
     FROM public.audit_events ${where}
     ORDER BY occurred_at DESC, id DESC
     LIMIT $${parameters.length + 1} OFFSET $${parameters.length + 2}`,
    [...parameters, query.limit, query.offset],
  );

  return { rows: rows.rows, total: Number(totals.rows[0]?.count ?? 0) };
}
