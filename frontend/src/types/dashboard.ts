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

export interface EmployeeDashboardData {
  employee: DashboardEmployee;
  todayAttendance: DashboardAttendance | null;
  recentAttendance: DashboardAttendance[];
  pendingLeaves: number;
  recentLeaves: DashboardLeave[];
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
