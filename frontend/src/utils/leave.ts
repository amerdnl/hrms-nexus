import type { LeaveRequest } from "../types/leave";
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

/** Formats a day count as "1 day" / "3 days". */
export function formatLeaveDays(
  days: number | null,
  fallback = "—",
): string {
  if (days === null) return fallback;

  return `${days} ${days === 1 ? "day" : "days"}`;
}

/** Convenience for the common "compute then format" pairing in tables. */
export function formatLeaveDaysBetween(
  startDate: string | null | undefined,
  endDate: string | null | undefined,
  fallback = "—",
): string {
  return formatLeaveDays(calcLeaveDays(startDate, endDate), fallback);
}

/**
 * The employee's nearest approved leave that has not finished yet.
 *
 * Uses endDate >= today rather than startDate >= today so a leave currently in
 * progress still surfaces. Comparison is lexicographic on "YYYY-MM-DD", which
 * is exactly correct for that format and avoids Date parsing entirely.
 *
 * `today` should come from getMalaysiaDate() so this agrees with how the
 * backend stamps attendance, rather than with the viewer's local clock.
 */
export function findUpcomingLeave(
  leaves: LeaveRequest[],
  today: string,
): LeaveRequest | null {
  const upcoming = leaves
    .filter((leave) => {
      if (leave.status !== "approved") return false;

      const end = toIsoDate(leave.endDate);

      return end !== "" && end >= today;
    })
    .sort((a, b) => toIsoDate(a.startDate).localeCompare(toIsoDate(b.startDate)));

  return upcoming[0] ?? null;
}
