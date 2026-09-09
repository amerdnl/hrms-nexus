export type UserRole = "admin" | "employee";

export interface AuthenticatedUser {
  id: number;
  employeeId: number | null;
  role: UserRole;
  /**
   * The account address, carried so an audit entry can name its actor without a
   * second query per mutation. Never a credential: the session lookup selects
   * this alongside the role and still never touches password_hash.
   */
  email: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

export {};
