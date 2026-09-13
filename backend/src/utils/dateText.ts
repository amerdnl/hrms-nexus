/**
 * Plain-English dates for text the server writes (notification titles, action
 * items). Calendar dates only - YYYY-MM-DD in, no timezone arithmetic - so a
 * company date is never shifted by the server's own clock.
 */
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_LONG = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/**
 * A DATE column as YYYY-MM-DD. node-postgres returns DATE as a Date at local
 * midnight, so the local calendar fields are the stored date; a string is
 * already the stored date.
 */
export function isoDate(value: unknown): string {
  if (value instanceof Date) {
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
  }
  return String(value).slice(0, 10);
}

function parts(iso: string): [number, number, number] {
  const [year, month, day] = iso.slice(0, 10).split("-").map(Number);
  return [year!, month!, day!];
}

/** "15 Sep 2026" */
export function formatDay(iso: string): string {
  const [year, month, day] = parts(iso);
  return `${day} ${MONTHS[month - 1]} ${year}`;
}

/** "15 Sep 2026", "15–17 Sep 2026", "30 Sep – 2 Oct 2026" or "30 Dec 2026 – 2 Jan 2027". */
export function formatDateRange(start: string, end: string): string {
  if (start.slice(0, 10) === end.slice(0, 10)) return formatDay(start);
  const [y1, m1, d1] = parts(start);
  const [y2, m2, d2] = parts(end);
  if (y1 === y2 && m1 === m2) return `${d1}–${d2} ${MONTHS[m1 - 1]} ${y1}`;
  if (y1 === y2) return `${d1} ${MONTHS[m1 - 1]} – ${d2} ${MONTHS[m2 - 1]} ${y1}`;
  return `${formatDay(start)} – ${formatDay(end)}`;
}

/** "September 2026" */
export function formatMonth(year: number, month: number): string {
  return `${MONTHS_LONG[month - 1]} ${year}`;
}

/** "Annual leave" */
export function leaveTypeLabel(leaveType: string): string {
  return `${leaveType.charAt(0).toUpperCase()}${leaveType.slice(1)} leave`;
}

export function plural(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`;
}
