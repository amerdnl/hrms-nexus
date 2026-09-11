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
