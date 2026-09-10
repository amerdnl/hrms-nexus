import type { PoolClient } from "pg";
import pool from "../config/db.js";
import { getZonedNow } from "../utils/attendanceVerification.js";
import type { LeaveBalance, LeaveType } from "../utils/leaveCalculation.js";
import { ensureEntitlements, getBalances } from "./leaveBalanceService.js";

/**
 * The employee dashboard is assembled entirely from the authenticated session.
 *
 * Nothing here accepts an employee identifier from the caller: the employee is
 * resolved from the signed-in user's own row, so there is no parameter an
 * employee could change to read a colleague's attendance, leave or pay.
 */

/** Sections that may be missing without the dashboard itself being a failure. */
export type DashboardSection = "leaveBalances" | "payslip";

export interface DashboardProfile {
  id: number;
  fullName: string;
  employeeNumber: string;
  jobTitle: string | null;
  departmentName: string | null;
  employmentStatus: string;
  employmentDate: string | null;
  profileImage: string | null;
}

/**
 * Deliberately narrower than `AttendanceRecord`.
 *
 * The shared mapper carries latitude, longitude, accuracy and distance from the
 * office. None of that belongs on a dashboard, so these queries name their
 * columns instead of selecting `*`: a column added to `attendance` later cannot
 * leak here by accident. `verificationStatus` is the coarse state the master
 * specification asks for ('verified' | 'manual' | 'exception') and reveals no
 * position, no distance and nothing about the QR secret.
 */
export interface DashboardAttendance {
  id: number;
  attendanceDate: string;
  checkInTime: string | null;
  checkOutTime: string | null;
  status: string;
  isManual: boolean;
  verificationStatus: string | null;
  lateMinutes: number | null;
}

export interface DashboardLeaveRequest {
  id: number;
  leaveType: LeaveType;
  startDate: string;
  endDate: string;
  status: string;
  workingDays: number | null;
  adminComment: string | null;
  reviewedAt: string | null;
  createdAt: string;
}

export interface DashboardPayslip {
  id: string;
  periodId: string;
  periodYear: number;
  periodMonth: number;
  status: string;
  /** Exact integer sen as text. Never a JavaScript number. */
  grossSen: string;
  deductionsSen: string;
  netSen: string;
  paidAt: string | null;
}

export interface EmployeeDashboard {
  /** The company's own calendar date, from the Company Settings timezone. */
  today: string;
  employee: DashboardProfile;
  todayAttendance: DashboardAttendance | null;
  recentAttendance: DashboardAttendance[];
  leaveYear: number | null;
  leaveBalances: LeaveBalance[] | null;
  pendingLeaveCount: number;
  upcomingLeave: DashboardLeaveRequest | null;
  recentLeaves: DashboardLeaveRequest[];
  latestPayslip: DashboardPayslip | null;
  /**
   * Sections that could not be read. The client shows "unavailable" for these
   * rather than an empty state: "we could not load your balance" and "you have
   * no balance" must never look the same.
   */
  unavailable: DashboardSection[];
}

const RECENT_ATTENDANCE_LIMIT = 7;
const RECENT_LEAVE_LIMIT = 5;

/**
 * Attendance columns that are safe to show. Listed once so today's record and
 * the recent list cannot drift apart, and so widening the exposure takes a
 * deliberate edit to this line.
 */
const attendanceColumns = `id, attendance_date::text AS attendance_date, check_in_time,
  check_out_time, status, is_manual, verification_status, late_minutes`;

const leaveColumns = `id, leave_type, start_date::text AS start_date, end_date::text AS end_date,
  status, working_days, admin_comment, reviewed_at, created_at`;

interface AttendanceRow {
  id: number | string;
  attendance_date: string;
  check_in_time: string | null;
  check_out_time: string | null;
  status: string;
  is_manual: boolean;
  verification_status: string | null;
  late_minutes: number | string | null;
}

