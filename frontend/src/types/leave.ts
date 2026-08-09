export type LeaveType = "annual" | "medical" | "emergency" | "unpaid";

export type LeaveStatus = "pending" | "approved" | "rejected";

export interface LeaveRequest {
  id: number;
  employeeId: number;
  employeeName?: string;
  departmentName?: string;
  leaveType: LeaveType;
  startDate: string;
  endDate: string;
  reason: string;
  status: LeaveStatus;
  adminComment: string | null;
  reviewedBy: number | null;
  reviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateLeaveRequestInput {
  leaveType: LeaveType;
  startDate: string;
  endDate: string;
  reason: string;
}

export interface UpdateLeaveStatusInput {
  status: Exclude<LeaveStatus, "pending">;
  adminComment?: string;
}
