/**
 * Route guards for V3 scopes.
 *
 * `authorizeRoles` (V2) still guards everything company-wide. These add the two
 * scopes V3 introduces. A guard only decides whether a caller may reach a route
 * at all; which records it may then see is decided per record by `policy.ts`,
 * so passing `requireManager` never means "any employee".
 */
import type { NextFunction, Request, Response } from "express";

/** Only an account whose employee currently manages someone. */
export function requireManager(request: Request, response: Response, next: NextFunction): void {
  if (!request.user) {
    response.status(401).json({ success: false, message: "Authentication is required" });
    return;
  }
  if (!request.user.isManager || request.user.employeeId === null) {
    response.status(403).json({
      success: false,
      code: "not_a_manager",
      message: "This area is for managers. No one currently reports to you.",
    });
    return;
  }
  next();
}

/** Only an account linked to an employee record - self-service needs a self. */
export function requireEmployeeRecord(request: Request, response: Response, next: NextFunction): void {
  if (!request.user) {
    response.status(401).json({ success: false, message: "Authentication is required" });
    return;
  }
  if (request.user.employeeId === null) {
    response.status(403).json({
      success: false,
      code: "no_employee_record",
      message: "This account is not linked to an employee record.",
    });
    return;
  }
  next();
}

/**
 * Leave decisions: an administrator, or a manager. A manager is then limited
 * to their own direct reports by the controller, inside the same transaction
 * that locks the request - never here, where the request is not yet known.
 */
export function authorizeLeaveDecision(request: Request, response: Response, next: NextFunction): void {
  if (!request.user) {
    response.status(401).json({ success: false, message: "Authentication is required" });
    return;
  }
  if (request.user.role !== "admin" && !request.user.isManager) {
    response.status(403).json({
      success: false,
      message: "You do not have permission to access this resource",
    });
    return;
  }
  next();
}
