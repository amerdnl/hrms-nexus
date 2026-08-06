import type { UserRole } from "../types/auth";

export function roleDashboard(role: UserRole): string {
  return role === "admin" ? "/admin/dashboard" : "/employee/dashboard";
}