interface LeaveRow {
  id: number | string;
  leave_type: LeaveType;
  start_date: string;
  end_date: string;
  status: string;
  working_days: number | string | null;
  admin_comment: string | null;
  reviewed_at: Date | string | null;
  created_at: Date | string;
}

const toNumber = (value: number | string | null): number | null =>
  value === null ? null : Number(value);

const toIso = (value: Date | string | null): string | null =>
  value === null ? null : new Date(value).toISOString();

function mapAttendance(row: AttendanceRow): DashboardAttendance {
  return {
    id: Number(row.id),
    attendanceDate: row.attendance_date,
    checkInTime: row.check_in_time,
    checkOutTime: row.check_out_time,
    status: row.status,
    isManual: row.is_manual,
    verificationStatus: row.verification_status,
    lateMinutes: toNumber(row.late_minutes),
  };
}

function mapLeave(row: LeaveRow): DashboardLeaveRequest {
  return {
    id: Number(row.id),
    leaveType: row.leave_type,
    startDate: row.start_date,
    endDate: row.end_date,
    status: row.status,
    workingDays: toNumber(row.working_days),
    adminComment: row.admin_comment,
    reviewedAt: toIso(row.reviewed_at),
    createdAt: toIso(row.created_at)!,
  };
}

/**
 * The company's date, not the database server's and not the browser's.
 *
 * Attendance decides which calendar day a clock action belongs to using the
 * Company Settings timezone. The dashboard has to agree with it, or across
 * midnight an employee is told they have not checked in on a day they have.
 */
async function companyToday(db: Pick<PoolClient, "query">): Promise<string> {
  const settings = await db.query<{ timezone: string }>(
    "SELECT timezone FROM public.company_settings WHERE id = 1",
  );
  try {
    return getZonedNow(settings.rows[0]?.timezone ?? "UTC").date;
  } catch {
    return getZonedNow("UTC").date;
  }
}

/**
 * Leave balances, materialising the default grant on first view so a new
 * employee sees a real entitlement rather than zeros. This reuses the same
 * `getBalances` rule the leave pages and reports use, so a balance can never
 * mean one thing on the dashboard and another on the leave page.
 */
async function loadLeave(
  employeeId: number,
  leaveYear: number,
): Promise<LeaveBalance[]> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    try {
      await ensureEntitlements(client, employeeId, leaveYear);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
    return await getBalances(client, employeeId, leaveYear);
  } finally {
    client.release();
  }
}

