/**
 * Attendance verification rules.
 *
 * Everything here is pure: the caller supplies the company settings and the
 * client-reported position, and gets back a decision. No clock, geofence or
 * lateness rule is hard-coded, so Company Settings is the single source of truth.
 */

export interface AttendanceSettings {
  timezone: string;
  work_start_time: string;
  work_end_time: string;
  grace_period_minutes: number;
  office_latitude: number | null;
  office_longitude: number | null;
  attendance_radius_meters: number;
  working_days: number[];
}

export interface ReportedPosition {
  latitude: number;
  longitude: number;
  accuracyMeters: number;
}

/**
 * A fix vaguer than this is treated as unusable rather than being stretched to
 * fit; a fix inside it may widen the geofence by at most the allowance, so a
 * client cannot claim a huge accuracy to reach the office from anywhere.
 */
export const MAX_ACCURACY_METERS = 150;
export const MAX_ACCURACY_ALLOWANCE_METERS = 50;

/** How long an issued office QR stays valid. The brief asks for 30-60 seconds. */
export const QR_TTL_SECONDS = 45;
export const QR_TTL_MIN_SECONDS = 30;
export const QR_TTL_MAX_SECONDS = 60;

export interface ZonedNow {
  /** Calendar date in the configured zone, `YYYY-MM-DD`. */
  date: string;
  /** Wall-clock time in the configured zone, `HH:MM:SS`. */
  time: string;
  /** ISO weekday, Monday = 1. */
  weekday: number;
}

/**
 * The authoritative clock. Derived from the server's own time in the configured
 * zone; a client-supplied timestamp is never accepted anywhere in this module.
 */
export function getZonedNow(timezone: string, now: Date = new Date()): ZonedNow {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    weekday: "short", hourCycle: "h23",
  }).formatToParts(now);

  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((entry) => entry.type === type)?.value ?? "";

  const weekdays: Record<string, number> = {
    Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7,
  };

  return {
    date: `${part("year")}-${part("month")}-${part("day")}`,
    time: `${part("hour")}:${part("minute")}:${part("second")}`,
    weekday: weekdays[part("weekday")] ?? 1,
  };
}

/** Minutes since midnight for `HH:MM` or `HH:MM:SS`. */
export function toMinutes(time: string): number {
  const [hours, minutes] = time.split(":");
  return Number(hours) * 60 + Number(minutes);
}

export interface LatenessResult {
  status: "present" | "late";
  lateMinutes: number;
  /** Minutes since the shift started; negative when the employee is early. */
  elapsedMinutes: number;
}

/**
 * Lateness against the configured start time and grace period.
 *
 * Overnight shifts are supported to the extent that the early-morning half of a
 * shift is recognised: a start of 22:00 with a 01:00 arrival is three hours late,
 * while a 21:00 arrival is simply early. Attendance is still dated by the
 * calendar day in the configured zone.
 */
export function evaluateLateness(
  time: string,
  settings: Pick<AttendanceSettings, "work_start_time" | "work_end_time" | "grace_period_minutes">,
): LatenessResult {
  const start = toMinutes(settings.work_start_time);
  const end = toMinutes(settings.work_end_time);
  const now = toMinutes(time);
  const overnight = end < start;

  let elapsed = now - start;
  // Only wrap when the arrival is far enough before the start to be the far side
  // of midnight; a shortly-early arrival must stay early, not become a day late.
  if (overnight && elapsed < -720) elapsed += 1440;

  const late = elapsed > settings.grace_period_minutes;
  return {
    status: late ? "late" : "present",
    lateMinutes: late ? elapsed : 0,
    elapsedMinutes: elapsed,
  };
}

/** Great-circle distance in metres. */
export function distanceMeters(
  from: { latitude: number; longitude: number },
  to: { latitude: number; longitude: number },
): number {
  const earthRadius = 6_371_008.8;
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

  const deltaLatitude = toRadians(to.latitude - from.latitude);
  const deltaLongitude = toRadians(to.longitude - from.longitude);
  const fromLatitude = toRadians(from.latitude);
  const toLatitude = toRadians(to.latitude);

  const a =
    Math.sin(deltaLatitude / 2) ** 2 +
    Math.cos(fromLatitude) * Math.cos(toLatitude) * Math.sin(deltaLongitude / 2) ** 2;

  return 2 * earthRadius * Math.asin(Math.min(1, Math.sqrt(a)));
}

export type LocationOutcome =
  | { ok: true; distanceMeters: number; allowanceMeters: number }
  | { ok: false; reason: "not_configured" | "accuracy" | "outside"; distanceMeters: number | null };

/**
 * Geofence decision.
 *
 * Fails closed when the office coordinates have not been configured: an
 * unconfigured office must never mean "anywhere is acceptable".
 */
export function evaluateLocation(
  position: ReportedPosition,
  settings: Pick<AttendanceSettings, "office_latitude" | "office_longitude" | "attendance_radius_meters">,
): LocationOutcome {
  if (settings.office_latitude === null || settings.office_longitude === null) {
    return { ok: false, reason: "not_configured", distanceMeters: null };
  }

  if (!Number.isFinite(position.accuracyMeters) || position.accuracyMeters > MAX_ACCURACY_METERS) {
    return { ok: false, reason: "accuracy", distanceMeters: null };
  }

  const distance = distanceMeters(position, {
    latitude: settings.office_latitude,
    longitude: settings.office_longitude,
  });

  const allowance = Math.min(Math.max(position.accuracyMeters, 0), MAX_ACCURACY_ALLOWANCE_METERS);

  return distance <= settings.attendance_radius_meters + allowance
    ? { ok: true, distanceMeters: distance, allowanceMeters: allowance }
    : { ok: false, reason: "outside", distanceMeters: distance };
}

export type VerificationMethod =
  | "QR_LOCATION" | "ADMIN_OVERRIDE" | "REMOTE_APPROVED" | "FIELD_WORK";

export const verificationMethods: readonly VerificationMethod[] = [
  "QR_LOCATION", "ADMIN_OVERRIDE", "REMOTE_APPROVED", "FIELD_WORK",
];

/** Administrator-created records are never "verified"; they are declared. */
export function statusForMethod(method: VerificationMethod): "verified" | "manual" | "exception" {
  if (method === "QR_LOCATION") return "verified";
  if (method === "ADMIN_OVERRIDE") return "manual";
  return "exception";
}

export interface PositionValidation {
  valid: boolean;
  errors: Record<string, string>;
  position?: ReportedPosition;
}

/** Validates the only three location values a client is ever allowed to send. */
export function validateReportedPosition(input: unknown): PositionValidation {
  const errors: Record<string, string> = {};
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { valid: false, errors: { _form: "Send your current location." } };
  }

  const value = input as Record<string, unknown>;
  const number = (field: string, min: number, max: number) => {
    const raw = value[field];
    if (typeof raw !== "number" || !Number.isFinite(raw) || raw < min || raw > max) {
      errors[field] = `Enter a valid ${field.replace(/([A-Z])/g, " $1").toLowerCase()}.`;
      return 0;
    }
    return raw;
  };

  const latitude = number("latitude", -90, 90);
  const longitude = number("longitude", -180, 180);
  const accuracyMeters = number("accuracyMeters", 0, 100_000);

  if (Object.keys(errors).length > 0) return { valid: false, errors };
  return { valid: true, errors, position: { latitude, longitude, accuracyMeters } };
}
