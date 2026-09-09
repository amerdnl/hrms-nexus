import type { PoolClient } from "pg";
import pool from "../config/db.js";
import type { AttendanceDatabaseRow, AttendanceRecord } from "../types/attendance.js";
import {
  evaluateLateness,
  evaluateLocation,
  getZonedNow,
  type AttendanceSettings,
  type ReportedPosition,
} from "../utils/attendanceVerification.js";
import { mapAttendanceRow } from "./attendanceService.js";
import {
  consumeChallenge,
  loadAttendanceSettings,
  type ChallengeFailure,
} from "./attendanceQrService.js";

/**
 * Every way a verified clock action can end. The controller maps these to status
 * codes; keeping them as data means the rules are testable without HTTP.
 */
export type VerificationOutcome =
  | { ok: true; record: AttendanceRecord; lateMinutes: number }
  | { ok: false; reason: "settings_missing" }
  | { ok: false; reason: "office_not_configured" }
  | { ok: false; reason: "accuracy" }
  | { ok: false; reason: "outside"; distanceMeters: number; radiusMeters: number }
  | { ok: false; reason: ChallengeFailure }
  | { ok: false; reason: "already_checked_in" }
  | { ok: false; reason: "not_checked_in" }
  | { ok: false; reason: "already_checked_out" };

const attendanceColumns = `id, employee_id, attendance_date, check_in_time, check_out_time,
  status, is_manual, admin_note, created_at, updated_at,
  check_in_latitude, check_in_longitude, check_in_accuracy_meters, check_in_distance_meters,
  check_out_latitude, check_out_longitude, check_out_accuracy_meters, check_out_distance_meters,
  verification_method, verification_status, late_minutes`;

/**
 * Shared preamble: load settings, apply the geofence, then spend the QR.
 *
 * Order matters. Location is judged before the code is consumed so a genuine
 * employee standing outside the radius does not burn their one use of a code,
 * and the whole thing runs inside the caller's transaction so a later failure
 * releases the consumption.
 */
type VerifyResult =
  | { ok: false; failure: Extract<VerificationOutcome, { ok: false }> }
  | { ok: true; settings: AttendanceSettings; distance: number };

async function verify(
  client: PoolClient,
  employeeId: number,
  token: string,
  position: ReportedPosition,
  action: "check_in" | "check_out",
): Promise<VerifyResult> {
  const settings = await loadAttendanceSettings(client);
  if (!settings) return { ok: false, failure: { ok: false, reason: "settings_missing" } };

  const location = evaluateLocation(position, settings);
  if (!location.ok) {
    if (location.reason === "not_configured") {
      return { ok: false, failure: { ok: false, reason: "office_not_configured" } };
    }
    if (location.reason === "accuracy") {
      return { ok: false, failure: { ok: false, reason: "accuracy" } };
    }
    return {
      ok: false,
      failure: {
        ok: false,
        reason: "outside",
        distanceMeters: Math.round(location.distanceMeters ?? 0),
        radiusMeters: settings.attendance_radius_meters,
      },
    };
  }

  const challenge = await consumeChallenge(client, token, employeeId, action);
  if (!challenge.ok) return { ok: false, failure: { ok: false, reason: challenge.reason } };

  return { ok: true, settings, distance: Math.round(location.distanceMeters) };
}

export async function verifiedCheckIn(
  employeeId: number,
  token: string,
  position: ReportedPosition,
): Promise<VerificationOutcome> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const verified = await verify(client, employeeId, token, position, "check_in");
    if (!verified.ok) {
      await client.query("ROLLBACK");
      return verified.failure;
    }

    const { settings, distance } = verified;
    // The authoritative clock is the server's, in the configured zone. Nothing
    // the client sends influences the recorded date, time or lateness.
    const now = getZonedNow(settings.timezone);
    const lateness = evaluateLateness(now.time, settings);

    try {
      const inserted = await client.query<AttendanceDatabaseRow>(
        `INSERT INTO public.attendance (
           employee_id, attendance_date, check_in_time, status, is_manual,
           check_in_latitude, check_in_longitude, check_in_accuracy_meters,
           check_in_distance_meters, verification_method, verification_status, late_minutes
         ) VALUES ($1,$2,$3,$4,FALSE,$5,$6,$7,$8,'QR_LOCATION','verified',$9)
         RETURNING ${attendanceColumns}`,
        [
          employeeId, now.date, now.time, lateness.status,
          position.latitude, position.longitude, position.accuracyMeters,
          distance, lateness.lateMinutes,
        ],
      );

      await client.query("COMMIT");
      return {
        ok: true,
        record: mapAttendanceRow(inserted.rows[0]!),
        lateMinutes: lateness.lateMinutes,
      };
    } catch (error) {
      await client.query("ROLLBACK");
      if ((error as { code?: string }).code === "23505") {
        return { ok: false, reason: "already_checked_in" };
      }
      throw error;
    }
  } finally {
    client.release();
  }
}

export async function verifiedCheckOut(
  employeeId: number,
  token: string,
  position: ReportedPosition,
): Promise<VerificationOutcome> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const verified = await verify(client, employeeId, token, position, "check_out");
    if (!verified.ok) {
      await client.query("ROLLBACK");
      return verified.failure;
    }

    const { settings, distance } = verified;
    const now = getZonedNow(settings.timezone);

    // Conditional update: the row must still be checked in and not checked out,
    // so two concurrent check-outs cannot both succeed.
    const updated = await client.query<AttendanceDatabaseRow>(
      `UPDATE public.attendance
       SET check_out_time = $1, updated_at = CURRENT_TIMESTAMP,
           check_out_latitude = $2, check_out_longitude = $3,
           check_out_accuracy_meters = $4, check_out_distance_meters = $5
       WHERE employee_id = $6 AND attendance_date = $7
         AND check_in_time IS NOT NULL AND check_out_time IS NULL
       RETURNING ${attendanceColumns}`,
      [
        now.time, position.latitude, position.longitude,
        position.accuracyMeters, distance, employeeId, now.date,
      ],
    );

    if (updated.rows.length === 0) {
      const existing = await client.query<{ check_out_time: string | null }>(
        "SELECT check_out_time FROM public.attendance WHERE employee_id = $1 AND attendance_date = $2",
        [employeeId, now.date],
      );
      await client.query("ROLLBACK");
      const row = existing.rows[0];
      if (!row) return { ok: false, reason: "not_checked_in" };
      return row.check_out_time
        ? { ok: false, reason: "already_checked_out" }
        : { ok: false, reason: "not_checked_in" };
    }

    await client.query("COMMIT");
    return {
      ok: true,
      record: mapAttendanceRow(updated.rows[0]!),
      lateMinutes: updated.rows[0]!.late_minutes ?? 0,
    };
  } finally {
    client.release();
  }
}

/**
 * The current attendance date in the configured zone.
 *
 * Read-only lookups must agree with the date a check-in is filed under, so they
 * use the same configured timezone rather than a hard-coded one. Falls back to
 * UTC only when settings are unreadable; writes fail closed separately.
 */
export async function currentAttendanceDate(): Promise<string> {
  try {
    // A single read, so it runs on the pool rather than checking out a client.
    const settings = await loadAttendanceSettings(pool);
    return getZonedNow(settings?.timezone ?? "UTC").date;
  } catch {
    return getZonedNow("UTC").date;
  }
}