export async function buildEmployeeDashboard(
  userId: number,
): Promise<EmployeeDashboard | null> {
  // The independent reads go through the pool, not a single checked-out client:
  // `pg` serialises concurrent queries on one connection, so a shared client
  // would quietly turn this into a sequence. Only the leave balances need a
  // dedicated client, because they open a transaction.
  const employeeResult = await pool.query(
    `SELECT e.id, e.full_name, e.employee_number, e.job_title,
            e.employment_status, e.employment_date::text AS employment_date,
            e.profile_image, d.name AS department_name
     FROM public.users u
     JOIN public.employees e ON e.id = u.employee_id
     LEFT JOIN public.departments d ON d.id = e.department_id
     WHERE u.id = $1`,
    [userId],
  );

  // The employee is found through the session's user row. An employee ID is
  // never read from the request.
  const row = employeeResult.rows[0];
  if (!row) return null;

  const employeeId = Number(row.id);
  const today = await companyToday(pool);
  const leaveYear = Number(today.slice(0, 4));
  const unavailable: DashboardSection[] = [];

  const [
    todayAttendance,
    recentAttendance,
    pendingCount,
    upcoming,
    recentLeaves,
    payslip,
  ] = await Promise.all([
    pool.query<AttendanceRow>(
      `SELECT ${attendanceColumns} FROM public.attendance
       WHERE employee_id = $1 AND attendance_date = $2::date LIMIT 1`,
      [employeeId, today],
    ),

    pool.query<AttendanceRow>(
      `SELECT ${attendanceColumns} FROM public.attendance
       WHERE employee_id = $1
       ORDER BY attendance_date DESC
       LIMIT ${RECENT_ATTENDANCE_LIMIT}`,
      [employeeId],
    ),

    pool.query<{ count: number }>(
      `SELECT COUNT(*)::int AS count FROM public.leave_requests
       WHERE employee_id = $1 AND status = 'pending'`,
      [employeeId],
    ),

    // Upcoming leave is decided by the server against the company's date. It
    // was previously computed in the browser from the device clock, which
    // disagreed with the company timezone for anyone travelling.
    pool.query<LeaveRow>(
      `SELECT ${leaveColumns} FROM public.leave_requests
       WHERE employee_id = $1 AND status = 'approved' AND end_date >= $2::date
       ORDER BY start_date ASC
       LIMIT 1`,
      [employeeId, today],
    ),

    pool.query<LeaveRow>(
      `SELECT ${leaveColumns} FROM public.leave_requests
       WHERE employee_id = $1
       ORDER BY created_at DESC
       LIMIT ${RECENT_LEAVE_LIMIT}`,
      [employeeId],
    ),

    // Only an approved or paid period is a payslip. Draft, calculated and
    // reviewed payroll is working material and is never shown to the employee
    // it concerns; this is the same predicate the payslip endpoints use.
    pool.query(
      `SELECT r.id::text, r.period_id::text, p.period_year, p.period_month, p.status,
              r.gross_sen::text, r.deductions_sen::text, r.net_sen::text, p.paid_at
       FROM public.payroll_records r
       JOIN public.payroll_periods p ON p.id = r.period_id
       WHERE r.employee_id = $1 AND p.status IN ('approved', 'paid')
       ORDER BY p.period_year DESC, p.period_month DESC
       LIMIT 1`,
      [employeeId],
    ).catch((error: unknown) => {
      // A missing payslip and an unreadable one must not look the same, so the
      // failure is carried rather than collapsed into "none".
      console.error("Employee dashboard payslip lookup failed:", error);
      unavailable.push("payslip");
      return null;
    }),
  ]);

  let leaveBalances: LeaveBalance[] | null = null;
  try {
    leaveBalances = await loadLeave(employeeId, leaveYear);
  } catch (error) {
    console.error("Employee dashboard leave balances failed:", error);
    unavailable.push("leaveBalances");
  }

  const slip = payslip?.rows[0] ?? null;

  return {
    today,
    employee: {
      id: employeeId,
      fullName: row.full_name,
      employeeNumber: row.employee_number,
      jobTitle: row.job_title,
      departmentName: row.department_name,
      employmentStatus: row.employment_status,
      employmentDate: row.employment_date,
      profileImage: row.profile_image,
    },
    todayAttendance: todayAttendance.rows[0]
      ? mapAttendance(todayAttendance.rows[0])
      : null,
    recentAttendance: recentAttendance.rows.map(mapAttendance),
    leaveYear: leaveBalances ? leaveYear : null,
    leaveBalances,
    // COUNT(*) always returns a row; the fallback satisfies the compiler
    // without inventing a number where a real one is missing.
    pendingLeaveCount: pendingCount.rows[0]?.count ?? 0,
    upcomingLeave: upcoming.rows[0] ? mapLeave(upcoming.rows[0]) : null,
    recentLeaves: recentLeaves.rows.map(mapLeave),
    latestPayslip: slip
      ? {
          id: slip.id,
          periodId: slip.period_id,
          periodYear: slip.period_year,
          periodMonth: slip.period_month,
          status: slip.status,
          grossSen: slip.gross_sen,
          deductionsSen: slip.deductions_sen,
          netSen: slip.net_sen,
          paidAt: toIso(slip.paid_at),
        }
      : null,
    unavailable,
  };
}
