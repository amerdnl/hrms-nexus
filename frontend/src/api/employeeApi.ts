import apiClient from "./axios";

import type {
  Employee,
  EmployeeFilters,
  CreateEmployeeInput,
  UpdateEmployeeInput,
} from "../types/employee";

import type { ApiResponse } from "../types/auth";

interface EmployeeApiResponse<T> {
  success: boolean;
  message?: string;
  data: T;
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
  created_at: string;
  updated_at: string;
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
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  };
}

export async function getEmployees(
  filters?: EmployeeFilters,
): Promise<Employee[]> {
  const response = await apiClient.get<EmployeeApiResponse<EmployeeApiData[]>>(
    "/employees",
    {
      params: filters,
    },
  );

  return response.data.data.map(mapEmployee);
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

export async function permanentlyDeleteEmployee(id: number): Promise<void> {
  await apiClient.delete(`/employees/${id}/permanent`);
}

export async function reactivateEmployee(id: number) {
  const response = await apiClient.patch<ApiResponse>(
    `/employees/${id}/reactivate`,
  );

  return response.data.data;
}
