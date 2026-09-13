/**
 * The one way an employee's employment status and their account's activity
 * change together.
 *
 * Moved here unchanged from the employee controller in V3 M4, so HR's
 * deactivate/reactivate actions and a completed offboarding plan go through
 * exactly the same statements under exactly the same lock order (employees,
 * then users). Two paths to the same state could otherwise disagree about
 * whether an account should still sign in.
 */
import type { PoolClient } from "pg";
import { isEmployeeAccountActive } from "../utils/employeeValidation.js";

/**
 * Applies employment status and linked account activity together, under the same
 * lock order used by every lifecycle path (employees, then users), so a competing
 * edit/deactivate/reactivate serializes instead of leaving a mismatched account.
 */
export async function applyLifecycle(
  client: PoolClient,
  employeeId: number,
  status: string,
): Promise<void> {
  await client.query(
    `UPDATE employees
     SET employment_status = $1, updated_at = CURRENT_TIMESTAMP
     WHERE id = $2`,
    [status, employeeId],
  );

  await client.query(
    `UPDATE users
     SET is_active = $1, updated_at = CURRENT_TIMESTAMP
     WHERE employee_id = $2`,
    [isEmployeeAccountActive(status), employeeId],
  );
}

/** Locks the employee row and its linked account in a fixed order. */
export async function lockEmployee(
  client: PoolClient,
  employeeId: number,
): Promise<{
  found: boolean;
  employmentStatus?: string;
  userId?: number | null;
  before?: Record<string, unknown>;
}> {
  // The whole row, not just the status: an audit entry has to say what actually
  // changed, and that needs the values as they were before the write.
  const employee = await client.query<Record<string, unknown> & { employment_status: string }>(
    "SELECT * FROM employees WHERE id = $1 FOR UPDATE",
    [employeeId],
  );

  const row = employee.rows[0];
  if (!row) return { found: false };

  const account = await client.query<{ id: number }>(
    "SELECT id FROM users WHERE employee_id = $1 FOR UPDATE",
    [employeeId],
  );

  return {
    found: true,
    employmentStatus: row.employment_status,
    userId: account.rows[0]?.id ?? null,
    before: row,
  };
}

