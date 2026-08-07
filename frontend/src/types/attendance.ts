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
}

export interface UpdateAttendanceInput {
  checkInTime?: string | null;
  checkOutTime?: string | null;
  status?: AttendanceStatus;
  adminNote?: string | null;
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
