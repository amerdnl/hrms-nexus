/**
 * Dates, times and greetings for Home.
 *
 * Calendar dates ("2026-09-14") are handled as UTC midnight throughout, so no
 * viewer's timezone can move a company day; a wall-clock time is only ever
 * read in the company's own zone.
 */

const asUtc = (iso: string) => new Date(`${iso}T00:00:00Z`);

export function addDays(iso: string, days: number): string {
  const date = asUtc(iso);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** ISO weekday, Monday = 1 ... Sunday = 7, the numbering Company Settings uses. */
export function isoWeekday(iso: string): number {
  const day = asUtc(iso).getUTCDay();
  return day === 0 ? 7 : day;
}

function part(iso: string, options: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat("en-US", { ...options, timeZone: "UTC" }).format(asUtc(iso));
}

/** "Monday, 14 Sep 2026" */
export function formatLongDate(iso: string): string {
  return `${part(iso, { weekday: "long" })}, ${Number(iso.slice(8, 10))} ${part(iso, { month: "short" })} ${iso.slice(0, 4)}`;
}

/** "Thu 24 Sep" */
export function formatShortDay(iso: string): string {
  return `${part(iso, { weekday: "short" })} ${Number(iso.slice(8, 10))} ${part(iso, { month: "short" })}`;
}

/** "21–22 Sep", "30 Sep – 2 Oct", or "24 Sep" for a single day. */
export function formatDayRange(start: string, end: string): string {
  const month = (iso: string) => part(iso, { month: "short" });
  const day = (iso: string) => Number(iso.slice(8, 10));
  if (start === end) return `${day(start)} ${month(start)}`;
  if (start.slice(0, 7) === end.slice(0, 7)) return `${day(start)}–${day(end)} ${month(end)}`;
  return `${day(start)} ${month(start)} – ${day(end)} ${month(end)}`;
}

/** "15:00" or "15:00:00" as "3:00 PM". */
export function formatClock(time: string): string {
  const [hours, minutes] = time.split(":").map(Number);
  const suffix = hours >= 12 ? "PM" : "AM";
  const hour = hours % 12 === 0 ? 12 : hours % 12;
  return `${hour}:${String(minutes).padStart(2, "0")} ${suffix}`;
}

/** The time now on the company's clock, "9:15 AM". */
export function clockInZone(timeZone: string, now: Date = new Date()): string {
  try {
    return new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", minute: "2-digit" }).format(now);
  } catch {
    return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(now);
  }
}

/** "Asia/Kuala_Lumpur" as "Kuala Lumpur". */
export function cityOf(timeZone: string): string {
  const city = timeZone.split("/").pop() ?? timeZone;
  return city.replaceAll("_", " ");
}

/** Greeting word from the viewer's own clock: it is their morning being wished. */
export function greetingWord(now: Date = new Date()): string {
  const hour = now.getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

/**
 * The name to greet someone by. For a patronymic name the given name is
 * everything before "bin", "binti", "a/l" or "a/p" - "Nurul Aisyah binti
 * Kamal" is greeted as "Nurul Aisyah", not "Nurul". Otherwise the first word.
 */
export function givenName(fullName: string): string {
  const match = fullName.match(/^(.+?)\s+(?:bin|binti|bte|a\/l|a\/p)\s/i);
  if (match) return match[1];
  return fullName.split(/\s+/)[0] || fullName;
}

/** "Just now", "12m ago", "2h ago", "3d ago", then "24 Aug". */
export function compactAgo(timestamp: string, now: Date = new Date()): string {
  const then = new Date(timestamp);
  const seconds = Math.round((now.getTime() - then.getTime()) / 1000);
  if (Number.isNaN(seconds)) return "";
  if (seconds < 60) return "Just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Intl.DateTimeFormat("en-US", { day: "numeric", month: "short" }).format(then);
}

/** The viewer's local calendar date of a timestamp, "YYYY-MM-DD". */
export function localIsoDate(timestamp: string): string {
  return new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(timestamp));
}
