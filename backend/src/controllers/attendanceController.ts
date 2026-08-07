import type { Request, Response } from "express";
import {
  createCheckIn,
  createCheckOut,
  getEmployeeAttendanceHistory,
  getTodayAttendance,
} from "../services/attendanceService.js";
import {
  determineAttendanceStatus,
  getMalaysiaDateTime,
} from "../utils/attendanceTime.js";

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

export async function checkIn(
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

  const { date, time } = getMalaysiaDateTime();
  const status = determineAttendanceStatus(time);

  try {
    const existingRecord = await getTodayAttendance(employeeId, date);

    if (existingRecord) {
      response.status(409).json({
        success: false,
        message: "You have already checked in today",
      });
      return;
    }

    const attendance = await createCheckIn(employeeId, date, time, status);

    response.status(201).json({
      success: true,
      message: "Check-in recorded successfully",
      data: attendance,
    });
  } catch (error) {
    if (isPostgresError(error) && error.code === "23505") {
      response.status(409).json({
        success: false,
        message: "You have already checked in today",
      });
      return;
    }

    console.error("Check-in error:", error);

    response.status(500).json({
      success: false,
      message: "Unable to record check-in",
    });
  }
}

export async function checkOut(
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

  const { date, time } = getMalaysiaDateTime();

  try {
    const existingRecord = await getTodayAttendance(employeeId, date);

    if (!existingRecord) {
      response.status(404).json({
        success: false,
        message: "You must check in before checking out",
      });
      return;
    }

    if (existingRecord.checkOutTime) {
      response.status(409).json({
        success: false,
        message: "You have already checked out today",
      });
      return;
    }

    const attendance = await createCheckOut(employeeId, date, time);

    if (!attendance) {
      response.status(409).json({
        success: false,
        message: "Unable to record check-out",
      });
      return;
    }

    response.status(200).json({
      success: true,
      message: "Check-out recorded successfully",
      data: attendance,
    });
  } catch (error) {
    console.error("Check-out error:", error);

    response.status(500).json({
      success: false,
      message: "Unable to record check-out",
    });
  }
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

  const { date } = getMalaysiaDateTime();

  try {
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
