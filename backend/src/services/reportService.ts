/**
 * Read-only reporting queries.
 *
 * Every function here aggregates in SQL and returns one result set per report.
 * Nothing loops a query over employees: a report that issues a query per person
 * is the difference between a page that loads and one that times out on the
 * first real company.
 *
 * No report writes, and none of them re-implements a business rule. Leave
 * balances come from the leave service, money formatting from the payroll money
 * helpers, and "today" from the same zoned clock attendance uses.
 */
import type { PoolClient } from "pg";
import pool from "../config/db.js";

type Db = Pick<PoolClient, "query">;

export interface DepartmentFilter {
  departmentId: number | null;
}

export interface DateRange {
  from: string;
  to: string;
}

/**
 * Department filtering is expressed once, here, so every report treats
 * "Unassigned" the same way. A null department is a real state, not a missing
 * value, and an employee in it must still appear in company-wide totals.
 */
function departmentClause(departmentId: number | null, parameterIndex: number): string {
  return departmentId === null ? "" : ` AND e.department_id = $${parameterIndex}`;
}

// ----------------------------------------------------------------- workforce

export interface WorkforceReport {
  totals: { employees: number; active: number; departments: number };
  byDepartment: {
    department_id: number | null;
    department_name: string;
    headcount: number;
    active: number;
    probation: number;
    inactive: number;
    resigned: number;
    terminated: number;
  }[];
  byStatus: { employment_status: string; count: number }[];
}

export async function workforceReport(db: Db = pool): Promise<WorkforceReport> {
  const [totals, byDepartment, byStatus] = await Promise.all([
    db.query(
      `SELECT count(*)::int AS employees,
              count(*) FILTER (WHERE employment_status = 'active')::int AS active,
              (SELECT count(*)::int FROM public.departments) AS departments
       FROM public.employees`,
    ),
    // LEFT JOIN from departments so an empty department still reports a zero
    // headcount instead of vanishing, and a UNION arm covers unassigned staff.
    db.query(
      `SELECT d.id AS department_id, d.name AS department_name,
              count(e.id)::int AS headcount,
              count(e.id) FILTER (WHERE e.employment_status = 'active')::int AS active,
              count(e.id) FILTER (WHERE e.employment_status = 'probation')::int AS probation,
              count(e.id) FILTER (WHERE e.employment_status = 'inactive')::int AS inactive,
              count(e.id) FILTER (WHERE e.employment_status = 'resigned')::int AS resigned,
              count(e.id) FILTER (WHERE e.employment_status = 'terminated')::int AS terminated
       FROM public.departments d
       LEFT JOIN public.employees e ON e.department_id = d.id
       GROUP BY d.id, d.name
       UNION ALL
       SELECT NULL, 'Unassigned',
              count(*)::int,
              count(*) FILTER (WHERE employment_status = 'active')::int,
              count(*) FILTER (WHERE employment_status = 'probation')::int,
              count(*) FILTER (WHERE employment_status = 'inactive')::int,
              count(*) FILTER (WHERE employment_status = 'resigned')::int,
              count(*) FILTER (WHERE employment_status = 'terminated')::int
       FROM public.employees WHERE department_id IS NULL
       ORDER BY 2`,
    ),
    db.query(
      `SELECT employment_status, count(*)::int AS count
       FROM public.employees GROUP BY employment_status ORDER BY employment_status`,
    ),
  ]);

  return {
    totals: totals.rows[0],
    // An "Unassigned" arm with nobody in it is noise on the page.
    byDepartment: byDepartment.rows.filter(
      (row) => row.department_id !== null || row.headcount > 0,
    ),
    byStatus: byStatus.rows,
  };
}

// ---------------------------------------------------------------- attendance

export interface AttendanceReportRow {
  employee_id: number;
  employee_number: string;
  full_name: string;
  department_name: string;
  days_recorded: number;
  present: number;
  late: number;
  absent: number;
  on_leave: number;
  late_minutes: number;
  missing_checkout: number;
}

export interface AttendanceReport {
  range: DateRange;
  totals: {
    employees: number;
    days_recorded: number;
    present: number;
    late: number;
    absent: number;
    on_leave: number;
    late_minutes: number;
    missing_checkout: number;
  };
  rows: AttendanceReportRow[];
}

/**
 * Lateness is NOT recomputed here. `late_minutes` was snapshotted onto the row
 * when the employee clocked in, against the grace period in force that day, so
 * summing the column is the only way a report can agree with the payslip and the
 * attendance page after a settings change.
 */
