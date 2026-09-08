import apiClient from "./axios";

export interface CompanySettings {
  id: number;
  company_name: string | null;
  registration_number: string | null;
  address: string | null;
  email: string | null;
  phone: string | null;
  timezone: string;
  working_days: number[];
  work_start_time: string;
  work_end_time: string;
  grace_period_minutes: number;
  office_latitude: number | null;
  office_longitude: number | null;
  attendance_radius_meters: number;
  revision: number;
  created_at: string;
  updated_at: string;
}

export type CompanySettingsInput = Omit<CompanySettings, "id" | "created_at" | "updated_at" | "company_name"> & { company_name: string };

export async function getCompanySettings(signal?: AbortSignal): Promise<CompanySettings> {
  const response = await apiClient.get<{ data: CompanySettings }>("/settings", { signal });
  return response.data.data;
}

export async function saveCompanySettings(input: CompanySettingsInput): Promise<CompanySettings> {
  const response = await apiClient.put<{ data: CompanySettings }>("/settings", input);
  return response.data.data;
}
