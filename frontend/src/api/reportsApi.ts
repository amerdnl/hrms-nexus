import apiClient from "./axios";
import type {
  AttendanceReport,
  LeaveReport,
  PayrollReport,
  WorkforceReport,
} from "../types/reports";

interface Envelope<T> {
  success: boolean;
  message?: string;
  data: T;
}

export interface ReportFilters {
  from?: string;
  to?: string;
  departmentId?: number | null;
  leaveType?: string | null;
  status?: string | null;
  leaveYear?: number | null;
}

/** Drops empty filters so the server applies its own defaults rather than "". */
function toParams(filters: ReportFilters): Record<string, string> {
  const params: Record<string, string> = {};
  if (filters.from) params.from = filters.from;
  if (filters.to) params.to = filters.to;
  if (filters.departmentId != null) params.departmentId = String(filters.departmentId);
  if (filters.leaveType) params.leaveType = filters.leaveType;
  if (filters.status) params.status = filters.status;
  if (filters.leaveYear != null) params.leaveYear = String(filters.leaveYear);
  return params;
}

export async function getWorkforceReport(): Promise<WorkforceReport> {
  const response = await apiClient.get<Envelope<WorkforceReport>>("/reports/workforce");
  return response.data.data;
}

export async function getAttendanceReport(filters: ReportFilters): Promise<AttendanceReport> {
  const response = await apiClient.get<Envelope<AttendanceReport>>(
    "/reports/attendance", { params: toParams(filters) },
  );
  return response.data.data;
}

export async function getLeaveReport(filters: ReportFilters): Promise<LeaveReport> {
  const response = await apiClient.get<Envelope<LeaveReport>>(
    "/reports/leave", { params: toParams(filters) },
  );
  return response.data.data;
}

export async function getPayrollReport(
  periodId: string,
  filters: ReportFilters,
): Promise<PayrollReport> {
  const response = await apiClient.get<Envelope<PayrollReport>>(
    `/reports/payroll/${periodId}`, { params: toParams(filters) },
  );
  return response.data.data;
}

/**
 * Downloads an export.
 *
 * A plain <a href> cannot be used: exports are authorized like every other
 * endpoint and the bearer token lives in memory, not in a cookie, so the request
 * has to go through the configured client. The response is therefore fetched as
 * a blob and handed to the browser through a temporary object URL.
 */
export async function downloadReport(path: string, filters: ReportFilters): Promise<void> {
  const response = await apiClient.get<Blob>(path, {
    params: toParams(filters),
    responseType: "blob",
  });

  // The server names the file; the header is only read, never constructed here.
  const disposition = String(response.headers["content-disposition"] ?? "");
  const match = /filename="?([^";]+)"?/.exec(disposition);
  const filename = match?.[1] ?? "report.csv";

  const url = URL.createObjectURL(response.data);
  try {
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.append(link);
    link.click();
    link.remove();
  } finally {
    // Revoked on the next tick so the click has started the download first.
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}

/**
 * An error body from a blob request arrives as a Blob, so the usual message
 * extraction sees nothing useful. This reads the JSON back out of it.
 */
export async function readBlobErrorMessage(error: unknown, fallback: string): Promise<string> {
  const data = (error as { response?: { data?: unknown } })?.response?.data;
  if (!(data instanceof Blob)) return fallback;
  try {
    const parsed = JSON.parse(await data.text()) as { message?: string };
    return parsed.message ?? fallback;
  } catch {
    return fallback;
  }
}
