export type AttendanceStatus = "present" | "late" | "absent" | "on_leave";

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
}

export interface ManualAttendanceInput {
  employeeId: number;
  attendanceDate: string;
  checkInTime?: string | null;
  checkOutTime?: string | null;
  status: AttendanceStatus;
  adminNote?: string | null;
}

export interface UpdateAttendanceInput {
  checkInTime?: string | null;
  checkOutTime?: string | null;
  status?: AttendanceStatus;
  adminNote?: string | null;
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
