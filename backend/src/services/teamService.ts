/**
 * The manager's team layer.
 *
 * Every query here is bounded to one manager's direct reports in a visible
 * status, and the bound is part of the SQL (`e.manager_id = $1`), never a
 * filter applied afterwards to a company-wide result. A manager's view of a
 * report is the team layer from the permission matrix: availability,
 * attendance state and times, leave with its type and reason, and nothing about
 * pay. Attendance coordinates, accuracy and distance are never selected.
 */
import type { Pool, PoolClient } from "pg";
import pool from "../config/db.js";
import { VISIBLE_STATUSES } from "../auth/policy.js";
import { getBalancesForEmployees } from "./leaveBalanceService.js";
import type { LeaveType } from "../utils/leaveCalculation.js";
import { isCorrectedVerification } from "../utils/attendanceVerification.js";

type Db = Pick<PoolClient, "query"> | Pool;

export interface TeamMember {
  id: number;
  employeeNumber: string;
  fullName: string;
  jobTitle: string | null;
  departmentName: string | null;
  employmentStatus: string;
  employmentDate: string | null;
  profileImage: string | null;
  email: string | null;
  directReports: number;
  day: {
    date: string;
    /** present | late | absent | on_leave, or null when nothing is recorded. */
    status: string | null;
    checkInTime: string | null;
    checkOutTime: string | null;
    lateMinutes: number | null;
    verificationStatus: string | null;
    isManual: boolean;
    /** Began as a verified scan and HR has since corrected it. No reason or audit detail. */
    correctedByHr: boolean;
    /** Approved leave covering the day, which usually has no attendance row. */
    onLeave: { leaveType: LeaveType } | null;
  };
}

interface MemberRow {
  id: string | number;
  employee_number: string;
  full_name: string;
  job_title: string | null;
  department_name: string | null;
  employment_status: string;
  employment_date: string | null;
  profile_image: string | null;
  email: string | null;
  direct_reports: number;
  status: string | null;
  check_in_time: string | null;
  check_out_time: string | null;
  late_minutes: number | null;
  verification_method: string | null;
  verification_status: string | null;
  is_manual: boolean | null;
  leave_type: LeaveType | null;
}

/**
 * The team as of one company date: who they are and where each person stands
 * that day. One set-based query, not one per report.
 */
export async function teamOnDate(
  managerEmployeeId: number,
  date: string,
  db: Db = pool,
): Promise<TeamMember[]> {
  const result = await db.query<MemberRow>(
    `SELECT e.id, e.employee_number, e.full_name, e.job_title, d.name AS department_name,
            e.employment_status, e.employment_date::text AS employment_date, e.profile_image,
            u.email,
            (SELECT count(*)::int FROM public.employees r
              WHERE r.manager_id = e.id AND r.employment_status = ANY($3::text[])) AS direct_reports,
            a.status, a.check_in_time, a.check_out_time, a.late_minutes,
            a.verification_method, a.verification_status, a.is_manual,
            (SELECT lr.leave_type FROM public.leave_requests lr
              WHERE lr.employee_id = e.id AND lr.status = 'approved'
                AND $2::date BETWEEN lr.start_date AND lr.end_date
              ORDER BY lr.start_date LIMIT 1) AS leave_type
     FROM public.employees e
     LEFT JOIN public.departments d ON d.id = e.department_id
     LEFT JOIN public.users u ON u.employee_id = e.id
     LEFT JOIN public.attendance a ON a.employee_id = e.id AND a.attendance_date = $2::date
     WHERE e.manager_id = $1 AND e.employment_status = ANY($3::text[])
     ORDER BY e.full_name, e.id`,
    [managerEmployeeId, date, VISIBLE_STATUSES],
  );

  return result.rows.map((row) => ({
    id: Number(row.id),
    employeeNumber: row.employee_number,
    fullName: row.full_name,
    jobTitle: row.job_title,
    departmentName: row.department_name,
    employmentStatus: row.employment_status,
    employmentDate: row.employment_date,
    profileImage: row.profile_image,
    email: row.email,
    directReports: Number(row.direct_reports),
    day: {
      date,
      status: row.status,
      checkInTime: row.check_in_time,
      checkOutTime: row.check_out_time,
      lateMinutes: row.late_minutes === null ? null : Number(row.late_minutes),
      verificationStatus: row.verification_status,
      isManual: row.is_manual === true,
      correctedByHr: isCorrectedVerification(row.verification_method, row.verification_status),
      onLeave: row.leave_type ? { leaveType: row.leave_type } : null,
    },
  }));
}

