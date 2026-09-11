import type { AttendanceStatus } from "./attendance";
import type { LeaveStatus, LeaveType } from "./leave";

/**
 * A direct report as the manager's team layer shows them. Deliberately holds no
 * pay and no location: the server never sends either on a team route.
 */
export interface TeamMember {
  id: number;
  employeeNumber: string;
  fullName: string;
  jobTitle: string | null;
  departmentName: string | null;
  employmentStatus: string;
  employmentDate: string | null;
  profileImage: string | null;
  email: string | null;
  directReports: number;
  day: {
    date: string;
    status: AttendanceStatus | null;
    checkInTime: string | null;
    checkOutTime: string | null;
    lateMinutes: number | null;
    verificationStatus: "verified" | "manual" | "exception" | null;
    isManual: boolean;
    onLeave: { leaveType: LeaveType } | null;
  };
}

export interface TeamLeaveRequest {
  id: number;
  employeeId: number;
  employeeName: string;
  employeeNumber: string;
  leaveType: LeaveType;
  startDate: string;
  endDate: string;
  reason: string;
  status: LeaveStatus;
  adminComment: string | null;
  workingDays: number | null;
  leaveYear: number | null;
  reviewedAt: string | null;
  createdAt: string;
  /** Pending only: what approval is measured against. */
  availableDays: number | null;
}

export interface UpcomingLeave {
  id: number;
  employeeId: number;
  employeeName: string;
  leaveType: LeaveType;
  startDate: string;
  endDate: string;
  status: LeaveStatus;
  workingDays: number | null;
}

export interface TeamOverview {
  today: string;
  counts: {
    members: number;
    present: number;
    late: number;
    absent: number;
    onLeave: number;
    notClockedIn: number;
    pendingDecisions: number;
  };
  members: TeamMember[];
  pending: TeamLeaveRequest[];
  upcoming: UpcomingLeave[];
  upcomingDays: number;
}

export interface TeamAttendanceSummaryRow {
  employeeId: number;
  fullName: string;
  employeeNumber: string;
  daysRecorded: number;
  present: number;
  late: number;
  absent: number;
  onLeave: number;
  lateMinutes: number;
  missingCheckout: number;
}
