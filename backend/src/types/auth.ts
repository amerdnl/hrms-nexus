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
  /**
   * True while the account still holds a generated or administrator-set
   * temporary password.
   *
   * Read from the database on every authenticated request and deliberately NOT
   * carried in the JWT: a token minted before the change would otherwise keep
   * asserting the old answer, and a token minted while flagged would keep
   * asserting it after the password was replaced. The column is the only
   * authority.
   */
  mustChangePassword: boolean;
  /**
   * True while at least one active or probation employee reports to this
   * account's employee record.
   *
   * Derived from employees.manager_id on every request, never stored and never
   * a token claim: manager is a scope over current reporting lines, not a role.
   * Removing someone's last report removes this on their very next request.
   * It grants the team layer only - nothing company-wide, which stays admin.
   */
  isManager: boolean;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

export {};
