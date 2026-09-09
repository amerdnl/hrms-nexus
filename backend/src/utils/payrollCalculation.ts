import { divideRoundHalfUp } from "./payrollMoney.js";

/**
 * The payroll calculation.
 *
 * Pure and deterministic: the same inputs always produce the same lines and
 * totals, with no clock, database or randomness involved. Arithmetic is BigInt
 * over sen; the only rounding is half-up, applied once per derived line and
 * documented at the point it happens.
 *
 * HR Nexus computes NO statutory contribution. EPF, SOCSO, EIS and PCB are not
 * modelled: an administrator enters them as manual deduction lines if required.
 * Nothing here should be described as statutory compliance.
 */

export const payrollStatuses = [
  "draft", "calculated", "reviewed", "approved", "paid",
] as const;
export type PayrollStatus = (typeof payrollStatuses)[number];

/** The transitions the database trigger also enforces. */
const allowedTransitions: Record<PayrollStatus, PayrollStatus[]> = {
  draft: ["calculated"],
  calculated: ["draft", "reviewed"],
  reviewed: ["calculated", "approved"],
  approved: ["paid"],
  paid: [],
};

export function canTransition(from: PayrollStatus, to: PayrollStatus): boolean {
  return allowedTransitions[from].includes(to);
}

/** A period stops accepting edits once it is approved. */
export function isLocked(status: PayrollStatus): boolean {
  return status === "approved" || status === "paid";
}

export interface ManualLine {
  code: string;
  label: string;
  amountSen: number;
  isStatutory?: boolean;
}

export interface PayrollInput {
  basicSalarySen: number;
  allowanceSen: number;
  overtimeRateSen: number;
  /** Hundredths of an hour, so 12.5 hours is 1250. */
  overtimeHundredths: number;
  /** Tenths of a day, so 2.5 days is 25. */
  unpaidLeaveTenths: number;
  /** Working days in the period; the divisor for the daily rate. */
  workingDays: number;
  manualEarnings: ManualLine[];
  manualDeductions: ManualLine[];
}

export interface PayrollLine {
  itemType: "earning" | "deduction";
  code: string;
  label: string;
  amountSen: number;
  isManual: boolean;
  isStatutory: boolean;
}

export interface PayrollResult {
  lines: PayrollLine[];
  grossSen: number;
  deductionsSen: number;
  netSen: number;
}

/**
 * Daily rate applied to unpaid leave.
 *
 * basic / working days, multiplied by the unpaid days, rounded half-up to the
 * sen exactly once. Rounding the daily rate first and multiplying afterwards
 * would compound the error, so the division is deferred to the end.
 */
export function unpaidLeaveDeductionSen(
  basicSalarySen: number,
  unpaidLeaveTenths: number,
  workingDays: number,
): number {
  if (unpaidLeaveTenths <= 0 || basicSalarySen <= 0) return 0;
  if (workingDays <= 0) {
    throw new RangeError("A payroll period must have at least one working day");
  }

  return Number(divideRoundHalfUp(
    BigInt(basicSalarySen) * BigInt(unpaidLeaveTenths),
    BigInt(workingDays) * 10n,
  ));
}

/** Overtime rate is per hour; hours arrive in hundredths. Rounded half-up once. */
export function overtimeEarningSen(
  overtimeRateSen: number,
  overtimeHundredths: number,
): number {
  if (overtimeRateSen <= 0 || overtimeHundredths <= 0) return 0;

  return Number(divideRoundHalfUp(
    BigInt(overtimeRateSen) * BigInt(overtimeHundredths),
    100n,
  ));
}

export function calculatePayroll(input: PayrollInput): PayrollResult {
  const lines: PayrollLine[] = [];

  const add = (
    itemType: "earning" | "deduction",
    code: string,
    label: string,
    amountSen: number,
    isManual = false,
    isStatutory = false,
  ) => {
    if (amountSen <= 0) return;
    lines.push({ itemType, code, label, amountSen, isManual, isStatutory });
  };

  // Derived earnings.
  add("earning", "basic", "Basic salary", input.basicSalarySen);
  add("earning", "allowance", "Allowances", input.allowanceSen);
  add(
    "earning", "overtime", "Overtime",
    overtimeEarningSen(input.overtimeRateSen, input.overtimeHundredths),
  );
  for (const manual of input.manualEarnings) {
    add("earning", manual.code, manual.label, manual.amountSen, true, manual.isStatutory === true);
  }

  // Derived deductions. Unpaid leave is the only one HR Nexus computes.
  add(
    "deduction", "unpaid_leave", "Unpaid leave",
    unpaidLeaveDeductionSen(input.basicSalarySen, input.unpaidLeaveTenths, input.workingDays),
  );
  for (const manual of input.manualDeductions) {
    add("deduction", manual.code, manual.label, manual.amountSen, true, manual.isStatutory === true);
  }

  // Totals are exact integer sums over the lines, so a payslip always adds up.
  const total = (type: "earning" | "deduction") =>
    lines.reduce((sum, line) => (line.itemType === type ? sum + BigInt(line.amountSen) : sum), 0n);

  const grossSen = Number(total("earning"));
  const deductionsSen = Number(total("deduction"));

  return {
    lines,
    grossSen,
    deductionsSen,
    // Never clamped: an over-deducted record must be visibly wrong.
    netSen: grossSen - deductionsSen,
  };
}

/** First and last day of a payroll month, as ISO dates. */
export function monthBounds(year: number, month: number): { start: string; end: string } {
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 0));
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

/** Working days in a month under a given working-week pattern. */
export function workingDaysInMonth(
  year: number,
  month: number,
  workingDays: readonly number[],
): number {
  const allowed = new Set(workingDays);
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  let count = 0;

  for (let day = 1; day <= last; day += 1) {
    const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
    if (allowed.has(weekday === 0 ? 7 : weekday)) count += 1;
  }

  return count;
}
