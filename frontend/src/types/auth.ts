export type UserRole = "admin" | "employee";

export interface EmployeeProfile {
  employeeNumber: string;
  fullName: string;
  phone: string | null;
  address: string | null;
  dateOfBirth: string | null;
  gender: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  jobTitle: string | null;
  department: { id: number; name: string } | null;
  employmentDate: string | null;
  employmentStatus: string;
  profileImage: string | null;
}

export interface CurrentUser {
  id: number;
  employeeId: number | null;
  email: string;
  role: UserRole;
  isActive: boolean;
  /**
   * True while the account still holds a temporary password.
   *
   * Advisory only. It tells this client where to send the user; it is not what
   * enforces the restriction. The server refuses every protected route for such
   * an account regardless of what the browser believes or is made to believe.
   */
  mustChangePassword: boolean;
  employee: EmployeeProfile | null;
}

export interface ApiResponse<T = undefined> {
  success: boolean;
  message: string;
  data?: T;
}
