import type { Request, Response } from "express";
import { actorFromUser, recordAudit } from "../services/auditService.js";
import {
  correctAttendanceRecord,
  createManualAttendance as createManualAttendanceRecord,
  getAllAttendance,
  getAttendanceStatistics,
} from "../services/attendanceService.js";
import type {
  AttendanceCorrectionInput,
  AttendanceFilters,
  AttendanceStatus,
  ManualAttendanceInput,
} from "../types/attendance.js";
import { currentAttendanceDate } from "../services/verifiedAttendanceService.js";
import {
  verificationMethods,
  type VerificationMethod,
} from "../utils/attendanceVerification.js";

const validStatuses: AttendanceStatus[] = [
  "present",
  "late",
  "absent",
  "on_leave",
];

/**
 * A correction reason's bounds. The upper bound matches the longest string the
 * audit log keeps whole, so the reason on the record and the reason in the log
 * are always the same text.
 */
export const CORRECTION_REASON_MIN_LENGTH = 5;
export const CORRECTION_REASON_MAX_LENGTH = 300;

function isValidStatus(value: unknown): value is AttendanceStatus {
  return (
    typeof value === "string" &&
    validStatuses.includes(value as AttendanceStatus)
  );
}

function isValidDate(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function isValidTime(value: unknown): value is string {
  return typeof value === "string" && /^\d{2}:\d{2}(:\d{2})?$/.test(value);
}

function isPostgresError(error: unknown): error is { code?: string } {
  return typeof error === "object" && error !== null;
}

export async function createManualAttendance(
  request: Request,
  response: Response,
): Promise<void> {
  const {
    employeeId,
    attendanceDate,
    checkInTime,
    checkOutTime,
    status,
    adminNote,
    verificationMethod,
  } = request.body as Partial<ManualAttendanceInput>;

  if (!Number.isInteger(employeeId) || Number(employeeId) <= 0) {
    response.status(400).json({
      success: false,
      message: "A valid employee ID is required",
    });
    return;
  }

  if (!isValidDate(attendanceDate)) {
    response.status(400).json({
      success: false,
      message: "Attendance date must use YYYY-MM-DD format",
    });
    return;
  }

  // An administrator record is never "verified"; it is declared, and which kind of
  // declaration it is must be explicit and auditable.
  const method: VerificationMethod =
    verificationMethod === undefined ? "ADMIN_OVERRIDE" : (verificationMethod as VerificationMethod);

  if (!verificationMethods.includes(method) || method === "QR_LOCATION") {
    response.status(400).json({
      success: false,
      message: `Verification method must be one of: ${verificationMethods.filter((m) => m !== "QR_LOCATION").join(", ")}.`,
    });
    return;
  }

  if (!isValidStatus(status)) {
    response.status(400).json({
      success: false,
      message: "A valid attendance status is required",
    });
    return;
  }

  if (
    checkInTime !== undefined &&
    checkInTime !== null &&
    !isValidTime(checkInTime)
  ) {
    response.status(400).json({
      success: false,
      message: "Check-in time is invalid",
    });
    return;
  }

  if (
    checkOutTime !== undefined &&
    checkOutTime !== null &&
    !isValidTime(checkOutTime)
  ) {
    response.status(400).json({
      success: false,
      message: "Check-out time is invalid",
    });
    return;
  }

  if (checkInTime && checkOutTime && checkOutTime < checkInTime) {
    response.status(400).json({
      success: false,
      message: "Check-out time cannot be earlier than check-in time",
    });
    return;
  }

  try {
    const attendance = await createManualAttendanceRecord({
      employeeId: Number(employeeId),
      attendanceDate,
      checkInTime: checkInTime ?? null,
      checkOutTime: checkOutTime ?? null,
      status,
      adminNote: adminNote ?? null,
      verificationMethod: method,
    });

    // Times and status only. Coordinates, GPS accuracy and distance-from-office
    // are never recorded here: an admin correction is an administrative act, and
    // where the employee physically was is not part of it.
    await recordAudit({
      actor: actorFromUser(request.user, request.user?.email),
      action: "ATTENDANCE_MANUAL_CREATED",
      entityType: "attendance",
      entityId: attendance.id,
      summary: `Created a manual attendance record for employee #${employeeId} on ${attendanceDate}`,
      changes: {
        employee_id: Number(employeeId),
        attendance_date: attendanceDate,
        check_in_time: checkInTime ?? null,
        check_out_time: checkOutTime ?? null,
        status,
        verification_method: method,
      },
    });

    response.status(201).json({
      success: true,
      message: "Manual attendance created successfully",
      data: attendance,
    });
  } catch (error) {
    if (isPostgresError(error) && error.code === "23505") {
      response.status(409).json({
        success: false,
        message: "Attendance already exists for this employee and date",
      });
      return;
    }

    if (isPostgresError(error) && error.code === "23514") {
      response.status(400).json({
        success: false,
        message: "Attendance data violates a database rule",
      });
      return;
    }

    console.error("Create manual attendance error:", error);

    response.status(500).json({
      success: false,
      message: "Unable to create manual attendance",
    });
  }
}

/**
 * PATCH /api/attendance/:id - HR corrects an existing record.
 *
 * The reason is required and checked here, whatever the form allows; at least
 * one of check-in, check-out or status must be sent. The service then applies
 * the correction and writes its before/after audit entry in one transaction,
 * so a correction without its evidence cannot exist.
 */
export async function updateAttendance(
  request: Request,
  response: Response,
): Promise<void> {
  const attendanceId = Number(request.params.id);

  if (!Number.isInteger(attendanceId) || attendanceId <= 0) {
    response.status(400).json({
      success: false,
      message: "Invalid attendance ID",
    });
    return;
  }

  const body = (request.body ?? {}) as Record<string, unknown>;
  const { checkInTime, checkOutTime, status } = body;
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";

  if (reason.length < CORRECTION_REASON_MIN_LENGTH) {
    response.status(400).json({
      success: false,
      code: "reason_required",
      message: `Give a reason for this correction, at least ${CORRECTION_REASON_MIN_LENGTH} characters.`,
    });
    return;
  }

  if (reason.length > CORRECTION_REASON_MAX_LENGTH) {
    response.status(400).json({
      success: false,
      code: "reason_too_long",
      message: `Keep the reason to ${CORRECTION_REASON_MAX_LENGTH} characters or fewer.`,
    });
    return;
  }

  if (checkInTime === undefined && checkOutTime === undefined && status === undefined) {
    response.status(400).json({
      success: false,
      code: "nothing_to_correct",
      message: "Change the check-in time, check-out time or status to correct this record.",
    });
    return;
  }

  if (status !== undefined && !isValidStatus(status)) {
    response.status(400).json({
      success: false,
      message: "Attendance status is invalid",
    });
    return;
  }

  if (
    checkInTime !== undefined &&
    checkInTime !== null &&
    !isValidTime(checkInTime)
  ) {
    response.status(400).json({
      success: false,
      message: "Check-in time is invalid",
    });
    return;
  }

  if (
    checkOutTime !== undefined &&
    checkOutTime !== null &&
    !isValidTime(checkOutTime)
  ) {
    response.status(400).json({
      success: false,
      message: "Check-out time is invalid",
    });
    return;
  }

  if (
    typeof checkInTime === "string" &&
    typeof checkOutTime === "string" &&
    checkOutTime < checkInTime
  ) {
    response.status(400).json({
      success: false,
      message: "Check-out time cannot be earlier than check-in time",
    });
    return;
  }

  const correction: AttendanceCorrectionInput = { reason };
  if (checkInTime !== undefined) correction.checkInTime = checkInTime as string | null;
  if (checkOutTime !== undefined) correction.checkOutTime = checkOutTime as string | null;
  if (status !== undefined) correction.status = status as AttendanceStatus;

  try {
    const outcome = await correctAttendanceRecord(
      attendanceId,
      correction,
      actorFromUser(request.user, request.user?.email),
    );

    if (!outcome.ok) {
      if (outcome.reason === "not_found") {
        response.status(404).json({
          success: false,
          message: "Attendance record not found",
        });
        return;
      }

      response.status(400).json({
        success: false,
        code: "nothing_to_correct",
        message: "These values already match the record, so there is nothing to correct.",
      });
      return;
    }

    response.status(200).json({
      success: true,
      message: "Attendance corrected",
      data: outcome.record,
    });
  } catch (error) {
    if (isPostgresError(error) && error.code === "23514") {
      response.status(400).json({
        success: false,
        message: "Attendance data violates a database rule",
      });
      return;
    }

    // Includes a failed audit write: the transaction rolled back, so the
    // record is exactly as it was.
    console.error("Correct attendance error:", error);

    response.status(500).json({
      success: false,
      message: "Unable to correct attendance. The record was not changed.",
    });
  }
}

export async function listAttendance(
  request: Request,
  response: Response,
): Promise<void> {
  const filters: AttendanceFilters = {};

  if (typeof request.query.employeeId === "string") {
    const employeeId = Number(request.query.employeeId);

    if (!Number.isInteger(employeeId) || employeeId <= 0) {
      response.status(400).json({
        success: false,
        message: "Employee filter is invalid",
      });
      return;
    }

    filters.employeeId = employeeId;
  }

  if (request.query.status !== undefined) {
    if (!isValidStatus(request.query.status)) {
      response.status(400).json({
        success: false,
        message: "Status filter is invalid",
      });
      return;
    }

    filters.status = request.query.status;
  }

  if (request.query.startDate !== undefined) {
    if (!isValidDate(request.query.startDate)) {
      response.status(400).json({
        success: false,
        message: "Start date is invalid",
      });
      return;
    }

    filters.startDate = request.query.startDate;
  }

  if (request.query.endDate !== undefined) {
    if (!isValidDate(request.query.endDate)) {
      response.status(400).json({
        success: false,
        message: "End date is invalid",
      });
      return;
    }

    filters.endDate = request.query.endDate;
  }

  try {
    const attendance = await getAllAttendance(filters);

    response.status(200).json({
      success: true,
      data: attendance,
    });
  } catch (error) {
    console.error("List attendance error:", error);

    response.status(500).json({
      success: false,
      message: "Unable to retrieve attendance records",
    });
  }
}

export async function getStatistics(
  request: Request,
  response: Response,
): Promise<void> {
  const today = await currentAttendanceDate();
  const requestedDate = request.query.date;
  const attendanceDate = requestedDate === undefined ? today : requestedDate;

  if (!isValidDate(attendanceDate)) {
    response.status(400).json({
      success: false,
      message: "Statistics date is invalid",
    });
    return;
  }

  try {
    const statistics = await getAttendanceStatistics(attendanceDate);

    response.status(200).json({
      success: true,
      date: attendanceDate,
      data: statistics,
    });
  } catch (error) {
    console.error("Attendance statistics error:", error);

    response.status(500).json({
      success: false,
      message: "Unable to retrieve attendance statistics",
    });
  }
}