export interface TeamLeaveRequest {
  id: number;
  employeeId: number;
  employeeName: string;
  employeeNumber: string;
  leaveType: LeaveType;
  startDate: string;
  endDate: string;
  reason: string;
  status: string;
  adminComment: string | null;
  workingDays: number | null;
  leaveYear: number | null;
  reviewedAt: string | null;
  createdAt: string;
  /** For a pending request only: what the employee has left of that type. */
  availableDays: number | null;
}

/**
 * Leave for the team, pending first. The reason and type are part of the team
 * layer: a manager deciding a request needs both. Bounded to 200 rows; the
 * newest are the ones a manager acts on.
 */
export async function teamLeave(
  managerEmployeeId: number,
  status: string | null,
  db: Db = pool,
): Promise<TeamLeaveRequest[]> {
  const parameters: unknown[] = [managerEmployeeId, VISIBLE_STATUSES];
  let statusClause = "";
  if (status) {
    parameters.push(status);
    statusClause = ` AND lr.status = $${parameters.length}`;
  }

  const result = await db.query<{
    id: string | number; employee_id: string | number; employee_name: string;
    employee_number: string; leave_type: LeaveType; start_date: string; end_date: string;
    reason: string; status: string; admin_comment: string | null;
    working_days: string | null; leave_year: number | null;
    reviewed_at: Date | null; created_at: Date;
  }>(
    `SELECT lr.id, lr.employee_id, e.full_name AS employee_name, e.employee_number,
            lr.leave_type, lr.start_date::text AS start_date, lr.end_date::text AS end_date,
            lr.reason, lr.status, lr.admin_comment, lr.working_days, lr.leave_year,
            lr.reviewed_at, lr.created_at
     FROM public.leave_requests lr
     JOIN public.employees e ON e.id = lr.employee_id
     WHERE e.manager_id = $1 AND e.employment_status = ANY($2::text[])${statusClause}
     ORDER BY (lr.status = 'pending') DESC, lr.start_date DESC, lr.id DESC
     LIMIT 200`,
    parameters,
  );

  // Balances only for pending requests, in one pass rather than per row.
  const pending = result.rows.filter((row) => row.status === "pending");
  const byYear = new Map<number, number[]>();
  for (const row of pending) {
    if (row.leave_year === null) continue;
    const ids = byYear.get(row.leave_year) ?? [];
    ids.push(Number(row.employee_id));
    byYear.set(row.leave_year, ids);
  }
  const available = new Map<string, number>();
  for (const [year, ids] of byYear) {
    const balances = await getBalancesForEmployees(db, [...new Set(ids)], year);
    for (const [employeeId, list] of balances) {
      for (const balance of list) {
        if (balance.deductsBalance) {
          // availableDays already subtracts every pending request, this one
          // included. Adding this request's own days back gives the figure
          // approval is measured against: the grant less approved usage and
          // the employee's OTHER pending requests.
          available.set(`${employeeId}:${year}:${balance.leaveType}`, balance.availableDays);
        }
      }
    }
  }

  return result.rows.map((row) => {
    const days = row.working_days === null ? null : Number(row.working_days);
    const key = `${Number(row.employee_id)}:${row.leave_year}:${row.leave_type}`;
    const left = row.status === "pending" && available.has(key)
      ? Math.round(((available.get(key) ?? 0) + (days ?? 0)) * 10) / 10
      : null;
    return {
      id: Number(row.id),
      employeeId: Number(row.employee_id),
      employeeName: row.employee_name,
      employeeNumber: row.employee_number,
      leaveType: row.leave_type,
      startDate: row.start_date,
      endDate: row.end_date,
      reason: row.reason,
      status: row.status,
      adminComment: row.admin_comment,
      workingDays: days,
      leaveYear: row.leave_year,
      reviewedAt: row.reviewed_at ? new Date(row.reviewed_at).toISOString() : null,
      createdAt: new Date(row.created_at).toISOString(),
      availableDays: left,
    };
  });
}

