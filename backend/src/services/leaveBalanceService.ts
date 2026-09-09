import type { PoolClient } from "pg";
import {
  buildBalance,
  leaveTypes,
  round1,
  type LeaveBalance,
  type LeaveType,
} from "../utils/leaveCalculation.js";

export interface LeavePolicy {
  leave_type: LeaveType;
  default_annual_days: string | number;
  deducts_balance: boolean;
  is_paid: boolean;
  active: boolean;
}

export interface LeaveEntitlementRow {
  id: string;
  employee_id: number;
  leave_year: number;
  leave_type: LeaveType;
  entitled_days: string | number;
  carried_forward_days: string | number;
  adjustment_days: string | number;
  source: string;
  note: string | null;
}

/** NUMERIC arrives as a string from pg; every balance figure goes through this. */
const num = (value: unknown): number => (value === null || value === undefined ? 0 : Number(value));

/**
 * Serialises every balance-affecting operation for one employee.
 *
 * A transaction-scoped advisory lock, so two simultaneous submissions cannot both
 * pass an overlap or balance check. Released automatically at commit or rollback,
 * and keyed on leave alone so it never contends with employee record edits.
 */
export async function lockEmployeeLeave(client: PoolClient, employeeId: number): Promise<void> {
  await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`leave:${employeeId}`]);
}

export async function loadPolicies(
  db: Pick<PoolClient, "query">,
): Promise<Map<LeaveType, LeavePolicy>> {
  const result = await db.query<LeavePolicy>(
    "SELECT leave_type, default_annual_days, deducts_balance, is_paid, active FROM public.leave_policies",
  );
  return new Map(result.rows.map((row) => [row.leave_type, row]));
}

/**
 * Balances for one employee and leave year.
 *
 * Usage is derived from the requests themselves rather than stored, so approving
 * the same request twice cannot deduct twice. Cancelled and rejected requests
 * contribute nothing.
 */
export async function getBalances(
  db: Pick<PoolClient, "query">,
  employeeId: number,
  leaveYear: number,
): Promise<LeaveBalance[]> {
  const policies = await loadPolicies(db);

  const grants = await db.query<{ leave_type: LeaveType; granted: string }>(
    `SELECT leave_type,
            (entitled_days + carried_forward_days + adjustment_days) AS granted
     FROM public.leave_entitlements
     WHERE employee_id = $1 AND leave_year = $2`,
    [employeeId, leaveYear],
  );
  const grantByType = new Map(grants.rows.map((row) => [row.leave_type, num(row.granted)]));

  const usage = await db.query<{ leave_type: LeaveType; status: string; days: string }>(
    `SELECT leave_type, status, COALESCE(SUM(working_days), 0) AS days
     FROM public.leave_requests
     WHERE employee_id = $1 AND leave_year = $2 AND status IN ('approved', 'pending')
     GROUP BY leave_type, status`,
    [employeeId, leaveYear],
  );

  const used = new Map<LeaveType, number>();
  const pending = new Map<LeaveType, number>();
  for (const row of usage.rows) {
    const target = row.status === "approved" ? used : pending;
    target.set(row.leave_type, num(row.days));
  }

  return leaveTypes
    .filter((type) => policies.get(type)?.active !== false)
    .map((type) => {
      const policy = policies.get(type);
      return buildBalance(
        type,
        grantByType.get(type) ?? 0,
        used.get(type) ?? 0,
        pending.get(type) ?? 0,
        {
          deductsBalance: policy?.deducts_balance ?? true,
          isPaid: policy?.is_paid ?? true,
        },
      );
    });
}

export interface OverlapRow {
  id: number;
  start_date: string;
  end_date: string;
  status: string;
}

/**
 * Existing requests that would collide with a proposed range.
 *
 * Only pending and approved requests block: a rejected or cancelled request has
 * released its days. Call after lockEmployeeLeave so the answer cannot go stale.
 */
