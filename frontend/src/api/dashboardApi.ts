import apiClient from "./axios";
import type {
  AdminDashboardData,
  DashboardAttendance,
  DashboardLeave,
  EmployeeDashboardData,
} from "../types/dashboard";

interface ApiDashboardAttendance {
  id: number;
  attendance_date: string;
  check_in_time: string | null;
  check_out_time: string | null;
  status: DashboardAttendance["status"];
  employee_name?: string;
}

interface ApiDashboardLeave {
  id: number;
  leave_type: DashboardLeave["leaveType"];
  start_date: string;
  end_date: string;
  status: DashboardLeave["status"];
  admin_comment?: string | null;
  reviewed_at?: string | null;
  created_at: string;
  employee_name?: string;
}

interface AdminDashboardApiResponse {
  success: boolean;
  message: string;
  data: {
    totalEmployees: number;
    activeEmployees: number;
    departments: number;
    attendanceToday: {
      present: number;
      late: number;
      absent: number;
      on_leave: number;
    };
    pendingLeaves: number;
    today: string;
    onLeaveToday: number;
    notClockedIn: number;
    payrollStatus: {
      id: string;
      period_year: number;
      period_month: number;
      status: string;
      records: number;
      net_sen: string;
    } | null;
    recentEmployees: Array<{
      id: number;
      employee_number: string;
      full_name: string;
      job_title: string | null;
      employment_status: string;
      created_at: string;
    }>;
    recentAttendance: ApiDashboardAttendance[];
    recentLeaves: ApiDashboardLeave[];
  };
}

function mapAttendance(
  attendance: ApiDashboardAttendance,
): DashboardAttendance {
  return {
    id: attendance.id,
    attendanceDate: attendance.attendance_date,
    checkInTime: attendance.check_in_time,
    checkOutTime: attendance.check_out_time,
    status: attendance.status,
  };
}

function mapLeave(leave: ApiDashboardLeave): DashboardLeave {
  return {
    id: leave.id,
    leaveType: leave.leave_type,
    startDate: leave.start_date,
    endDate: leave.end_date,
    status: leave.status,
    adminComment: leave.admin_comment ?? null,
    reviewedAt: leave.reviewed_at ?? null,
    createdAt: leave.created_at,
    employeeName: leave.employee_name,
  };
}

/**
 * The employee dashboard is assembled by the server and already uses the
 * client's own field names, so there is nothing to translate here. Every value
 * on it is derived from the session; no employee identifier is sent.
 */
export async function getEmployeeDashboard(): Promise<EmployeeDashboardData> {
  const response = await apiClient.get<{
    success: boolean;
    message: string;
    data: EmployeeDashboardData;
  }>("/dashboard/employee");

  return response.data.data;
}

export async function getAdminDashboard(): Promise<AdminDashboardData> {
  const response =
    await apiClient.get<AdminDashboardApiResponse>("/dashboard/admin");

  return {
    totalEmployees: response.data.data.totalEmployees,
    activeEmployees: response.data.data.activeEmployees,
    departments: response.data.data.departments,
    attendanceToday: {
      present: response.data.data.attendanceToday.present,
      late: response.data.data.attendanceToday.late,
      absent: response.data.data.attendanceToday.absent,
      onLeave: response.data.data.attendanceToday.on_leave,
    },
    pendingLeaves: response.data.data.pendingLeaves,
    today: response.data.data.today,
    onLeaveToday: response.data.data.onLeaveToday,
    notClockedIn: response.data.data.notClockedIn,
    payrollStatus: response.data.data.payrollStatus
      ? {
          id: response.data.data.payrollStatus.id,
          periodYear: response.data.data.payrollStatus.period_year,
          periodMonth: response.data.data.payrollStatus.period_month,
          status: response.data.data.payrollStatus.status,
          records: response.data.data.payrollStatus.records,
          netSen: response.data.data.payrollStatus.net_sen,
        }
      : null,

    recentEmployees: response.data.data.recentEmployees.map((employee) => ({
      id: employee.id,
      employeeNumber: employee.employee_number,
      fullName: employee.full_name,
      jobTitle: employee.job_title,
      employmentStatus: employee.employment_status,
      createdAt: employee.created_at,
    })),

    recentAttendance: response.data.data.recentAttendance.map((attendance) => ({
      ...mapAttendance(attendance),
      employeeName: attendance.employee_name ?? "-",
    })),

    recentLeaves: response.data.data.recentLeaves.map(mapLeave),
  };
}
