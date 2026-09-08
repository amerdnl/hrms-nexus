import apiClient from "./axios";

export interface Department {
  id: number;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
  /** Aggregated server-side; absent on the update response. */
  employee_count?: number;
  active_employee_count?: number;
}

export interface DepartmentEmployee {
  id: number;
  employee_number: string;
  full_name: string;
  phone: string | null;
  job_title: string | null;
  employment_date: string | null;
  employment_status: string;
}

interface ApiResponse<T> {
  success: boolean;
  message?: string;
  data: T;
}

export async function getDepartments(): Promise<Department[]> {
  const response =
    await apiClient.get<ApiResponse<Department[]>>("/departments");

  return response.data.data;
}

export async function getDepartmentById(id: number): Promise<Department> {
  const response = await apiClient.get<ApiResponse<Department>>(
    `/departments/${id}`,
  );

  return response.data.data;
}

export async function getDepartmentEmployees(
  id: number,
): Promise<DepartmentEmployee[]> {
  const response = await apiClient.get<ApiResponse<DepartmentEmployee[]>>(
    `/departments/${id}/employees`,
  );

  return response.data.data;
}

export async function createDepartment(input: {
  name: string;
  description?: string;
}): Promise<Department> {
  const response = await apiClient.post<ApiResponse<Department>>(
    "/departments",
    input,
  );

  return response.data.data;
}

export async function updateDepartment(
  id: number,
  input: {
    name: string;
    description?: string;
  },
): Promise<Department> {
  const response = await apiClient.put<ApiResponse<Department>>(
    `/departments/${id}`,
    input,
  );

  return response.data.data;
}

export async function deleteDepartment(id: number): Promise<void> {
  await apiClient.delete(`/departments/${id}`);
}
