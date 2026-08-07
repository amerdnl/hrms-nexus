export type UserRole = "admin" | "employee";

export interface AuthenticatedUser {
  id: number;
  employeeId: number | null;
  role: UserRole;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

export {};
