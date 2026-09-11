/**
 * Who may see what about whom.
 *
 * This is the one place V3 answers that question. Controllers ask it; they do
 * not re-derive it. Every function reads current data, so a relationship that
 * changed a moment ago is already reflected, and every function is default-deny:
 * an employee that does not exist, or is not visible to the caller, is `null`,
 * which callers turn into 404 so existence is not confirmed to a stranger.
 */
import type { Pool, PoolClient } from "pg";
import pool from "../config/db.js";
import type { AuthenticatedUser } from "../types/auth.js";

type Db = Pick<PoolClient, "query"> | Pool;

/**
 * Employment statuses that make someone part of the working company: visible in
 * the directory, able to sign in, and counted in a manager's team. Inactive,
 * resigned and terminated records are HR history, reachable only by HR.
 */
export const VISIBLE_STATUSES = ["active", "probation"] as const;

/**
 * The caller's relationship to an employee, most privileged first where two
 * apply - except that looking at yourself is always `self`, so a linked admin or
 * a manager reads their own record through the self-service layer.
 */
export type Relation = "self" | "admin" | "manager" | "coworker";

export async function relationTo(
  user: AuthenticatedUser,
  employeeId: number,
  db: Db = pool,
): Promise<Relation | null> {
  const result = await db.query<{ employment_status: string; manager_id: number | null }>(
    "SELECT employment_status, manager_id FROM public.employees WHERE id = $1",
    [employeeId],
  );
  const row = result.rows[0];
  if (!row) return null;

  if (user.employeeId !== null && user.employeeId === employeeId) return "self";
  if (user.role === "admin") return "admin";

  // Everyone below this line sees only the working company.
  if (!(VISIBLE_STATUSES as readonly string[]).includes(row.employment_status)) return null;

  if (user.employeeId !== null && row.manager_id !== null && Number(row.manager_id) === user.employeeId) {
    return "manager";
  }
  return "coworker";
}

/**
 * Whether `employeeId` is in `managerEmployeeId`'s team right now: a direct
 * report in a visible status. Direct reports only - the scope that decides leave
 * and reads team data does not reach down a whole branch.
 */
export async function isTeamMember(
  managerEmployeeId: number,
  employeeId: number,
  db: Db = pool,
): Promise<boolean> {
  const result = await db.query(
    `SELECT 1 FROM public.employees
     WHERE id = $1 AND manager_id = $2 AND employment_status = ANY($3::text[])`,
    [employeeId, managerEmployeeId, VISIBLE_STATUSES],
  );
  return (result.rowCount ?? 0) > 0;
}

/** The ids of a manager's current team, in a stable order. */
export async function teamMemberIds(
  managerEmployeeId: number,
  db: Db = pool,
): Promise<number[]> {
  const result = await db.query<{ id: string | number }>(
    `SELECT id FROM public.employees
     WHERE manager_id = $1 AND employment_status = ANY($2::text[])
     ORDER BY id`,
    [managerEmployeeId, VISIBLE_STATUSES],
  );
  return result.rows.map((row) => Number(row.id));
}

/**
 * The role label an audit entry should carry for an action taken through a
 * scope rather than a role: a manager approving a report's leave is recorded as
 * "manager", so the log says which authority was exercised.
 */
export function actingRole(user: AuthenticatedUser, viaManagerScope: boolean): string {
  if (user.role === "admin") return "admin";
  return viaManagerScope ? "manager" : user.role;
}
