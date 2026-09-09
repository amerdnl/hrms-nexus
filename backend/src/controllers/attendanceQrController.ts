import type { Request, Response } from "express";
import pool from "../config/db.js";
import {
  issueChallenge,
  loadAttendanceSettings,
  pruneExpiredChallenges,
} from "../services/attendanceQrService.js";
import { QR_TTL_SECONDS } from "../utils/attendanceVerification.js";

/**
 * Issues the office QR an administrator displays.
 *
 * Administrator-only: an employee who could mint codes on their own device would
 * defeat the point of the code being shown at the office. The response carries the
 * rendered SVG as a data URL plus the raw code, which the display also shows so a
 * device without a camera can still be used.
 */
export async function createQrChallenge(request: Request, response: Response): Promise<void> {
  const client = await pool.connect();

  try {
    const settings = await loadAttendanceSettings(client);

    // Fail closed. Issuing codes for an office with no coordinates would produce
    // scans that can never be accepted.
    if (!settings || settings.office_latitude === null || settings.office_longitude === null) {
      response.status(503).json({
        success: false,
        code: "office_not_configured",
        message:
          "Set the office location and attendance radius in Company Settings before using QR attendance.",
      });
      return;
    }

    await client.query("BEGIN");
    const challenge = await issueChallenge(client, request.user!.id, QR_TTL_SECONDS);
    await client.query("COMMIT");

    // Housekeeping only, and awaited: firing it off after the client is released
    // would run it on a connection another request had already taken over.
    try {
      await pruneExpiredChallenges(client);
    } catch {
      // A failure to tidy old codes must never fail issuing a new one.
    }

    response.status(201).json({
      success: true,
      data: {
        code: challenge.token,
        qr_svg: challenge.qrSvgDataUrl,
        expires_at: challenge.expiresAt,
        ttl_seconds: challenge.ttlSeconds,
        radius_meters: settings.attendance_radius_meters,
      },
    });
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // The response below still reports the failure accurately.
    }
    console.error("QR challenge issue failed:", error);
    response.status(503).json({
      success: false,
      message: "Unable to issue a QR code right now. Please try again.",
    });
  } finally {
    client.release();
  }
}

/** Tells the employee UI whether verified attendance is usable before it asks for location. */
export async function getAttendanceVerificationStatus(
  _request: Request,
  response: Response,
): Promise<void> {
  const client = await pool.connect();
  try {
    const settings = await loadAttendanceSettings(client);
    const configured = Boolean(
      settings && settings.office_latitude !== null && settings.office_longitude !== null,
    );

    response.status(200).json({
      success: true,
      data: {
        configured,
        radius_meters: settings?.attendance_radius_meters ?? null,
        timezone: settings?.timezone ?? null,
        work_start_time: settings?.work_start_time ?? null,
        grace_period_minutes: settings?.grace_period_minutes ?? null,
      },
    });
  } catch {
    response.status(503).json({
      success: false,
      message: "Attendance settings are temporarily unavailable.",
    });
  } finally {
    client.release();
  }
}
