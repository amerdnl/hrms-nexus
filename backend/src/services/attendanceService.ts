import pool from "../config/db.js";
import { statusForMethod, type VerificationMethod } from "../utils/attendanceVerification.js";
import type {
  AttendanceDatabaseRow,
  AttendanceFilters,
  AttendanceRecord,
  AttendanceStatistics,
  ManualAttendanceInput,
  UpdateAttendanceInput,
} from "../types/attendance.js";

function normalizeDatabaseDate(value: string | Date): string {
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }

  const match = String(value).match(/(\d{4})-(\d{2})-(\d{2})/);

  if (!match) {
    throw new Error("Invalid attendance date returned by database");
  }

  return `${match[1]}-${match[2]}-${match[3]}`;
}

const toNumber = (value: unknown): number | null =>
  value === null || value === undefined ? null : Number(value);

export function mapAttendanceRow(row: AttendanceDatabaseRow): AttendanceRecord {
  return {
    id: Number(row.id),
    employeeId: Number(row.employee_id),
    attendanceDate: normalizeDatabaseDate(row.attendance_date),
    checkInTime: row.check_in_time,
    checkOutTime: row.check_out_time,
    status: row.status,
    isManual: row.is_manual,
    adminNote: row.admin_note,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
    verification: {
      checkInLatitude: toNumber(row.check_in_latitude),
      checkInLongitude: toNumber(row.check_in_longitude),
      checkInAccuracyMeters: toNumber(row.check_in_accuracy_meters),
      checkInDistanceMeters: toNumber(row.check_in_distance_meters),
      checkOutLatitude: toNumber(row.check_out_latitude),
      checkOutLongitude: toNumber(row.check_out_longitude),
      checkOutAccuracyMeters: toNumber(row.check_out_accuracy_meters),
      checkOutDistanceMeters: toNumber(row.check_out_distance_meters),
      verificationMethod: row.verification_method ?? null,
      verificationStatus: row.verification_status ?? null,
      lateMinutes: toNumber(row.late_minutes),
    },
  };
}

export async function getTodayAttendance(
  employeeId: number,
  attendanceDate: string,
): Promise<AttendanceRecord | null> {
  const result = await pool.query<AttendanceDatabaseRow>(
    `
      SELECT *
      FROM attendance
      WHERE employee_id = $1
        AND attendance_date = $2
      LIMIT 1
    `,
    [employeeId, attendanceDate],
  );

  const row = result.rows[0];

  return row ? mapAttendanceRow(row) : null;
}

export async function getEmployeeAttendanceHistory(
  employeeId: number,
  startDate?: string,
  endDate?: string,
): Promise<AttendanceRecord[]> {
  const values: Array<number | string> = [employeeId];

  let query = `
    SELECT *
    FROM attendance
    WHERE employee_id = $1
  `;

  if (startDate) {
    values.push(startDate);
    query += ` AND attendance_date >= $${values.length}`;
  }

  if (endDate) {
    values.push(endDate);
    query += ` AND attendance_date <= $${values.length}`;
  }

  query += " ORDER BY attendance_date DESC";

  const result = await pool.query<AttendanceDatabaseRow>(query, values);

  return result.rows.map(mapAttendanceRow);
}

export async function createManualAttendance(
  input: ManualAttendanceInput,
): Promise<AttendanceRecord> {
  const result = await pool.query<AttendanceDatabaseRow>(
    `
      INSERT INTO attendance (
        employee_id,
        attendance_date,
        check_in_time,
        check_out_time,
        status,
        is_manual,
        admin_note,
        verification_method,
        verification_status
      )
      VALUES ($1, $2, $3, $4, $5, TRUE, $6, $7, $8)
      RETURNING *
    `,
    [
      input.employeeId,
      input.attendanceDate,
      input.checkInTime ?? null,
      input.checkOutTime ?? null,
      input.status,
      input.adminNote ?? null,
      input.verificationMethod ?? "ADMIN_OVERRIDE",
      statusForMethod((input.verificationMethod ?? "ADMIN_OVERRIDE") as VerificationMethod),
    ],
  );

  const row = result.rows[0];

  if (!row) {
    throw new Error("Unable to create manual attendance record");
  }

  return mapAttendanceRow(row);
}

export async function updateAttendanceRecord(
  attendanceId: number,
  input: UpdateAttendanceInput,
): Promise<AttendanceRecord | null> {
  const fields: string[] = [];
  const values: Array<string | null | number> = [];

  if (input.checkInTime !== undefined) {
    values.push(input.checkInTime);
    fields.push(`check_in_time = $${values.length}`);
  }

  if (input.checkOutTime !== undefined) {
    values.push(input.checkOutTime);
    fields.push(`check_out_time = $${values.length}`);
  }

  if (input.status !== undefined) {
    values.push(input.status);
    fields.push(`status = $${values.length}`);
  }

  if (input.adminNote !== undefined) {
    values.push(input.adminNote);
    fields.push(`admin_note = $${values.length}`);
  }

  if (fields.length === 0) {
    return null;
  }

  fields.push("is_manual = TRUE");
  fields.push("updated_at = CURRENT_TIMESTAMP");

  values.push(attendanceId);

  const result = await pool.query<AttendanceDatabaseRow>(
    `
      UPDATE attendance
      SET ${fields.join(", ")}
      WHERE id = $${values.length}
      RETURNING *
    `,
    values,
  );

  const row = result.rows[0];

  return row ? mapAttendanceRow(row) : null;
}

export async function getAllAttendance(
  filters: AttendanceFilters,
): Promise<AttendanceRecord[]> {
  const conditions: string[] = [];
  const values: Array<string | number> = [];

  if (filters.employeeId !== undefined) {
    values.push(filters.employeeId);
    conditions.push(`employee_id = $${values.length}`);
  }

  if (filters.status !== undefined) {
    values.push(filters.status);
    conditions.push(`status = $${values.length}`);
  }

  if (filters.startDate !== undefined) {
    values.push(filters.startDate);
    conditions.push(`attendance_date >= $${values.length}`);
  }

  if (filters.endDate !== undefined) {
    values.push(filters.endDate);
    conditions.push(`attendance_date <= $${values.length}`);
  }

  let query = "SELECT * FROM attendance";

  if (conditions.length > 0) {
    query += ` WHERE ${conditions.join(" AND ")}`;
  }

  query += " ORDER BY attendance_date DESC, check_in_time DESC NULLS LAST";

  const result = await pool.query<AttendanceDatabaseRow>(query, values);

  return result.rows.map(mapAttendanceRow);
}

export async function getAttendanceStatistics(
  attendanceDate: string,
): Promise<AttendanceStatistics> {
  const result = await pool.query<{
    total: string;
    present: string;
    late: string;
    absent: string;
    on_leave: string;
  }>(
    `
      SELECT
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE status = 'present') AS present,
        COUNT(*) FILTER (WHERE status = 'late') AS late,
        COUNT(*) FILTER (WHERE status = 'absent') AS absent,
        COUNT(*) FILTER (WHERE status = 'on_leave') AS on_leave
      FROM attendance
      WHERE attendance_date = $1
    `,
    [attendanceDate],
  );

  const row = result.rows[0];

  return {
    total: Number(row?.total ?? 0),
    present: Number(row?.present ?? 0),
    late: Number(row?.late ?? 0),
    absent: Number(row?.absent ?? 0),
    onLeave: Number(row?.on_leave ?? 0),
  };
}
