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

/** A string holding a whole number of sen, the only shape BigInt may parse. */
const INTEGER_SEN = /^-?\d+$/;

/**
 * Renders sen as a decimal string using integer arithmetic only.
 *
 * Dividing by 100 in JavaScript would reintroduce the floating point problem the
 * whole payroll model exists to avoid, so the digits are split instead.
 *
 * Whole-number strings go through BigInt. Number.parseInt was exact for every
 * realistic amount but silently lost precision beyond 2^53 sen, so the display
 * was safe in practice rather than safe. Anything else keeps the previous
 * parse, so no value that rendered before renders differently now.
 */
export function formatSen(value: Sen | bigint): string {
  let sen: bigint;

  if (typeof value === "bigint") {
    sen = value;
  } else if (typeof value === "string" && INTEGER_SEN.test(value.trim())) {
    sen = BigInt(value.trim());
  } else {
    const parsed = typeof value === "string" ? Number.parseInt(value, 10) : Math.trunc(value);
    if (!Number.isFinite(parsed)) return "0.00";
    sen = BigInt(parsed);
  }

  const negative = sen < 0n;
  const absolute = negative ? -sen : sen;
  const whole = absolute / 100n;
  const fraction = String(absolute % 100n).padStart(2, "0");
  const grouped = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${negative ? "-" : ""}${grouped}.${fraction}`;
}

/**
 * Adds sen values exactly. For period totals, which are summed on this side
 * from the records the page already holds - so they must be as exact as the
 * records themselves. Returns a bigint for formatSen.
 */
export function sumSen(values: Sen[]): bigint {
  let total = 0n;
  for (const value of values) {
    if (typeof value === "string" && INTEGER_SEN.test(value.trim())) {
      total += BigInt(value.trim());
    } else {
      const parsed = typeof value === "string" ? Number.parseInt(value, 10) : Math.trunc(value);
      if (Number.isFinite(parsed)) total += BigInt(parsed);
    }
  }
  return total;
}

const monthNames = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export function formatPeriod(year: number, month: number): string {
  return `${monthNames[month - 1] ?? month} ${year}`;
}
