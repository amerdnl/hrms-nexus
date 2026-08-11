import { timeToMinutes } from "./datetime";

/**
 * Worked minutes between check-in and check-out, or null when it cannot be
 * determined.
 *
 * Returns null when either time is missing or malformed, and - deliberately -
 * when the difference is zero or negative.
 *
 * check_in_time and check_out_time are Postgres TIME columns with no date
 * component, so an overnight shift and a bad admin correction are literally
 * indistinguishable here: both appear as check-out < check-in. This app tracks
 * a "late" status against a fixed 09:00 workday, so a data-entry error is far
 * likelier than a night shift. Rendering "—" is honest; silently adding 24h
 * would invent hours nobody worked. Revisit only if night shifts become a
 * requirement, which would need a date on the check-out.
 */
export function calcWorkMinutes(
  checkInTime: string | null | undefined,
  checkOutTime: string | null | undefined,
): number | null {
  const start = timeToMinutes(checkInTime);
  const end = timeToMinutes(checkOutTime);

  if (start === null || end === null) return null;

  const difference = end - start;

  return difference > 0 ? difference : null;
}

/** Formats worked minutes as "8h 08m". Minutes are zero-padded. */
export function formatWorkHours(
  minutes: number | null,
  fallback = "—",
): string {
  if (minutes === null) return fallback;

  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;

  return `${hours}h ${String(remainder).padStart(2, "0")}m`;
}

/** Convenience for the common "compute then format" pairing in tables. */
export function formatWorkHoursBetween(
  checkInTime: string | null | undefined,
  checkOutTime: string | null | undefined,
  fallback = "—",
): string {
  return formatWorkHours(calcWorkMinutes(checkInTime, checkOutTime), fallback);
}
