export interface Employee {
  id: number;
  employeeNumber: string;
  fullName: string;
  phone: string | null;
  address: string | null;
  dateOfBirth: string | null;
  gender: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  jobTitle: string | null;
  departmentId: number | null;
  departmentName: string | null;
  employmentDate: string | null;
  employmentStatus: string;
  profileImage: string | null;
  /** Only returned by the single-employee endpoint, not the list. */
  email?: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Minimal directory entry. Used where every employee must be resolvable — the
 * attendance join and its department filter — without downloading full records.
 */
export interface EmployeeLookupEntry {
  id: number;
  employeeNumber: string;
  fullName: string;
  jobTitle: string | null;
  departmentId: number | null;
  departmentName: string | null;
  employmentStatus: string;
}

export const employmentStatuses = [
  "active",
  "probation",
  "inactive",
  "resigned",
  "terminated",
] as const;

export const employmentStatusLabels: Record<string, string> = {
  active: "Active",
  probation: "Probation",
  inactive: "Inactive",
  resigned: "Resigned",
  terminated: "Terminated",
};

export interface EmployeeFilters {
  search?: string;
  department?: string;
  employment_status?: string;
  job_title?: string;
  page?: number;
  page_size?: number;
}

export interface EmployeePage {
  employees: Employee[];
  page: number;
  pageSize: number;
  total: number;
  pageCount: number;
}

/** `null` clears an optional field; omitting it leaves the stored value unchanged. */
export interface CreateEmployeeInput {
  employee_number: string;
  full_name: string;
  email: string;
  temporary_password: string;
  department_id: number;
  employment_status: string;
  phone?: string | null;
  address?: string | null;
  date_of_birth?: string | null;
  gender?: string | null;
  emergency_contact_name?: string | null;
  emergency_contact_phone?: string | null;
  job_title?: string | null;
  employment_date?: string | null;
}

export interface UpdateEmployeeInput {
  full_name: string;
  department_id: number;
  employment_status: string;
  email?: string;
  phone?: string | null;
  address?: string | null;
  date_of_birth?: string | null;
  gender?: string | null;
  emergency_contact_name?: string | null;
  emergency_contact_phone?: string | null;
  job_title?: string | null;
  employment_date?: string | null;
}
