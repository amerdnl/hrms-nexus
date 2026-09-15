export type AttendanceStatus = "present" | "late" | "absent" | "on_leave";

export type VerificationStatus = "verified" | "manual" | "exception";

/** Location and method metadata captured when a record is verified. */
export interface AttendanceVerification {
  checkInLatitude: number | null;
  checkInLongitude: number | null;
  checkInAccuracyMeters: number | null;
  checkInDistanceMeters: number | null;
  checkOutLatitude: number | null;
  checkOutLongitude: number | null;
  checkOutAccuracyMeters: number | null;
  checkOutDistanceMeters: number | null;
  verificationMethod: string | null;
  verificationStatus: VerificationStatus | null;
  lateMinutes: number | null;
  /** Began as a verified QR and location scan, and HR has since corrected it. */
  correctedByHr: boolean;
}

export interface AttendanceRecord {
  id: number;
  employeeId: number;
  attendanceDate: string;
  checkInTime: string | null;
  checkOutTime: string | null;
  status: AttendanceStatus;
  isManual: boolean;
  adminNote: string | null;
  createdAt: string;
  updatedAt: string;
  verification: AttendanceVerification;
}

export interface AttendanceDatabaseRow {
  id: number | string;
  employee_id: number | string;
  attendance_date: string | Date;
  check_in_time: string | null;
  check_out_time: string | null;
  status: AttendanceStatus;
  is_manual: boolean;
  admin_note: string | null;
  created_at: string | Date;
  updated_at: string | Date;
  check_in_latitude?: number | null;
  check_in_longitude?: number | null;
  check_in_accuracy_meters?: number | null;
  check_in_distance_meters?: number | null;
  check_out_latitude?: number | null;
  check_out_longitude?: number | null;
  check_out_accuracy_meters?: number | null;
  check_out_distance_meters?: number | null;
  verification_method?: string | null;
  verification_status?: VerificationStatus | null;
  late_minutes?: number | null;
}

export interface ManualAttendanceInput {
  employeeId: number;
  attendanceDate: string;
  checkInTime?: string | null;
  checkOutTime?: string | null;
  status: AttendanceStatus;
  adminNote?: string | null;
  verificationMethod?: string;
}

/**
 * HR's correction of an existing record. At least one of the three values must
 * change, and the reason is required: it becomes the record's note and is kept
 * in the audit log with the values before and after.
 */
export interface AttendanceCorrectionInput {
  checkInTime?: string | null;
  checkOutTime?: string | null;
  status?: AttendanceStatus;
  reason: string;
}

export interface AttendanceFilters {
  employeeId?: number;
  departmentId?: number;
  status?: AttendanceStatus;
  startDate?: string;
  endDate?: string;
}

export interface AttendanceStatistics {
  total: number;
  present: number;
  late: number;
  absent: number;
  onLeave: number;
}
