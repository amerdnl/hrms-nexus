import pool from "../config/db.js";
import { diffChanges } from "../utils/auditRedaction.js";
import {
  isCorrectedVerification,
  statusForMethod,
  type VerificationMethod,
} from "../utils/attendanceVerification.js";
import { recordRequiredAudit, type AuditActor } from "./auditService.js";
import type {
  AttendanceCorrectionInput,
  AttendanceDatabaseRow,
  AttendanceFilters,
  AttendanceRecord,
  AttendanceStatistics,
  ManualAttendanceInput,
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
      correctedByHr: isCorrectedVerification(row.verification_method, row.verification_status),
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

export type CorrectionOutcome =
  | { ok: true; record: AttendanceRecord }
  | { ok: false; reason: "not_found" | "no_changes" };

/** The values a correction exists to change. */
const correctableFields = ["check_in_time", "check_out_time", "status"] as const;

/** What the audit entry compares: the values, and what the correction does to the record around them. */
const correctionEvidenceFields = [
  ...correctableFields, "admin_note", "verification_status", "is_manual",
] as const;

/**
 * HR's correction of one attendance record, with its evidence, in one
 * transaction.
 *
 * The row is locked and read first, so the audit entry can say what each
 * changed value was before and what it became. The entry is written with
 * `recordRequiredAudit` inside the same transaction: if it cannot be written,
 * the transaction rolls back and the correction does not exist.
 *
 * A correction that would change none of the three values is refused and
 * leaves nothing behind. Values are compared as the database stores them, so
 * "08:30" sent for a stored 08:30:00 is not a change.
 *
 * The reason becomes the record's note. A verified scan keeps QR_LOCATION as
 * its origin, but its status moves from "verified" to "manual": the values on
 * it are no longer what the scan recorded.
 */
export async function correctAttendanceRecord(
  attendanceId: number,
  input: AttendanceCorrectionInput,
  actor: AuditActor,
): Promise<CorrectionOutcome> {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const locked = await client.query<AttendanceDatabaseRow>(
      "SELECT * FROM attendance WHERE id = $1 FOR UPDATE",
      [attendanceId],
    );
    const before = locked.rows[0];
    if (!before) {
      await client.query("ROLLBACK");
      return { ok: false, reason: "not_found" };
    }

    const values: Array<string | number | null> = [];
    const assignments: string[] = [];
    const assign = (column: string, value: string | null) => {
      values.push(value);
      assignments.push(`${column} = $${values.length}`);
    };

    if (input.checkInTime !== undefined) assign("check_in_time", input.checkInTime);
    if (input.checkOutTime !== undefined) assign("check_out_time", input.checkOutTime);
    if (input.status !== undefined) assign("status", input.status);
    assign("admin_note", input.reason);
    assignments.push(
      "is_manual = TRUE",
      "verification_status = CASE WHEN verification_status = 'verified' THEN 'manual' ELSE verification_status END",
      "updated_at = CURRENT_TIMESTAMP",
    );
    values.push(attendanceId);

    const updated = await client.query<AttendanceDatabaseRow>(
      `UPDATE attendance SET ${assignments.join(", ")} WHERE id = $${values.length} RETURNING *`,
      values,
    );
    const after = updated.rows[0]!;

    const beforeFields = before as unknown as Record<string, unknown>;
    const afterFields = after as unknown as Record<string, unknown>;

    if (!diffChanges(beforeFields, afterFields, correctableFields)) {
      await client.query("ROLLBACK");
      return { ok: false, reason: "no_changes" };
    }

    await recordRequiredAudit(
      {
        actor,
        action: "ATTENDANCE_CORRECTED",
        entityType: "attendance",
        entityId: attendanceId,
        summary: `Corrected attendance #${attendanceId} for employee #${after.employee_id} on ${normalizeDatabaseDate(after.attendance_date)}. Reason: ${input.reason}`,
        changes: diffChanges(beforeFields, afterFields, correctionEvidenceFields),
      },
      client,
    );

    await client.query("COMMIT");
    return { ok: true, record: mapAttendanceRow(after) };
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // The connection is already unusable; the error below still reports the failure.
    }
    throw error;
  } finally {
    client.release();
  }
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
