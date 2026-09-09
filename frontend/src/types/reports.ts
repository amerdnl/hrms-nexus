import type { LeaveStatus, LeaveType } from "./leave";
import type { Sen } from "./payroll";

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
  range: { from: string; to: string };
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

export interface LeaveReportRow {
  id: string;
  employee_id: number;
  employee_number: string;
  full_name: string;
  department_name: string;
  leave_type: LeaveType;
  status: LeaveStatus;
  start_date: string;
  end_date: string;
  working_days: number;
  leave_year: number;
}

export interface LeaveBalanceEntry {
  leaveType: LeaveType;
  entitledDays: number;
  usedDays: number;
  pendingDays: number;
  remainingDays: number;
  availableDays: number;
  deductsBalance: boolean;
  isPaid: boolean;
}

export interface LeaveReport {
  range: { from: string; to: string };
  leaveYear: number;
  totals: {
    requests: number;
    approved_days: number;
    pending_days: number;
    by_type: { leave_type: string; status: string; requests: number; days: number }[];
  };
  rows: LeaveReportRow[];
  balances: {
    employee_id: number;
    employee_number: string;
    full_name: string;
    department_name: string;
    balances: LeaveBalanceEntry[];
  }[];
}

export interface PayrollReport {
  period: {
    id: string;
    period_year: number;
    period_month: number;
    status: string;
    working_days: number;
  } | null;
  totals: { employees: number; gross_sen: Sen; deductions_sen: Sen; net_sen: Sen };
  byDepartment: {
    department_name: string;
    employees: number;
    gross_sen: Sen;
    deductions_sen: Sen;
    net_sen: Sen;
  }[];
  byItem: {
    item_type: string;
    code: string;
    label: string;
    lines: number;
    amount_sen: Sen;
    is_statutory: boolean;
  }[];
  rows: {
    record_id: string;
    employee_id: number;
    employee_number: string;
    full_name: string;
    department_name: string;
    basic_salary_sen: Sen;
    allowance_sen: Sen;
    gross_sen: Sen;
    deductions_sen: Sen;
    net_sen: Sen;
  }[];
}

/** Minutes rendered as "1h 45m", because a bare minute count stops being readable. */
export function formatMinutes(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes <= 0) return "0m";
  const hours = Math.trunc(minutes / 60);
  const rest = minutes % 60;
  return hours > 0 ? `${hours}h ${rest}m` : `${rest}m`;
}
