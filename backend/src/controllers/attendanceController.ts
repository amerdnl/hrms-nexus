import type { Request, Response } from "express";
import {
  createCheckIn,
  createCheckOut,
  getEmployeeAttendanceHistory,
  getTodayAttendance,
} from "../services/attendanceService.js";
import { validateReportedPosition } from "../utils/attendanceVerification.js";
import {
  currentAttendanceDate,
  verifiedCheckIn,
  verifiedCheckOut,
  type VerificationOutcome,
} from "../services/verifiedAttendanceService.js";

function getEmployeeId(request: Request): number | null {
  const employeeId = request.user?.employeeId;

  if (
    employeeId === null ||
    employeeId === undefined ||
    !Number.isInteger(employeeId)
  ) {
    return null;
  }

  return employeeId;
}

function isPostgresError(
  error: unknown,
): error is { code?: string; message?: string } {
  return typeof error === "object" && error !== null;
}

/**
 * Maps a verification outcome to a response.
 *
 * Every refusal says which check failed, because "clock-in failed" is useless to
 * an employee standing outside an office at 9am.
 */
function respondToFailure(
  response: Response,
  outcome: Extract<VerificationOutcome, { ok: false }>,
): void {
  switch (outcome.reason) {
    case "settings_missing":
    case "office_not_configured":
      // Fail closed: an unconfigured office never means "anywhere is acceptable".
      response.status(503).json({
        success: false,
        code: outcome.reason,
        message:
          "Attendance verification is not configured yet. Ask your administrator to set the office location in Company Settings.",
      });
      return;
    case "accuracy":
      response.status(422).json({
        success: false,
        code: "accuracy",
        message:
          "Your device could not determine your location precisely enough. Move somewhere with a clearer signal and try again.",
      });
      return;
    case "outside":
      response.status(403).json({
        success: false,
        code: "outside",
        message: `You are about ${outcome.distanceMeters} m from the office, outside the approved ${outcome.radiusMeters} m radius.`,
      });
      return;
    case "invalid":
      response.status(400).json({
        success: false,
        code: "invalid_code",
        message: "That code was not recognised. Scan the current QR code shown at the office.",
      });
      return;
    case "expired":
      response.status(410).json({
        success: false,
        code: "expired_code",
        message: "That code has expired. Scan the current QR code and try again.",
      });
      return;
    case "replayed":
      response.status(409).json({
        success: false,
        code: "replayed_code",
        message: "That code has already been used for this action. Scan the current QR code.",
      });
      return;
    case "already_checked_in":
      response.status(409).json({ success: false, code: outcome.reason, message: "You have already checked in today" });
      return;
    case "already_checked_out":
      response.status(409).json({ success: false, code: outcome.reason, message: "You have already checked out today" });
      return;
    case "not_checked_in":
      response.status(404).json({ success: false, code: outcome.reason, message: "You must check in before checking out" });
      return;
  }
}

/** Shared body handling: an authenticated employee, a code and one position. */
async function handleClockAction(
  request: Request,
  response: Response,
  action: (employeeId: number, token: string, position: ReturnType<typeof validateReportedPosition>["position"] & object) => Promise<VerificationOutcome>,
  successMessage: string,
  successStatus: number,
): Promise<void> {
  const employeeId = getEmployeeId(request);

  if (!employeeId) {
    response.status(401).json({
      success: false,
      message: "Authenticated employee account is required",
    });
    return;
  }

  const body = (request.body ?? {}) as Record<string, unknown>;
  const token = typeof body.token === "string" ? body.token : "";

  if (!token.trim()) {
    response.status(400).json({
      success: false,
      code: "missing_code",
      message: "Scan the QR code shown at the office to record attendance.",
    });
    return;
  }

  const position = validateReportedPosition(body.position);
  if (!position.valid || !position.position) {
    response.status(400).json({
      success: false,
      code: "missing_location",
      message: "Allow location access so your attendance can be verified.",
      errors: position.errors,
    });
    return;
  }

  try {
    const outcome = await action(employeeId, token, position.position);

    if (!outcome.ok) {
      respondToFailure(response, outcome);
      return;
    }

    response.status(successStatus).json({
      success: true,
      message: successMessage,
      data: outcome.record,
    });
  } catch (error) {
    // Never log the submitted code or coordinates.
    console.error("Attendance verification error:", error);
    response.status(500).json({
      success: false,
      message: "Unable to record attendance. Please try again.",
    });
  }
}

export async function checkIn(request: Request, response: Response): Promise<void> {
  await handleClockAction(
    request, response, verifiedCheckIn, "Check-in recorded successfully", 201,
  );
}

export async function checkOut(request: Request, response: Response): Promise<void> {
  await handleClockAction(
    request, response, verifiedCheckOut, "Check-out recorded successfully", 200,
  );
}

export async function getToday(
  request: Request,
  response: Response,
): Promise<void> {
  const employeeId = getEmployeeId(request);

  if (!employeeId) {
    response.status(401).json({
      success: false,
      message: "Authenticated employee account is required",
    });
    return;
  }

  try {
    const date = await currentAttendanceDate();
    const attendance = await getTodayAttendance(employeeId, date);

    response.status(200).json({
      success: true,
      data: attendance,
    });
  } catch (error) {
    console.error("Get today attendance error:", error);

    response.status(500).json({
      success: false,
      message: "Unable to retrieve today’s attendance",
    });
  }
}

export async function getMyHistory(
  request: Request,
  response: Response,
): Promise<void> {
  const employeeId = getEmployeeId(request);

  if (!employeeId) {
    response.status(401).json({
      success: false,
      message: "Authenticated employee account is required",
    });
    return;
  }

  const startDate =
    typeof request.query.startDate === "string"
      ? request.query.startDate
      : undefined;

  const endDate =
    typeof request.query.endDate === "string"
      ? request.query.endDate
      : undefined;

  try {
    const attendance = await getEmployeeAttendanceHistory(
      employeeId,
      startDate,
      endDate,
    );

    response.status(200).json({
      success: true,
      data: attendance,
    });
  } catch (error) {
    console.error("Get attendance history error:", error);

    response.status(500).json({
      success: false,
      message: "Unable to retrieve attendance history",
    });
  }
}