export async function attendanceReport(
  range: DateRange,
  filter: DepartmentFilter,
  db: Db = pool,
): Promise<AttendanceReport> {
  const parameters: unknown[] = [range.from, range.to];
  if (filter.departmentId !== null) parameters.push(filter.departmentId);

  const rows = await db.query<AttendanceReportRow>(
    `SELECT e.id AS employee_id, e.employee_number, e.full_name,
            COALESCE(d.name, 'Unassigned') AS department_name,
            count(a.id)::int AS days_recorded,
            count(a.id) FILTER (WHERE a.status = 'present')::int AS present,
            count(a.id) FILTER (WHERE a.status = 'late')::int AS late,
            count(a.id) FILTER (WHERE a.status = 'absent')::int AS absent,
            count(a.id) FILTER (WHERE a.status = 'on_leave')::int AS on_leave,
            COALESCE(SUM(a.late_minutes), 0)::int AS late_minutes,
            count(a.id) FILTER (
              WHERE a.check_in_time IS NOT NULL AND a.check_out_time IS NULL
            )::int AS missing_checkout
     FROM public.employees e
     LEFT JOIN public.departments d ON d.id = e.department_id
     LEFT JOIN public.attendance a
       ON a.employee_id = e.id AND a.attendance_date BETWEEN $1 AND $2
     WHERE TRUE${departmentClause(filter.departmentId, 3)}
     GROUP BY e.id, e.employee_number, e.full_name, d.name
     ORDER BY e.employee_number`,
    parameters,
  );

  const totals = rows.rows.reduce(
    (sum, row) => ({
      employees: sum.employees + 1,
      days_recorded: sum.days_recorded + row.days_recorded,
      present: sum.present + row.present,
      late: sum.late + row.late,
      absent: sum.absent + row.absent,
      on_leave: sum.on_leave + row.on_leave,
      late_minutes: sum.late_minutes + row.late_minutes,
      missing_checkout: sum.missing_checkout + row.missing_checkout,
    }),
    {
      employees: 0, days_recorded: 0, present: 0, late: 0,
      absent: 0, on_leave: 0, late_minutes: 0, missing_checkout: 0,
    },
  );

  return { range, totals, rows: rows.rows };
}

// --------------------------------------------------------------------- leave

export interface LeaveReportRow {
  id: string;
  employee_id: number;
  employee_number: string;
  full_name: string;
  department_name: string;
  leave_type: string;
  status: string;
  start_date: string;
  end_date: string;
  working_days: number;
  leave_year: number;
  reason: string | null;
}

export interface LeaveReport {
  range: DateRange;
  totals: {
    requests: number;
    approved_days: number;
    pending_days: number;
    by_type: { leave_type: string; status: string; requests: number; days: number }[];
  };
  rows: LeaveReportRow[];
}

/**
 * Requests are reported whole, on their own snapshotted `working_days`, whenever
 * they OVERLAP the window. They are deliberately not pro-rated across the filter
 * boundary: a request is the unit a company approves, and splitting one would
 * produce day counts that no leave record anywhere else in the system agrees
 * with. A request spanning the edge is therefore counted in full.
 */
export async function leaveReport(
  range: DateRange,
  filter: DepartmentFilter & { leaveType?: string | null; status?: string | null },
  db: Db = pool,
): Promise<LeaveReport> {
  const parameters: unknown[] = [range.from, range.to];
  let clause = "";

  if (filter.departmentId !== null) {
    parameters.push(filter.departmentId);
    clause += ` AND e.department_id = $${parameters.length}`;
  }
  if (filter.leaveType) {
    parameters.push(filter.leaveType);
    clause += ` AND lr.leave_type = $${parameters.length}`;
  }
  if (filter.status) {
    parameters.push(filter.status);
    clause += ` AND lr.status = $${parameters.length}`;
  }

  const rows = await db.query<LeaveReportRow>(
    `SELECT lr.id::text, lr.employee_id, e.employee_number, e.full_name,
            COALESCE(d.name, 'Unassigned') AS department_name,
            lr.leave_type, lr.status,
            lr.start_date::text, lr.end_date::text,
            COALESCE(lr.working_days, 0)::int AS working_days,
            lr.leave_year, lr.reason
     FROM public.leave_requests lr
     JOIN public.employees e ON e.id = lr.employee_id
     LEFT JOIN public.departments d ON d.id = e.department_id
     WHERE lr.start_date <= $2 AND lr.end_date >= $1${clause}
     ORDER BY lr.start_date DESC, e.employee_number`,
    parameters,
  );

  const byType = await db.query<{
    leave_type: string; status: string; requests: number; days: number;
  }>(
    `SELECT lr.leave_type, lr.status, count(*)::int AS requests,
            COALESCE(SUM(lr.working_days), 0)::float8 AS days
     FROM public.leave_requests lr
     JOIN public.employees e ON e.id = lr.employee_id
     WHERE lr.start_date <= $2 AND lr.end_date >= $1${clause}
     GROUP BY lr.leave_type, lr.status
     ORDER BY lr.leave_type, lr.status`,
    parameters,
  );

  const sumFor = (status: string) => byType.rows
    .filter((row) => row.status === status)
    .reduce((total, row) => total + Number(row.days), 0);

  return {
    range,
    totals: {
      requests: rows.rows.length,
      approved_days: Math.round(sumFor("approved") * 10) / 10,
      pending_days: Math.round(sumFor("pending") * 10) / 10,
      by_type: byType.rows.map((row) => ({ ...row, days: Number(row.days) })),
    },
    rows: rows.rows,
  };
}

