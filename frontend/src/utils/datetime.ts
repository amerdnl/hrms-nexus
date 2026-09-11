/**
 * Date and time formatting shared across pages.
 *
 * Every function here is timezone-safe by construction. The backend stores
 * attendance times as Postgres TIME and dates as DATE, and serialises them as
 * plain strings ("09:03:00", "2026-08-11") in Malaysia local time. Passing
 * those through `new Date(...)` would reinterpret them as UTC and shift the
 * rendered day backwards for any viewer west of UTC, so the helpers below
 * parse the parts by hand instead.
 */

const MALAYSIA_TIME_ZONE = "Asia/Kuala_Lumpur";

const ISO_DATE_PATTERN = /(\d{4})-(\d{2})-(\d{2})/;

/** "HH:MM" or "HH:MM:SS", which is what the attendance API returns. */
const TIME_PATTERN = /^(\d{2}):(\d{2})(?::(\d{2}))?$/;

/**
 * Extracts the calendar date from either "2026-08-11" or a full ISO
 * timestamp, giving a value that is safe to compare lexicographically.
 *
 * Returns "" when the input has no recognisable date, so that comparisons
 * such as `toIsoDate(x) >= today` fail closed rather than matching.
 */
export function toIsoDate(value: string | null | undefined): string {
  if (!value) return "";

  const match = String(value).match(ISO_DATE_PATTERN);

  return match ? `${match[1]}-${match[2]}-${match[3]}` : "";
}

/**
 * Formats a date for display, e.g. "11 Aug 2026".
 *
 * Lifted verbatim from the duplicated implementations in
 * AdminAttendancePage/EmployeeAttendancePage, including the fallback of
 * echoing the raw string when it contains no date.
 */
export function formatDate(value: string, fallback = "—"): string {
  const text = String(value);
  const match = text.match(ISO_DATE_PATTERN);

  if (!match) {
    return text || fallback;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  // Constructed as a LOCAL date from the parts, never parsed from the string,
  // which is what avoids the UTC-midnight shift.
  const displayDate = new Date(year, month - 1, day);

  return new Intl.DateTimeFormat("en-MY", {
    year: "numeric",
    month: "short",
    day: "2-digit",
  }).format(displayDate);
}

/**
 * Trims "09:03:00" to "09:03".
 *
 * The fallback differs by page - admin attendance shows an em dash, the
 * employee page shows "Not recorded" - so callers pass their own.
 */
export function formatTime(
  time: string | null | undefined,
  fallback = "—",
): string {
  return time ? time.slice(0, 5) : fallback;
}

/**
 * Formats a real timestamp (createdAt, reviewedAt), which - unlike the DATE
 * and TIME columns - is a genuine TIMESTAMPTZ and safe to pass to Date.
 */
export function formatDateTime(
  value: string | null | undefined,
  fallback = "—",
): string {
  if (!value) return fallback;

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) return fallback;

  return new Intl.DateTimeFormat("en-MY", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(parsed);
}

/**
 * Today's date in Malaysia as "YYYY-MM-DD".
 *
 * The "en-CA" locale is what yields ISO ordering, which is also the format
 * <input type="date"> requires. Moved verbatim from AdminAttendancePage.
 */
export function getMalaysiaDate(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: MALAYSIA_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/** Minutes since midnight, or null when the value is not a valid time. */
export function timeToMinutes(time: string | null | undefined): number | null {
  if (!time) return null;

  const match = String(time).match(TIME_PATTERN);

  if (!match) return null;

  const hours = Number(match[1]);
  const minutes = Number(match[2]);

  if (hours > 23 || minutes > 59) return null;

  return hours * 60 + minutes;
}

/**
 * A date range with the shared parts said once.
 *
 *   same day    "02 Sept 2026"
 *   same month  "21–22 Sept 2026"
 *   same year   "28 Sept – 02 Oct 2026"
 *   otherwise   "30 Dec 2026 – 02 Jan 2027"
 *
 * Repeating the month and year on both sides was the widest thing in the leave
 * table and made a two-day request look like a long one. Parsed from the ISO
 * parts, like formatDate, so no timezone can shift either end.
 */
export function formatDateRange(start: string, end: string): string {
  const a = toIsoDate(start);
  const b = toIsoDate(end);

  if (!a || !b) return `${formatDate(start)} – ${formatDate(end)}`;
  if (a === b) return formatDate(start);

  const [startYear, startMonth, startDay] = a.split("-");
  const [endYear, endMonth, endDay] = b.split("-");

  const monthName = (year: string, month: string) =>
    new Intl.DateTimeFormat("en-MY", { month: "short" }).format(
      new Date(Number(year), Number(month) - 1, 1),
    );

  if (startYear === endYear && startMonth === endMonth) {
    return `${startDay}–${endDay} ${monthName(endYear, endMonth)} ${endYear}`;
  }

  if (startYear === endYear) {
    return `${startDay} ${monthName(startYear, startMonth)} – ${endDay} ${monthName(endYear, endMonth)} ${endYear}`;
  }

  return `${formatDate(start)} – ${formatDate(end)}`;
}