export async function findOverlapping(
  client: PoolClient,
  employeeId: number,
  startDate: string,
  endDate: string,
  excludeRequestId?: number,
): Promise<OverlapRow[]> {
  const result = await client.query<OverlapRow>(
    `SELECT id, start_date::text, end_date::text, status
     FROM public.leave_requests
     WHERE employee_id = $1
       AND status IN ('pending', 'approved')
       AND start_date <= $3::date AND end_date >= $2::date
       AND ($4::int IS NULL OR id <> $4)
     ORDER BY start_date`,
    [employeeId, startDate, endDate, excludeRequestId ?? null],
  );
  return result.rows;
}

/**
 * Applies the company default grant for a year if the employee has none yet.
 *
 * Idempotent: an existing grant is never overwritten, so a manual adjustment or
 * an imported opening balance always wins over the default.
 */
export async function ensureEntitlements(
  client: PoolClient,
  employeeId: number,
  leaveYear: number,
): Promise<void> {
  await client.query(
    `INSERT INTO public.leave_entitlements
       (employee_id, leave_year, leave_type, entitled_days, source, note)
     SELECT $1, $2, p.leave_type, p.default_annual_days, 'policy',
            'Applied from the company default policy'
     FROM public.leave_policies p
     WHERE p.active = TRUE
     ON CONFLICT (employee_id, leave_year, leave_type) DO NOTHING`,
    [employeeId, leaveYear],
  );
}

export interface EntitlementUpsert {
  employeeId: number;
  leaveYear: number;
  leaveType: LeaveType;
  entitledDays: number;
  carriedForwardDays: number;
  adjustmentDays: number;
  source: "policy" | "opening_balance" | "import" | "manual";
  note: string | null;
}

/**
 * Creates or replaces one grant.
 *
 * Grants are the only stored figure; usage is never written, so this cannot
 * corrupt a balance by double counting.
 */
export async function upsertEntitlement(
  client: PoolClient,
  input: EntitlementUpsert,
): Promise<LeaveEntitlementRow> {
  const result = await client.query<LeaveEntitlementRow>(
    `INSERT INTO public.leave_entitlements
       (employee_id, leave_year, leave_type, entitled_days, carried_forward_days,
        adjustment_days, source, note)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     ON CONFLICT (employee_id, leave_year, leave_type) DO UPDATE SET
       entitled_days = EXCLUDED.entitled_days,
       carried_forward_days = EXCLUDED.carried_forward_days,
       adjustment_days = EXCLUDED.adjustment_days,
       source = EXCLUDED.source,
       note = EXCLUDED.note,
       updated_at = CURRENT_TIMESTAMP
     RETURNING *`,
    [
      input.employeeId, input.leaveYear, input.leaveType,
      round1(input.entitledDays), round1(input.carriedForwardDays),
      round1(input.adjustmentDays), input.source, input.note,
    ],
  );
  return result.rows[0]!;
}

/**
 * Unpaid leave actually taken in a period, for payroll to consume later.
 *
 * Reads only approved requests of types the policy marks unpaid, so payroll never
 * has to reimplement which leave costs money.
 */
export async function getUnpaidLeaveDays(
  db: Pick<PoolClient, "query">,
  employeeId: number,
  startDate: string,
  endDate: string,
): Promise<number> {
  const result = await db.query<{ days: string }>(
    `SELECT COALESCE(SUM(r.working_days), 0) AS days
     FROM public.leave_requests r
     JOIN public.leave_policies p ON p.leave_type = r.leave_type
     WHERE r.employee_id = $1
       AND r.status = 'approved'
       AND p.is_paid = FALSE
       AND r.start_date <= $3::date AND r.end_date >= $2::date`,
    [employeeId, startDate, endDate],
  );
  return round1(num(result.rows[0]?.days));
}

export interface LeaveSettings {
  timezone: string;
  working_days: number[];
}

/** The working week and clock leave is judged against. Null when unconfigured. */
export async function loadLeaveSettings(
  db: Pick<PoolClient, "query">,
): Promise<LeaveSettings | null> {
  const result = await db.query<LeaveSettings>(
    "SELECT timezone, working_days FROM public.company_settings WHERE id = 1",
  );
  return result.rows[0] ?? null;
}
