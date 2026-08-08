import type { Request, Response } from "express";
import pool from "../config/db.js";

const allowedLeaveTypes = ["annual", "medical", "emergency", "unpaid"];

export async function createLeaveRequest(
  request: Request,
  response: Response,
): Promise<void> {
  const leaveType =
    typeof request.body.leaveType === "string"
      ? request.body.leaveType.trim()
      : "";

  const startDate =
    typeof request.body.startDate === "string"
      ? request.body.startDate.trim()
      : "";

  const endDate =
    typeof request.body.endDate === "string" ? request.body.endDate.trim() : "";

  const reason =
    typeof request.body.reason === "string" ? request.body.reason.trim() : "";

  if (!leaveType || !startDate || !endDate || !reason) {
    response.status(400).json({
      success: false,
      message: "Leave type, start date, end date, and reason are required",
    });
    return;
  }

  if (!allowedLeaveTypes.includes(leaveType)) {
    response.status(400).json({
      success: false,
      message: "Invalid leave type",
    });
    return;
  }

  if (startDate > endDate) {
    response.status(400).json({
      success: false,
      message: "Start date cannot be after the end date",
    });
    return;
  }

  const employeeResult = await pool.query(
    `
      SELECT employee_id
      FROM users
      WHERE id = $1
    `,
    [request.user!.id],
  );

  const employeeId = employeeResult.rows[0]?.employee_id;

  if (!employeeId) {
    response.status(403).json({
      success: false,
      message: "Authenticated user is not linked to an employee record",
    });
    return;
  }

  const result = await pool.query(
    `
      INSERT INTO leave_requests (
        employee_id,
        leave_type,
        start_date,
        end_date,
        reason
      )
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `,
    [employeeId, leaveType, startDate, endDate, reason],
  );

  response.status(201).json({
    success: true,
    message: "Leave request submitted successfully",
    data: {
      leave: result.rows[0],
    },
  });
}

export async function getMyLeaveRequests(
  request: Request,
  response: Response,
): Promise<void> {
  const employeeResult = await pool.query(
    `
      SELECT employee_id
      FROM users
      WHERE id = $1
    `,
    [request.user!.id],
  );

  const employeeId = employeeResult.rows[0]?.employee_id;

  if (!employeeId) {
    response.status(403).json({
      success: false,
      message: "Authenticated user is not linked to an employee record",
    });
    return;
  }

  const result = await pool.query(
    `
      SELECT
        id,
        employee_id,
        leave_type,
        start_date,
        end_date,
        reason,
        status,
        admin_comment,
        reviewed_by,
        reviewed_at,
        created_at,
        updated_at
      FROM leave_requests
      WHERE employee_id = $1
      ORDER BY created_at DESC
    `,
    [employeeId],
  );

  response.status(200).json({
    success: true,
    message: "Leave history retrieved successfully",
    data: {
      leaves: result.rows,
    },
  });
}
