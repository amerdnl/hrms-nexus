import type { Request, Response } from "express";
import pool from "../config/db.js";

export async function getAdminDashboard(
  request: Request,
  response: Response,
): Promise<void> {
  const [
    totalEmployeesResult,
    activeEmployeesResult,
    departmentsResult,
    attendanceTodayResult,
    pendingLeavesResult,
    recentEmployeesResult,
    recentAttendanceResult,
    recentLeavesResult,
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
      WHERE attendance_date = CURRENT_DATE
    `),

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
    },
  });
}

export async function getEmployeeDashboard(
  request: Request,
  response: Response,
): Promise<void> {
  const employeeResult = await pool.query(
    `
      SELECT
        e.id,
        e.full_name,
        e.employee_number,
        e.job_title,
        d.name AS department_name
      FROM users u
      JOIN employees e ON u.employee_id = e.id
      LEFT JOIN departments d ON e.department_id = d.id
      WHERE u.id = $1
    `,
    [request.user!.id],
  );

  const employee = employeeResult.rows[0];

  if (!employee) {
    response.status(403).json({
      success: false,
      message: "Authenticated user is not linked to an employee record",
    });
    return;
  }

  const [
    todayAttendanceResult,
    recentAttendanceResult,
    pendingLeavesResult,
    recentLeavesResult,
  ] = await Promise.all([
    pool.query(
      `
        SELECT
          id,
          attendance_date,
          check_in_time,
          check_out_time,
          status
        FROM attendance
        WHERE employee_id = $1
          AND attendance_date = CURRENT_DATE
        LIMIT 1
      `,
      [employee.id],
    ),

    pool.query(
      `
        SELECT
          id,
          attendance_date,
          check_in_time,
          check_out_time,
          status
        FROM attendance
        WHERE employee_id = $1
        ORDER BY attendance_date DESC
        LIMIT 5
      `,
      [employee.id],
    ),

    pool.query(
      `
        SELECT COUNT(*)::int AS count
        FROM leave_requests
        WHERE employee_id = $1
          AND status = 'pending'
      `,
      [employee.id],
    ),

    pool.query(
      `
        SELECT
          id,
          leave_type,
          start_date,
          end_date,
          status,
          admin_comment,
          reviewed_at,
          created_at
        FROM leave_requests
        WHERE employee_id = $1
        ORDER BY created_at DESC
        LIMIT 5
      `,
      [employee.id],
    ),
  ]);

  response.status(200).json({
    success: true,
    message: "Employee dashboard retrieved successfully",
    data: {
      employee,
      todayAttendance: todayAttendanceResult.rows[0] ?? null,
      recentAttendance: recentAttendanceResult.rows,
      pendingLeaves: pendingLeavesResult.rows[0].count,
      recentLeaves: recentLeavesResult.rows,
    },
  });
}
