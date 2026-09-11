import apiClient from "./axios";

import type {
  Employee,
  EmployeeFilters,
  EmployeeLookupEntry,
  EmployeePage,
  CreateEmployeeInput,
  UpdateEmployeeInput,
} from "../types/employee";

import type { ApiResponse } from "../types/auth";

interface EmployeeApiResponse<T> {
  success: boolean;
  message?: string;
  data: T;
}

interface PaginationMeta {
  page: number;
  page_size: number;
  total: number;
  page_count: number;
}

interface EmployeeApiData {
  id: string;
  employee_number: string;
  full_name: string;
  phone: string | null;
  address: string | null;
  date_of_birth: string | null;
  gender: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  job_title: string | null;
  department_id: string | null;
  department_name: string | null;
  employment_date: string | null;
  employment_status: string;
  profile_image: string | null;
  email?: string | null;
  created_at: string;
  updated_at: string;
  manager_id?: string | number | null;
  manager_name?: string | null;
  direct_reports?: Array<{
    id: string | number;
    employee_number: string;
    full_name: string;
    job_title: string | null;
    employment_status: string;
  }>;
}

interface EmployeeLookupApiData {
  id: string;
  employee_number: string;
  full_name: string;
  job_title: string | null;
  department_id: string | null;
  department_name: string | null;
  employment_status: string;
  manager_id?: string | number | null;
}

function mapEmployee(data: EmployeeApiData): Employee {
  return {
    id: Number(data.id),
    employeeNumber: data.employee_number,
    fullName: data.full_name,
    phone: data.phone,
    address: data.address,
    dateOfBirth: data.date_of_birth,
    gender: data.gender,
    emergencyContactName: data.emergency_contact_name,
    emergencyContactPhone: data.emergency_contact_phone,
    jobTitle: data.job_title,
    departmentId: data.department_id ? Number(data.department_id) : null,
    departmentName: data.department_name,
    employmentDate: data.employment_date,
    employmentStatus: data.employment_status,
    profileImage: data.profile_image,
    email: data.email ?? null,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
    managerId: data.manager_id === null || data.manager_id === undefined ? null : Number(data.manager_id),
    managerName: data.manager_name ?? null,
    directReports: data.direct_reports?.map((report) => ({
      id: Number(report.id),
      employeeNumber: report.employee_number,
      fullName: report.full_name,
      jobTitle: report.job_title,
      employmentStatus: report.employment_status,
    })),
  };
}

/**
 * Server-paginated employee list. The server also owns filtering and the row
 * total, so the browser never holds more than one page.
 */
export async function getEmployees(
  filters?: EmployeeFilters,
): Promise<EmployeePage> {
  const response = await apiClient.get<
    EmployeeApiResponse<EmployeeApiData[]> & { pagination?: PaginationMeta }
  >("/employees", { params: filters });

  const pagination = response.data.pagination;
  const employees = response.data.data.map(mapEmployee);

  return {
    employees,
    page: pagination?.page ?? 1,
    pageSize: pagination?.page_size ?? employees.length,
    total: pagination?.total ?? employees.length,
    pageCount: pagination?.page_count ?? 1,
  };
}

/** Complete lightweight directory; never paginated. */
export async function getEmployeeLookup(): Promise<EmployeeLookupEntry[]> {
  const response =
    await apiClient.get<EmployeeApiResponse<EmployeeLookupApiData[]>>(
      "/employees/lookup",
    );

  return response.data.data.map((entry) => ({
    id: Number(entry.id),
    employeeNumber: entry.employee_number,
    fullName: entry.full_name,
    jobTitle: entry.job_title,
    departmentId: entry.department_id ? Number(entry.department_id) : null,
    departmentName: entry.department_name,
    employmentStatus: entry.employment_status,
    managerId: entry.manager_id === null || entry.manager_id === undefined ? null : Number(entry.manager_id),
  }));
}

/** Every distinct job title, so the filter is not limited to the current page. */
export async function getEmployeeJobTitles(): Promise<string[]> {
  const response =
    await apiClient.get<EmployeeApiResponse<string[]>>("/employees/job-titles");

  return response.data.data;
}

export async function getEmployeeById(id: number): Promise<Employee> {
  const response = await apiClient.get<EmployeeApiResponse<EmployeeApiData>>(
    `/employees/${id}`,
  );

  return mapEmployee(response.data.data);
}

export async function createEmployee(
  input: CreateEmployeeInput,
): Promise<Employee> {
  const response = await apiClient.post<EmployeeApiResponse<EmployeeApiData>>(
    "/employees",
    input,
  );

  return mapEmployee(response.data.data);
}

export async function updateEmployee(
  id: number,
  input: UpdateEmployeeInput,
): Promise<Employee> {
  const response = await apiClient.put<EmployeeApiResponse<EmployeeApiData>>(
    `/employees/${id}`,
    input,
  );

  return mapEmployee(response.data.data);
}

export async function deleteEmployee(id: number): Promise<void> {
  await apiClient.delete(`/employees/${id}`);
}

export async function reactivateEmployee(id: number) {
  const response = await apiClient.patch<ApiResponse>(
    `/employees/${id}/reactivate`,
  );

  return response.data.data;
}
