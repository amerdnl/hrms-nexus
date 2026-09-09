/**
 * Leave duration and date rules.
 *
 * Pure: the caller supplies the configured working week, so the working calendar
 * is Company Settings and nothing here hard-codes a weekend. Public holidays are
 * not modelled in V1 (master section 29, P1); a holiday inside a leave range is
 * still counted as a working day today, and that is stated in the UI.
 */

export const leaveTypes = ["annual", "medical", "emergency", "unpaid"] as const;
export type LeaveType = (typeof leaveTypes)[number];

export const leaveStatuses = ["pending", "approved", "rejected", "cancelled"] as const;
export type LeaveStatus = (typeof leaveStatuses)[number];

/** A request may not span more than this many calendar days. */
export const MAX_LEAVE_SPAN_DAYS = 366;

const datePattern = /^\d{4}-\d{2}-\d{2}$/;

/** Parses `YYYY-MM-DD`, rejecting values like 2026-02-31. */
export function parseDate(value: string): Date | null {
  if (!datePattern.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10) === value ? parsed : null;
}

/** ISO weekday, Monday = 1 through Sunday = 7. */
export function isoWeekday(date: Date): number {
  const day = date.getUTCDay();
  return day === 0 ? 7 : day;
}

/**
 * Working days covered by an inclusive date range.
 *
 * Counts only days whose ISO weekday appears in the configured working week, so
 * a company working Sunday to Thursday is handled with no special cases.
 */
export function countWorkingDays(
  startDate: string,
  endDate: string,
  workingDays: readonly number[],
): number | null {
  const start = parseDate(startDate);
  const end = parseDate(endDate);
  if (!start || !end || start > end) return null;

  const allowed = new Set(workingDays);
  let count = 0;

  for (
    const cursor = new Date(start);
    cursor <= end;
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  ) {
    if (allowed.has(isoWeekday(cursor))) count += 1;
  }

  return count;
}

/** Inclusive calendar days, used for span limits rather than for balances. */
export function countCalendarDays(startDate: string, endDate: string): number | null {
  const start = parseDate(startDate);
  const end = parseDate(endDate);
  if (!start || !end || start > end) return null;
  return Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;
}

export interface LeaveDateValidation {
  valid: boolean;
  errors: Record<string, string>;
  leaveYear?: number;
  calendarDays?: number;
}

/**
 * Date rules that apply before any balance is consulted.
 *
 * A request may not cross a year boundary: attributing it wholly to one year
 * would quietly overdraw that year's balance and under-use the next, which is
 * impossible to explain when a balance later looks wrong. Splitting is asked for
 * explicitly instead.
 */
export function validateLeaveDates(
  startDate: string,
  endDate: string,
): LeaveDateValidation {
  const errors: Record<string, string> = {};

  const start = parseDate(startDate);
  const end = parseDate(endDate);

  if (!start) errors.startDate = "Enter a real start date in YYYY-MM-DD format.";
  if (!end) errors.endDate = "Enter a real end date in YYYY-MM-DD format.";
  if (!start || !end) return { valid: false, errors };

  if (start > end) {
    errors.endDate = "The end date cannot be before the start date.";
    return { valid: false, errors };
  }

  const startYear = start.getUTCFullYear();
  if (startYear !== end.getUTCFullYear()) {
    errors.endDate =
      "A request cannot span two leave years. Submit one request per calendar year.";
    return { valid: false, errors };
  }

  const calendarDays = countCalendarDays(startDate, endDate)!;
  if (calendarDays > MAX_LEAVE_SPAN_DAYS) {
    errors.endDate = `A request cannot cover more than ${MAX_LEAVE_SPAN_DAYS} days.`;
    return { valid: false, errors };
  }

  return { valid: true, errors, leaveYear: startYear, calendarDays };
}

export interface LeaveRequestInput {
  leaveType: LeaveType;
  startDate: string;
  endDate: string;
  reason: string;
}

export type LeaveRequestValidation =
  | { valid: true; data: LeaveRequestInput; leaveYear: number }
  | { valid: false; errors: Record<string, string> };

const REASON_MAX = 1000;

function hasControlCharacters(value: string): boolean {
  return [...value].some((character) => {
    const code = character.charCodeAt(0);
    return (code < 32 && ![9, 10, 13].includes(code)) || code === 127;
  });
}

/** Full submission contract; unknown fields are refused rather than ignored. */
export function validateLeaveRequest(input: unknown): LeaveRequestValidation {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { valid: false, errors: { _form: "Send a leave request object." } };
  }

  const value = input as Record<string, unknown>;
  const errors: Record<string, string> = {};

  const allowed = ["leaveType", "startDate", "endDate", "reason"];
  const unsupported = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unsupported.length > 0) {
    errors._form = `The request contains unsupported fields: ${unsupported.sort().join(", ")}.`;
  }

  const leaveType = typeof value.leaveType === "string" ? value.leaveType.trim() : "";
  if (!leaveTypes.includes(leaveType as LeaveType)) {
    errors.leaveType = `Leave type must be one of: ${leaveTypes.join(", ")}.`;
  }

  const reason = typeof value.reason === "string" ? value.reason.trim() : "";
  if (!reason) {
    errors.reason = "Give a reason for this request.";
  } else if (reason.length > REASON_MAX || hasControlCharacters(reason)) {
    errors.reason = `Enter up to ${REASON_MAX} characters without control characters.`;
  }

  const startDate = typeof value.startDate === "string" ? value.startDate.trim() : "";
  const endDate = typeof value.endDate === "string" ? value.endDate.trim() : "";
  const dates = validateLeaveDates(startDate, endDate);
  Object.assign(errors, dates.errors);

  if (Object.keys(errors).length > 0) return { valid: false, errors };

  return {
    valid: true,
    data: { leaveType: leaveType as LeaveType, startDate, endDate, reason },
    leaveYear: dates.leaveYear!,
  };
}

export interface LeaveBalance {
  leaveType: LeaveType;
  /** Grant for the year: entitlement plus carry-forward plus adjustments. */
  entitledDays: number;
  /** Working days already consumed by approved requests. */
  usedDays: number;
  /** Working days awaiting a decision. Never deducted twice. */
  pendingDays: number;
  /** Entitlement minus approved usage. Pending is shown separately. */
  remainingDays: number;
  /** What a new request is checked against: remaining minus pending. */
  availableDays: number;
  deductsBalance: boolean;
  isPaid: boolean;
}

/** Rounds to one decimal so repeated arithmetic cannot drift. */
export const round1 = (value: number) => Math.round(value * 10) / 10;

export function buildBalance(
  leaveType: LeaveType,
  grant: number,
  used: number,
  pending: number,
  policy: { deductsBalance: boolean; isPaid: boolean },
): LeaveBalance {
  const entitledDays = round1(grant);
  const usedDays = round1(used);
  const pendingDays = round1(pending);

  return {
    leaveType,
    entitledDays,
    usedDays,
    pendingDays,
    remainingDays: round1(entitledDays - usedDays),
    availableDays: round1(entitledDays - usedDays - pendingDays),
    deductsBalance: policy.deductsBalance,
    isPaid: policy.isPaid,
  };
}
