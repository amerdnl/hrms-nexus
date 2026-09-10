import type { Request, Response } from "express";
import pool from "../config/db.js";
import { getZonedNow } from "../utils/attendanceVerification.js";
import { buildEmployeeDashboard } from "../services/employeeDashboardService.js";

/**
 * "Today" on the dashboard must be the same day attendance is judged against.
 *
 * The previous version used CURRENT_DATE, which is the database server's date.
 * Attendance decides which calendar day a clock action belongs to using the
 * timezone configured in Company Settings, so across midnight the two disagreed
 * and the dashboard reported a different set of people than the attendance page.
 */
async function companyToday(): Promise<string> {
  const settings = await pool.query<{ timezone: string }>(
    "SELECT timezone FROM public.company_settings WHERE id = 1",
  );
  try {
    return getZonedNow(settings.rows[0]?.timezone ?? "UTC").date;
  } catch {
    return getZonedNow("UTC").date;
  }
}

export async function getAdminDashboard(
  request: Request,
  response: Response,
): Promise<void> {
  const today = await companyToday();

  const [
    totalEmployeesResult,
    activeEmployeesResult,
    departmentsResult,
    attendanceTodayResult,
    pendingLeavesResult,
    recentEmployeesResult,
    recentAttendanceResult,
    recentLeavesResult,
    onLeaveTodayResult,
    notClockedInResult,
    payrollStatusResult,
  ] = await Promise.all([
    pool.query(`
      SELECT COUNT(*)::int AS count
      FROM employees
    `),

    pool.query(`
      SELECT COUNT(*)::int AS count
      FROM employees
      WHERE employment_status = 'active'
    `),

    pool.query(`
      SELECT COUNT(*)::int AS count
      FROM departments
    `),

    pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE status = 'present')::int AS present,
        COUNT(*) FILTER (WHERE status = 'late')::int AS late,
        COUNT(*) FILTER (WHERE status = 'absent')::int AS absent,
        COUNT(*) FILTER (WHERE status = 'on_leave')::int AS on_leave
      FROM attendance
      WHERE attendance_date = $1
    `, [today]),

    pool.query(`
      SELECT COUNT(*)::int AS count
      FROM leave_requests
      WHERE status = 'pending'
    `),

    pool.query(`
  SELECT
    id,
    employee_number,
    full_name,
    job_title,
    employment_status,
    created_at
  FROM employees
  ORDER BY created_at DESC
  LIMIT 5
`),

    pool.query(`
  SELECT
    a.id,
    a.attendance_date,
    a.check_in_time,
    a.check_out_time,
    a.status,
    e.full_name AS employee_name
  FROM attendance a
  JOIN employees e ON a.employee_id = e.id
  ORDER BY a.attendance_date DESC, a.created_at DESC
  LIMIT 5
`),

    pool.query(`
  SELECT
    lr.id,
    lr.leave_type,
    lr.start_date,
    lr.end_date,
    lr.status,
    lr.created_at,
    e.full_name AS employee_name
  FROM leave_requests lr
  JOIN employees e ON lr.employee_id = e.id
  ORDER BY lr.created_at DESC
  LIMIT 5
`),

    // On leave today comes from APPROVED leave covering the date, not from an
    // attendance row: someone on approved leave usually has no attendance record
    // at all, so counting attendance would report them as simply missing.
    pool.query(`
      SELECT COUNT(DISTINCT lr.employee_id)::int AS count
      FROM leave_requests lr
      JOIN employees e ON e.id = lr.employee_id
      WHERE lr.status = 'approved'
        AND $1::date BETWEEN lr.start_date AND lr.end_date
        AND e.employment_status IN ('active', 'probation')
    `, [today]),

    // "Missing" is an absence of evidence, so it is derived by exclusion:
    // employed, no attendance row today, and not on approved leave.
    pool.query(`
      SELECT COUNT(*)::int AS count
      FROM employees e
      WHERE e.employment_status IN ('active', 'probation')
        AND NOT EXISTS (
          SELECT 1 FROM attendance a
          WHERE a.employee_id = e.id AND a.attendance_date = $1
        )
        AND NOT EXISTS (
          SELECT 1 FROM leave_requests lr
          WHERE lr.employee_id = e.id AND lr.status = 'approved'
            AND $1::date BETWEEN lr.start_date AND lr.end_date
        )
    `, [today]),

    // The most recent payroll period and how far through the process it is.
    pool.query(`
      SELECT p.id::text, p.period_year, p.period_month, p.status,
             (SELECT COUNT(*)::int FROM payroll_records r WHERE r.period_id = p.id) AS records,
             (SELECT COALESCE(SUM(r.net_sen), 0)::text FROM payroll_records r WHERE r.period_id = p.id) AS net_sen
      FROM payroll_periods p
      ORDER BY p.period_year DESC, p.period_month DESC
      LIMIT 1
    `),
  ]);

  response.status(200).json({
    success: true,
    message: "Admin dashboard retrieved successfully",
    data: {
      totalEmployees: totalEmployeesResult.rows[0].count,
      activeEmployees: activeEmployeesResult.rows[0].count,
      departments: departmentsResult.rows[0].count,
      attendanceToday: attendanceTodayResult.rows[0],
      pendingLeaves: pendingLeavesResult.rows[0].count,
      recentEmployees: recentEmployeesResult.rows,
      recentAttendance: recentAttendanceResult.rows,
      recentLeaves: recentLeavesResult.rows,
      today,
      onLeaveToday: onLeaveTodayResult.rows[0].count,
      notClockedIn: notClockedInResult.rows[0].count,
      payrollStatus: payrollStatusResult.rows[0] ?? null,
    },
  });
}

export async function getEmployeeDashboard(
  request: Request,
  response: Response,
): Promise<void> {
  try {
    // Resolved from the session alone. There is no employee identifier in the
    // request for a caller to substitute.
    const dashboard = await buildEmployeeDashboard(request.user!.id);

    if (!dashboard) {
      response.status(403).json({
        success: false,
        message: "Authenticated user is not linked to an employee record",
      });
      return;
    }

    response.status(200).json({
      success: true,
      message: "Employee dashboard retrieved successfully",
      data: dashboard,
    });
  } catch (error) {
    console.error("Employee dashboard failed:", error);
    response.status(503).json({
      success: false,
      message: "The database is temporarily unavailable. Please try again.",
    });
  }
}