export interface TeamAttendanceSummaryRow {
  employeeId: number;
  fullName: string;
  employeeNumber: string;
  daysRecorded: number;
  present: number;
  late: number;
  absent: number;
  onLeave: number;
  lateMinutes: number;
  missingCheckout: number;
}

/**
 * Attendance totals per report over a range. Lateness is summed from the
 * minutes snapshotted at clock-in, exactly as the company report does, so a
 * manager and HR can never see different numbers for the same days.
 */
export async function teamAttendanceSummary(
  managerEmployeeId: number,
  from: string,
  to: string,
  db: Db = pool,
): Promise<TeamAttendanceSummaryRow[]> {
  const result = await db.query(
    `SELECT e.id, e.full_name, e.employee_number,
            count(a.id)::int AS days_recorded,
            count(a.id) FILTER (WHERE a.status = 'present')::int AS present,
            count(a.id) FILTER (WHERE a.status = 'late')::int AS late,
            count(a.id) FILTER (WHERE a.status = 'absent')::int AS absent,
            count(a.id) FILTER (WHERE a.status = 'on_leave')::int AS on_leave,
            COALESCE(SUM(a.late_minutes), 0)::int AS late_minutes,
            count(a.id) FILTER (WHERE a.check_in_time IS NOT NULL AND a.check_out_time IS NULL)::int
              AS missing_checkout
     FROM public.employees e
     LEFT JOIN public.attendance a
       ON a.employee_id = e.id AND a.attendance_date BETWEEN $2::date AND $3::date
     WHERE e.manager_id = $1 AND e.employment_status = ANY($4::text[])
     GROUP BY e.id, e.full_name, e.employee_number
     ORDER BY e.full_name, e.id`,
    [managerEmployeeId, from, to, VISIBLE_STATUSES],
  );

  return result.rows.map((row) => ({
    employeeId: Number(row.id),
    fullName: row.full_name,
    employeeNumber: row.employee_number,
    daysRecorded: row.days_recorded,
    present: row.present,
    late: row.late,
    absent: row.absent,
    onLeave: row.on_leave,
    lateMinutes: row.late_minutes,
    missingCheckout: row.missing_checkout,
  }));
}

export interface UpcomingLeave {
  id: number;
  employeeId: number;
  employeeName: string;
  leaveType: LeaveType;
  startDate: string;
  endDate: string;
  status: string;
  workingDays: number | null;
}

/** Approved and pending leave overlapping the next `days` days, for planning. */
export async function teamUpcomingLeave(
  managerEmployeeId: number,
  today: string,
  days: number,
  db: Db = pool,
): Promise<UpcomingLeave[]> {
  const result = await db.query(
    `SELECT lr.id, lr.employee_id, e.full_name AS employee_name, lr.leave_type,
            lr.start_date::text AS start_date, lr.end_date::text AS end_date,
            lr.status, lr.working_days
     FROM public.leave_requests lr
     JOIN public.employees e ON e.id = lr.employee_id
     WHERE e.manager_id = $1 AND e.employment_status = ANY($4::text[])
       AND lr.status IN ('approved', 'pending')
       AND lr.end_date >= $2::date
       AND lr.start_date <= ($2::date + make_interval(days => $3))::date
     ORDER BY lr.start_date, e.full_name
     LIMIT 50`,
    [managerEmployeeId, today, days, VISIBLE_STATUSES],
  );
  return result.rows.map((row) => ({
    id: Number(row.id),
    employeeId: Number(row.employee_id),
    employeeName: row.employee_name,
    leaveType: row.leave_type,
    startDate: row.start_date,
    endDate: row.end_date,
    status: row.status,
    workingDays: row.working_days === null ? null : Number(row.working_days),
  }));
}
