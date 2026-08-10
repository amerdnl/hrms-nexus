export interface Department {
  id: number;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
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
