export interface CompanySettingsInput {
  company_name: string;
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
}

export interface CompanySettings extends Omit<CompanySettingsInput, "company_name"> {
  id: number;
  company_name: string | null;
  created_at: Date;
  updated_at: Date;
}
