import apiClient from "./axios";
import type {
  CreateLeaveRequestInput,
  LeaveRequest,
  LeaveStatus,
  LeaveType,
} from "../types/leave";

interface ApiLeaveRequest {
  id: number;
  employee_id: number;
  leave_type: LeaveType;
  start_date: string;
  end_date: string;
  reason: string;
  status: LeaveStatus;
  admin_comment: string | null;
  reviewed_by: number | null;
  reviewed_at: string | null;
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
    leaveType: leave.leave_type,
    startDate: leave.start_date,
    endDate: leave.end_date,
    reason: leave.reason,
    status: leave.status,
    adminComment: leave.admin_comment,
    reviewedBy: leave.reviewed_by,
    reviewedAt: leave.reviewed_at,
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