/** Employees in scope for a balance report, so balances can be fetched in bulk. */
export async function employeesForBalances(
  filter: DepartmentFilter,
  db: Db = pool,
): Promise<{ id: number; employee_number: string; full_name: string; department_name: string }[]> {
  const parameters: unknown[] = [];
  if (filter.departmentId !== null) parameters.push(filter.departmentId);

  const result = await db.query(
    `SELECT e.id, e.employee_number, e.full_name,
            COALESCE(d.name, 'Unassigned') AS department_name
     FROM public.employees e
     LEFT JOIN public.departments d ON d.id = e.department_id
     WHERE e.employment_status IN ('active', 'probation')
       ${filter.departmentId === null ? "" : "AND e.department_id = $1"}
     ORDER BY e.employee_number`,
    parameters,
  );
  return result.rows;
}

// ------------------------------------------------------------------- payroll

export interface PayrollReportRow {
  record_id: string;
  employee_id: number;
  employee_number: string;
  full_name: string;
  department_name: string;
  basic_salary_sen: string;
  allowance_sen: string;
  gross_sen: string;
  deductions_sen: string;
  net_sen: string;
}

export interface PayrollReport {
  period: {
    id: string; period_year: number; period_month: number;
    status: string; working_days: number;
  } | null;
  totals: {
    employees: number;
    gross_sen: string;
    deductions_sen: string;
    net_sen: string;
  };
  byDepartment: {
    department_name: string; employees: number;
    gross_sen: string; deductions_sen: string; net_sen: string;
  }[];
  byItem: {
    item_type: string; code: string; label: string;
    lines: number; amount_sen: string; is_statutory: boolean;
  }[];
  rows: PayrollReportRow[];
}

/**
 * Every money figure is summed by PostgreSQL over BIGINT sen and returned as a
 * string. It is never converted to a JavaScript number on the way through: a
 * company-wide gross is exactly the kind of aggregate that would eventually
 * exceed a safe integer, and a payroll report that is quietly off by a sen is
 * worse than no report.
 */
export async function payrollReport(
  periodId: string,
  filter: DepartmentFilter,
  db: Db = pool,
): Promise<PayrollReport> {
  const parameters: unknown[] = [periodId];
  let clause = "";
  if (filter.departmentId !== null) {
    parameters.push(filter.departmentId);
    clause = ` AND e.department_id = $${parameters.length}`;
  }

  const period = await db.query(
    `SELECT id::text, period_year, period_month, status, working_days
     FROM public.payroll_periods WHERE id = $1`,
    [periodId],
  );

  if (period.rows.length === 0) {
    return {
      period: null,
      totals: { employees: 0, gross_sen: "0", deductions_sen: "0", net_sen: "0" },
      byDepartment: [], byItem: [], rows: [],
    };
  }

  const [rows, byDepartment, byItem, totals] = await Promise.all([
    db.query<PayrollReportRow>(
      `SELECT r.id::text AS record_id, r.employee_id, r.employee_number, r.full_name,
              COALESCE(r.department_name, 'Unassigned') AS department_name,
              r.basic_salary_sen::text, r.allowance_sen::text,
              r.gross_sen::text, r.deductions_sen::text, r.net_sen::text
       FROM public.payroll_records r
       JOIN public.employees e ON e.id = r.employee_id
       WHERE r.period_id = $1${clause}
       ORDER BY r.employee_number`,
      parameters,
    ),
    db.query(
      `SELECT COALESCE(r.department_name, 'Unassigned') AS department_name,
              count(*)::int AS employees,
              COALESCE(SUM(r.gross_sen), 0)::text AS gross_sen,
              COALESCE(SUM(r.deductions_sen), 0)::text AS deductions_sen,
              COALESCE(SUM(r.net_sen), 0)::text AS net_sen
       FROM public.payroll_records r
       JOIN public.employees e ON e.id = r.employee_id
       WHERE r.period_id = $1${clause}
       GROUP BY 1 ORDER BY 1`,
      parameters,
    ),
    // Grouped by code AND label so a renamed manual line stays distinguishable.
    db.query(
      `SELECT i.item_type, i.code, i.label, count(*)::int AS lines,
              COALESCE(SUM(i.amount_sen), 0)::text AS amount_sen,
              bool_or(i.is_statutory) AS is_statutory
       FROM public.payroll_items i
       JOIN public.payroll_records r ON r.id = i.record_id
       JOIN public.employees e ON e.id = r.employee_id
       WHERE r.period_id = $1${clause}
       GROUP BY i.item_type, i.code, i.label
       ORDER BY i.item_type DESC, i.code`,
      parameters,
    ),
    db.query(
      `SELECT count(*)::int AS employees,
              COALESCE(SUM(r.gross_sen), 0)::text AS gross_sen,
              COALESCE(SUM(r.deductions_sen), 0)::text AS deductions_sen,
              COALESCE(SUM(r.net_sen), 0)::text AS net_sen
       FROM public.payroll_records r
       JOIN public.employees e ON e.id = r.employee_id
       WHERE r.period_id = $1${clause}`,
      parameters,
    ),
  ]);

  return {
    period: period.rows[0],
    totals: totals.rows[0],
    byDepartment: byDepartment.rows,
    byItem: byItem.rows,
    rows: rows.rows,
  };
}
