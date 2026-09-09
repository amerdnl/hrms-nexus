export type LeaveType = "annual" | "medical" | "emergency" | "unpaid";

export type LeaveStatus = "pending" | "approved" | "rejected" | "cancelled";

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
  /** Working days consumed, snapshotted at submission. Null on older records. */
  workingDays: number | null;
  leaveYear: number | null;
  cancelledAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface LeaveBalance {
  leaveType: LeaveType;
  entitledDays: number;
  usedDays: number;
  pendingDays: number;
  /** Entitlement minus approved usage. Pending is shown separately. */
  remainingDays: number;
  /** What a new request is checked against: remaining minus pending. */
  availableDays: number;
  deductsBalance: boolean;
  isPaid: boolean;
}

export interface LeaveEntitlement {
  leave_type: LeaveType;
  entitled_days: string | number;
  carried_forward_days: string | number;
  adjustment_days: string | number;
  source: string;
  note: string | null;
}

export interface LeavePolicy {
  leave_type: LeaveType;
  default_annual_days: string | number;
  deducts_balance: boolean;
  is_paid: boolean;
  active: boolean;
}

export interface CreateLeaveRequestInput {
  leaveType: LeaveType;
  startDate: string;
  endDate: string;
  reason: string;
}

export interface UpdateLeaveStatusInput {
  status: "approved" | "rejected";
  adminComment?: string;
}

export interface SetEntitlementInput {
  leaveYear: number;
  leaveType: LeaveType;
  entitledDays: number;
  carriedForwardDays?: number;
  adjustmentDays?: number;
  note?: string;
}
