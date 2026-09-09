import apiClient from "./axios";

import type {
  ApiResponse,
  AttendanceFilters,
  AttendanceRecord,
  AttendanceStatistics,
  AttendanceVerificationStatus,
  ManualAttendanceInput,
  OfficeQrChallenge,
  ReportedPosition,
  UpdateAttendanceInput,
} from "../types/attendance";

/**
 * Verified clock-in. The scanned code and the one-off position are the only
 * things sent; the server decides the official date, time and lateness.
 */
export async function checkIn(
  token: string,
  position: ReportedPosition,
): Promise<AttendanceRecord> {
  const response = await apiClient.post<ApiResponse<AttendanceRecord>>(
    "/attendance/check-in",
    { token, position },
  );

  return response.data.data;
}

export async function checkOut(
  token: string,
  position: ReportedPosition,
): Promise<AttendanceRecord> {
  const response = await apiClient.patch<ApiResponse<AttendanceRecord>>(
    "/attendance/check-out",
    { token, position },
  );

  return response.data.data;
}

/** Issues the office QR an administrator displays. Administrator-only. */
export async function issueOfficeQr(): Promise<OfficeQrChallenge> {
  const response = await apiClient.post<ApiResponse<OfficeQrChallenge>>(
    "/attendance/qr",
    {},
  );

  return response.data.data;
}

/** Whether verified attendance is usable, checked before asking for location. */
export async function getVerificationStatus(): Promise<AttendanceVerificationStatus> {
  const response = await apiClient.get<ApiResponse<AttendanceVerificationStatus>>(
    "/attendance/verification-status",
  );

  return response.data.data;
}

export async function getTodayAttendance(): Promise<AttendanceRecord | null> {
  const response =
    await apiClient.get<ApiResponse<AttendanceRecord | null>>(
      "/attendance/today",
    );

  return response.data.data;
}

export async function getMyAttendanceHistory(
  startDate?: string,
  endDate?: string,
): Promise<AttendanceRecord[]> {
  const response = await apiClient.get<ApiResponse<AttendanceRecord[]>>(
    "/attendance/my-history",
    {
      params: {
        startDate,
        endDate,
      },
    },
  );

  return response.data.data;
}

export async function getAllAttendance(
  filters: AttendanceFilters,
): Promise<AttendanceRecord[]> {
  const response = await apiClient.get<ApiResponse<AttendanceRecord[]>>(
    "/attendance",
    {
      params: filters,
    },
  );

  return response.data.data;
}

export async function createManualAttendance(
  input: ManualAttendanceInput,
): Promise<AttendanceRecord> {
  const response = await apiClient.post<ApiResponse<AttendanceRecord>>(
    "/attendance/manual",
    input,
  );

  return response.data.data;
}

export async function updateAttendance(
  attendanceId: number,
  input: UpdateAttendanceInput,
): Promise<AttendanceRecord> {
  const response = await apiClient.patch<ApiResponse<AttendanceRecord>>(
    `/attendance/${attendanceId}`,
    input,
  );

  return response.data.data;
}

export async function getAttendanceStatistics(
  date?: string,
): Promise<AttendanceStatistics> {
  const response = await apiClient.get<ApiResponse<AttendanceStatistics>>(
    "/attendance/statistics",
    {
      params: { date },
    },
  );

  return response.data.data;
}
