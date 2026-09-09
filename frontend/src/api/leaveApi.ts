import apiClient from "./axios";
import type {
  CreateLeaveRequestInput,
  LeaveBalance,
  LeaveEntitlement,
  LeavePolicy,
  LeaveRequest,
  LeaveStatus,
  LeaveType,
  SetEntitlementInput,
  UpdateLeaveStatusInput,
} from "../types/leave";

interface ApiLeaveRequest {
  id: number;
  employee_id: number;
  employee_name?: string;
  department_name?: string;
  leave_type: LeaveType;
  start_date: string;
  end_date: string;
  reason: string;
  status: LeaveStatus;
  admin_comment: string | null;
  reviewed_by: number | null;
  reviewed_at: string | null;
  working_days: string | number | null;
  leave_year: number | null;
  cancelled_at: string | null;
  created_at: string;
  updated_at: string;
}

interface LeaveApiResponse {
  success: boolean;
  message: string;
  data: {
    leave: ApiLeaveRequest;
  };
}

interface LeaveHistoryApiResponse {
  success: boolean;
  message: string;
  data: {
    leaves: ApiLeaveRequest[];
  };
}

function mapLeaveRequest(leave: ApiLeaveRequest): LeaveRequest {
  return {
    id: leave.id,
    employeeId: leave.employee_id,
    employeeName: leave.employee_name,
    departmentName: leave.department_name,
    leaveType: leave.leave_type,
    startDate: leave.start_date,
    endDate: leave.end_date,
    reason: leave.reason,
    status: leave.status,
    adminComment: leave.admin_comment,
    reviewedBy: leave.reviewed_by,
    reviewedAt: leave.reviewed_at,
    workingDays: leave.working_days === null || leave.working_days === undefined
      ? null : Number(leave.working_days),
    leaveYear: leave.leave_year ?? null,
    cancelledAt: leave.cancelled_at ?? null,
    createdAt: leave.created_at,
    updatedAt: leave.updated_at,
  };
}

export async function createLeaveRequest(
  input: CreateLeaveRequestInput,
): Promise<LeaveRequest> {
  const response = await apiClient.post<LeaveApiResponse>("/leaves", input);

  return mapLeaveRequest(response.data.data.leave);
}

export async function getMyLeaveRequests(): Promise<LeaveRequest[]> {
  const response = await apiClient.get<LeaveHistoryApiResponse>("/leaves/me");

  return response.data.data.leaves.map(mapLeaveRequest);
}

interface LeaveFilters {
  status?: string;
  employee?: string;
  date?: string;
}

export async function getAllLeaveRequests(
  filters: LeaveFilters = {},
): Promise<LeaveRequest[]> {
  const response = await apiClient.get<LeaveHistoryApiResponse>("/leaves", {
    params: filters,
  });

  return response.data.data.leaves.map(mapLeaveRequest);
}

export async function updateLeaveStatus(
  leaveId: number,
  input: UpdateLeaveStatusInput,
): Promise<LeaveRequest> {
  const response = await apiClient.put<LeaveApiResponse>(
    `/leaves/${leaveId}/status`,
    input,
  );

  return mapLeaveRequest(response.data.data.leave);
}

/** The signed-in employee's own balances for a leave year. */
export async function getMyLeaveBalances(
  year?: number,
): Promise<{ leaveYear: number; balances: LeaveBalance[] }> {
  const response = await apiClient.get<{
    data: { leaveYear: number; balances: LeaveBalance[] };
  }>("/leaves/me/balances", { params: year ? { year } : undefined });

  return response.data.data;
}

/** Cancels a request, releasing its days. Employees may cancel only their own. */
export async function cancelLeaveRequest(id: number): Promise<LeaveRequest> {
  const response = await apiClient.post<LeaveApiResponse>(`/leaves/${id}/cancel`, {});
  return mapLeaveRequest(response.data.data.leave);
}

export async function getLeavePolicies(): Promise<LeavePolicy[]> {
  const response = await apiClient.get<{ data: { policies: LeavePolicy[] } }>("/leaves/policies");
  return response.data.data.policies;
}

export async function updateLeavePolicy(
  leaveType: LeaveType,
  defaultAnnualDays: number,
): Promise<LeavePolicy> {
  const response = await apiClient.put<{ data: { policy: LeavePolicy } }>(
    `/leaves/policies/${leaveType}`,
    { defaultAnnualDays },
  );
  return response.data.data.policy;
}

export async function getEmployeeLeaveBalances(
  employeeId: number,
  year?: number,
): Promise<{ leaveYear: number; balances: LeaveBalance[]; entitlements: LeaveEntitlement[] }> {
  const response = await apiClient.get<{
    data: { leaveYear: number; balances: LeaveBalance[]; entitlements: LeaveEntitlement[] };
  }>(`/leaves/employees/${employeeId}/balances`, { params: year ? { year } : undefined });

  return response.data.data;
}

export async function setEmployeeEntitlement(
  employeeId: number,
  input: SetEntitlementInput,
): Promise<void> {
  await apiClient.put(`/leaves/employees/${employeeId}/entitlements`, input);
}
