import apiClient from "./axios";
import type {
  TeamAttendanceSummaryRow,
  TeamLeaveRequest,
  TeamMember,
  TeamMemberDetail,
  TeamOverview,
} from "../types/team";

interface Envelope<T> {
  success: boolean;
  message?: string;
  data: T;
}

/**
 * The manager's team layer. None of these calls names whose team to read: the
 * server takes that from the session, so there is nothing here to substitute.
 */
export async function getTeamOverview(): Promise<TeamOverview> {
  const response = await apiClient.get<Envelope<TeamOverview>>("/team");
  return response.data.data;
}

export async function getTeamLeave(status?: string): Promise<TeamLeaveRequest[]> {
  const response = await apiClient.get<Envelope<{ leaves: TeamLeaveRequest[] }>>("/team/leave", {
    params: status ? { status } : undefined,
  });
  return response.data.data.leaves;
}

export async function getTeamAttendance(
  date?: string,
): Promise<{ date: string; today: string; members: TeamMember[] }> {
  const response = await apiClient.get<Envelope<{ date: string; today: string; members: TeamMember[] }>>(
    "/team/attendance",
    { params: date ? { date } : undefined },
  );
  return response.data.data;
}

export async function getTeamAttendanceSummary(
  from?: string,
  to?: string,
): Promise<{ from: string; to: string; rows: TeamAttendanceSummaryRow[] }> {
  const response = await apiClient.get<Envelope<{ from: string; to: string; rows: TeamAttendanceSummaryRow[] }>>(
    "/team/attendance/summary",
    { params: { from, to } },
  );
  return response.data.data;
}

/** One direct report's team layer; 404 for anyone outside the team. */
export async function getTeamMember(employeeId: number): Promise<TeamMemberDetail> {
  const response = await apiClient.get<Envelope<TeamMemberDetail>>(`/team/members/${employeeId}`);
  return response.data.data;
}
