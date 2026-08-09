import type { Request, Response } from "express";
import {
  createManualAttendance as createManualAttendanceRecord,
  getAllAttendance,
  getAttendanceStatistics,
  updateAttendanceRecord,
} from "../services/attendanceService.js";
import type {
  AttendanceFilters,
  AttendanceStatus,
  ManualAttendanceInput,
  UpdateAttendanceInput,
} from "../types/attendance.js";
import { getMalaysiaDateTime } from "../utils/attendanceTime.js";

const validStatuses: AttendanceStatus[] = [
  "present",
  "late",
  "absent",
  "on_leave",
];

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

  const { checkInTime, checkOutTime, status, adminNote } =
    request.body as UpdateAttendanceInput;

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

  if (checkInTime && checkOutTime && checkOutTime < checkInTime) {
    response.status(400).json({
      success: false,
      message: "Check-out time cannot be earlier than check-in time",
    });
    return;
  }

  try {
    const attendance = await updateAttendanceRecord(attendanceId, {
      checkInTime,
      checkOutTime,
      status,
      adminNote,
    });

    if (!attendance) {
      response.status(404).json({
        success: false,
        message: "Attendance record not found or no changes provided",
      });
      return;
    }

    response.status(200).json({
      success: true,
      message: "Attendance updated successfully",
      data: attendance,
    });
  } catch (error) {
    if (isPostgresError(error) && error.code === "23514") {
      response.status(400).json({
        success: false,
        message: "Attendance data violates a database rule",
      });
      return;
    }

    console.error("Update attendance error:", error);

    response.status(500).json({
      success: false,
      message: "Unable to update attendance",
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
  const today = getMalaysiaDateTime().date;
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
