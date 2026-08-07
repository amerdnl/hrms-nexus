import axios from "axios";
import type {
  ApiResponse,
  AttendanceFilters,
  AttendanceRecord,
  AttendanceStatistics,
  ManualAttendanceInput,
  UpdateAttendanceInput,
} from "../types/attendance";

const attendanceClient = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? "http://localhost:5000/api",
});

attendanceClient.interceptors.request.use((config) => {
  const token =
    localStorage.getItem("accessToken") ?? localStorage.getItem("token");

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});

export async function checkIn(): Promise<AttendanceRecord> {
  const response = await attendanceClient.post<ApiResponse<AttendanceRecord>>(
    "/attendance/check-in",
  );

  return response.data.data;
}

export async function checkOut(): Promise<AttendanceRecord> {
  const response = await attendanceClient.patch<ApiResponse<AttendanceRecord>>(
    "/attendance/check-out",
  );

  return response.data.data;
}

export async function getTodayAttendance(): Promise<AttendanceRecord | null> {
  const response =
    await attendanceClient.get<ApiResponse<AttendanceRecord | null>>(
      "/attendance/today",
    );

  return response.data.data;
}

export async function getMyAttendanceHistory(
  startDate?: string,
  endDate?: string,
): Promise<AttendanceRecord[]> {
  const response = await attendanceClient.get<ApiResponse<AttendanceRecord[]>>(
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
  const response = await attendanceClient.get<ApiResponse<AttendanceRecord[]>>(
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
  const response = await attendanceClient.post<ApiResponse<AttendanceRecord>>(
    "/attendance/manual",
    input,
  );

  return response.data.data;
}

export async function updateAttendance(
  attendanceId: number,
  input: UpdateAttendanceInput,
): Promise<AttendanceRecord> {
  const response = await attendanceClient.patch<ApiResponse<AttendanceRecord>>(
    `/attendance/${attendanceId}`,
    input,
  );

  return response.data.data;
}

export async function getAttendanceStatistics(
  date?: string,
): Promise<AttendanceStatistics> {
  const response = await attendanceClient.get<
    ApiResponse<AttendanceStatistics>
  >("/attendance/statistics", {
    params: { date },
  });

  return response.data.data;
}
