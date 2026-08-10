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
  createdAt: string;
  updatedAt: string;
}

export interface EmployeeFilters {
  search?: string;
  department?: string;
  employment_status?: string;
}

export interface CreateEmployeeInput {
  employee_number: string;
  full_name: string;
  email: string;
  temporary_password: string;
  phone?: string;
  address?: string;
  date_of_birth?: string;
  gender?: string;
  emergency_contact_name?: string;
  emergency_contact_phone?: string;
  job_title?: string;
  department_id?: number;
  employment_date?: string;
  employment_status?: string;
}

export interface UpdateEmployeeInput {
  full_name?: string;
  email?: string;
  phone?: string;
  address?: string;
  job_title?: string;
  department_id?: number;
  employment_status?: string;
  emergency_contact_name?: string;
  emergency_contact_phone?: string;
}
