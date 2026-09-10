import type { LeaveBalance, LeaveStatus, LeaveType } from "./leave";

export interface DashboardEmployee {
  id: number;
  fullName: string;
  employeeNumber: string;
  jobTitle: string | null;
  departmentName: string | null;
}

export interface DashboardAttendance {
  id: number;
  attendanceDate: string;
  checkInTime: string | null;
  checkOutTime: string | null;
  status: "present" | "late" | "absent" | "on_leave";
}

export interface DashboardLeave {
  id: number;
  leaveType: "annual" | "medical" | "emergency" | "unpaid";
  startDate: string;
  endDate: string;
  status: "pending" | "approved" | "rejected";
  adminComment?: string | null;
  reviewedAt?: string | null;
  createdAt: string;
  employeeName?: string;
}

/** A section that may be missing without the dashboard itself having failed. */
export type DashboardSection = "leaveBalances" | "payslip";

export interface EmployeeProfileSummary {
  id: number;
  fullName: string;
  employeeNumber: string;
  jobTitle: string | null;
  departmentName: string | null;
  employmentStatus: string;
  employmentDate: string | null;
  profileImage: string | null;
}

/**
 * Narrower than the attendance page's record on purpose: the dashboard is
 * never sent coordinates, accuracy or distance from the office.
 * `verificationStatus` is the coarse state only ('verified' | 'manual' |
 * 'exception').
 */
export interface EmployeeAttendanceEntry {
  id: number;
  attendanceDate: string;
  checkInTime: string | null;
  checkOutTime: string | null;
  status: DashboardAttendance["status"];
  isManual: boolean;
  verificationStatus: "verified" | "manual" | "exception" | null;
  lateMinutes: number | null;
}

export interface EmployeeLeaveEntry {
  id: number;
  leaveType: LeaveType;
  startDate: string;
  endDate: string;
  status: LeaveStatus;
  workingDays: number | null;
  adminComment: string | null;
  reviewedAt: string | null;
  createdAt: string;
}

/** Only ever an approved or paid period. Money stays exact integer sen as text. */
export interface EmployeePayslipSummary {
  id: string;
  periodId: string;
  periodYear: number;
  periodMonth: number;
  status: string;
  grossSen: string;
  deductionsSen: string;
  netSen: string;
  paidAt: string | null;
}

export interface EmployeeDashboardData {
  /** The company's own calendar date, from the Company Settings timezone. */
  today: string;
  employee: EmployeeProfileSummary;
  todayAttendance: EmployeeAttendanceEntry | null;
  recentAttendance: EmployeeAttendanceEntry[];
  leaveYear: number | null;
  leaveBalances: LeaveBalance[] | null;
  pendingLeaveCount: number;
  upcomingLeave: EmployeeLeaveEntry | null;
  recentLeaves: EmployeeLeaveEntry[];
  latestPayslip: EmployeePayslipSummary | null;
  /** Sections the server could not read. Shown as "unavailable", never empty. */
  unavailable: DashboardSection[];
}

export interface AdminDashboardData {
  totalEmployees: number;
  activeEmployees: number;
  departments: number;

  attendanceToday: {
    present: number;
    late: number;
    absent: number;
    onLeave: number;
  };

  pendingLeaves: number;

  /** The company's own calendar date, not the browser's or the server's. */
  today: string;
  /** Approved leave covering today, which usually has no attendance row at all. */
  onLeaveToday: number;
  /** Employed, no attendance record today, and not on approved leave. */
  notClockedIn: number;
  payrollStatus: {
    id: string;
    periodYear: number;
    periodMonth: number;
    status: string;
    records: number;
    netSen: string;
  } | null;

  recentEmployees: Array<{
    id: number;
    employeeNumber: string;
    fullName: string;
    jobTitle: string | null;
    employmentStatus: string;
    createdAt: string;
  }>;

  recentAttendance: Array<
    DashboardAttendance & {
      employeeName: string;
    }
  >;

  recentLeaves: DashboardLeave[];
}
