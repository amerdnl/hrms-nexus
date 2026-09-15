export type AttendanceStatus = "present" | "late" | "absent" | "on_leave";

export type VerificationMethod =
  | "QR_LOCATION" | "ADMIN_OVERRIDE" | "REMOTE_APPROVED" | "FIELD_WORK";

export type VerificationStatus = "verified" | "manual" | "exception";

/** Verification metadata; every field is null for records predating it. */
export interface AttendanceVerification {
  checkInLatitude: number | null;
  checkInLongitude: number | null;
  checkInAccuracyMeters: number | null;
  checkInDistanceMeters: number | null;
  checkOutLatitude: number | null;
  checkOutLongitude: number | null;
  checkOutAccuracyMeters: number | null;
  checkOutDistanceMeters: number | null;
  verificationMethod: VerificationMethod | null;
  verificationStatus: VerificationStatus | null;
  lateMinutes: number | null;
  /**
   * Began as a verified QR and location scan, and HR has since corrected it.
   * Such a record is shown as "Corrected by HR", never as verified.
   */
  correctedByHr: boolean;
}

/** The only three location values the client ever sends, and only on demand. */
export interface ReportedPosition {
  latitude: number;
  longitude: number;
  accuracyMeters: number;
}

export interface OfficeQrChallenge {
  code: string;
  qr_svg: string;
  expires_at: string;
  ttl_seconds: number;
  radius_meters: number;
}

export interface AttendanceVerificationStatus {
  configured: boolean;
  radius_meters: number | null;
  timezone: string | null;
  work_start_time: string | null;
  grace_period_minutes: number | null;
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
  verification?: AttendanceVerification;
}

export interface AttendanceStatistics {
  total: number;
  present: number;
  late: number;
  absent: number;
  onLeave: number;
}

export interface ManualAttendanceInput {
  employeeId: number;
  attendanceDate: string;
  checkInTime?: string | null;
  checkOutTime?: string | null;
  status: AttendanceStatus;
  adminNote?: string | null;
  verificationMethod?: VerificationMethod;
}

/**
 * HR's correction. Only the values that change are sent, and the reason is
 * required: the server refuses a correction without one, stores it as the
 * record's note and keeps it in the audit log.
 */
export interface UpdateAttendanceInput {
  checkInTime?: string | null;
  checkOutTime?: string | null;
  status?: AttendanceStatus;
  reason: string;
}

export interface AttendanceFilters {
  employeeId?: number;
  status?: AttendanceStatus;
  startDate?: string;
  endDate?: string;
}

export interface ApiResponse<T> {
  success: boolean;
  message?: string;
  data: T;
}
