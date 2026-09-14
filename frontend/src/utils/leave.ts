import { toIsoDate } from "./datetime";

/**
 * Inclusive number of calendar days covered by a leave request, or null when
 * the dates are missing, malformed, or reversed.
 *
 * FALLBACK ONLY. Leave balances are now server-side: a request carries the
 * working days it actually consumed, snapshotted at submission from the
 * configured working week. Use that figure wherever it exists.
 *
 * This counts every calendar day, weekends included, so it is only correct for
 * records written before balances existed, which have no snapshot to show.
 */
export function calcLeaveDays(
  startDate: string | null | undefined,
  endDate: string | null | undefined,
): number | null {
  const start = toIsoDate(startDate);
  const end = toIsoDate(endDate);

  if (!start || !end) return null;

  const [startYear, startMonth, startDay] = start.split("-").map(Number);
  const [endYear, endMonth, endDay] = end.split("-").map(Number);

  // Date.UTC rather than local Date: a DST boundary between the two dates
  // would otherwise make the difference 23 or 25 hours and round wrongly.
  // Malaysia has no DST, but the browser can be anywhere.
  const startMs = Date.UTC(startYear, startMonth - 1, startDay);
  const endMs = Date.UTC(endYear, endMonth - 1, endDay);

  const days = Math.round((endMs - startMs) / 86_400_000) + 1;

  return days > 0 ? days : null;
}

/**
 * Working days between two dates, counted exactly as the server counts them
 * when a request is submitted: every day whose ISO weekday (Monday = 1) is in
 * the company's working week. Company holidays inside the range are counted
 * like any other working day, as they are for balances and payroll.
 */
export function countWorkingDays(
  startDate: string | null | undefined,
  endDate: string | null | undefined,
  workingDays: readonly number[],
): number | null {
  const start = toIsoDate(startDate);
  const end = toIsoDate(endDate);
  if (!start || !end || start > end) return null;
  const [sy, sm, sd] = start.split("-").map(Number);
  const [ey, em, ed] = end.split("-").map(Number);
  const last = Date.UTC(ey, em - 1, ed);
  let count = 0;
  for (let day = Date.UTC(sy, sm - 1, sd); day <= last; day += 86_400_000) {
    const weekday = new Date(day).getUTCDay();
    if (workingDays.includes(weekday === 0 ? 7 : weekday)) count += 1;
  }
  return count;
}

const WEEKDAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** "Mon–Fri", or a list such as "Sun, Mon, Tue, Wed, Thu" when the week is not one run. */
export function describeWorkingWeek(workingDays: readonly number[]): string {
  const days = [...workingDays].sort((a, b) => a - b);
  if (days.length === 0) return "no working days";
  const contiguous = days.every((day, index) => index === 0 || day === days[index - 1]! + 1);
  if (contiguous && days.length > 2) return `${WEEKDAY_NAMES[days[0]! - 1]}–${WEEKDAY_NAMES[days[days.length - 1]! - 1]}`;
  return days.map((day) => WEEKDAY_NAMES[day - 1]).join(", ");
}

/**
 * How long a request is, in the unit that actually affects a balance.
 *
 * The server snapshots working days at submission - weekends and non-working
 * days already excluded - and that is the figure deducted. Calendar days are
 * only the fallback for records created before the snapshot existed, and are
 * labelled as such so the two can never be mistaken for each other. Before
 * this, the admin review table showed calendar days while the employee saw
 * working days: an admin approving "5 days" across a weekend was approving 3.
 */
export function formatLeaveDuration(leave: {
  workingDays: number | null;
  startDate: string;
  endDate: string;
}): string {
  if (leave.workingDays !== null && leave.workingDays !== undefined) {
    const days = Number(leave.workingDays);
    return `${days} working day${days === 1 ? "" : "s"}`;
  }

  const calendar = calcLeaveDays(leave.startDate, leave.endDate);
  return calendar === null ? "—" : `${calendar} calendar day${calendar === 1 ? "" : "s"}`;
}
