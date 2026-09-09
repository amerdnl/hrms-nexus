export type PayrollStatus = "draft" | "calculated" | "reviewed" | "approved" | "paid";

export const payrollStatuses: readonly PayrollStatus[] = [
  "draft", "calculated", "reviewed", "approved", "paid",
];

/**
 * Money crosses the wire as sen, either as a number or as a string when the
 * value exceeds what JSON numbers express comfortably. It is never formatted
 * with floating point arithmetic on this side either.
 */
export type Sen = string | number;

export interface PayrollPeriod {
  id: string;
  period_year: number;
  period_month: number;
  start_date: string;
  end_date: string;
  status: PayrollStatus;
  working_days: number;
  working_days_pattern: number[];
  note: string | null;
  calculated_at: string | null;
  reviewed_at: string | null;
  approved_at: string | null;
  paid_at: string | null;
  record_count?: number;
  net_sen?: Sen;
}

export interface PayrollRecord {
  id: string;
  period_id: string;
  employee_id: number;
  employee_number: string;
  full_name: string;
  department_name: string | null;
  job_title: string | null;
  basic_salary_sen: Sen;
  allowance_sen: Sen;
  overtime_rate_sen: Sen;
  overtime_hours: string;
  unpaid_leave_days: string;
  working_days: number;
  gross_sen: Sen;
  deductions_sen: Sen;
  net_sen: Sen;
  calculated_at: string;
}

export interface PayrollItem {
  id: string;
  item_type: "earning" | "deduction";
  code: string;
  label: string;
  amount_sen: Sen;
  is_manual: boolean;
  is_statutory: boolean;
  note: string | null;
}

export interface PayrollRecordDetail {
  record: PayrollRecord;
  items: PayrollItem[];
  period: PayrollPeriod;
}

export interface CompensationRow {
  id: string;
  basic_salary_sen: Sen;
  allowance_sen: Sen;
  overtime_rate_sen: Sen;
  effective_from: string;
  effective_to: string | null;
  note: string | null;
}

export interface CalculationSummary {
  calculated: number;
  skipped: Array<{ employeeId: number; employeeNumber: string; fullName: string; reason: string }>;
  grossSen: number;
  deductionsSen: number;
  netSen: number;
}

export interface PayslipListEntry {
  id: string;
  period_id: string;
  period_year: number;
  period_month: number;
  status: PayrollStatus;
  gross_sen: Sen;
  deductions_sen: Sen;
  net_sen: Sen;
  paid_at: string | null;
}

/**
 * Renders sen as a decimal string using integer arithmetic only.
 *
 * Dividing by 100 in JavaScript would reintroduce the floating point problem the
 * whole payroll model exists to avoid, so the digits are split instead.
 */
export function formatSen(value: Sen): string {
  const sen = typeof value === "string" ? Number.parseInt(value, 10) : Math.trunc(value);
  if (!Number.isFinite(sen)) return "0.00";

  const negative = sen < 0;
  const absolute = Math.abs(sen);
  const whole = Math.trunc(absolute / 100);
  const fraction = String(absolute % 100).padStart(2, "0");
  const grouped = String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${negative ? "-" : ""}${grouped}.${fraction}`;
}

const monthNames = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export function formatPeriod(year: number, month: number): string {
  return `${monthNames[month - 1] ?? month} ${year}`;
}
