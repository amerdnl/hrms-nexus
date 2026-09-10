import {
  BarChart3,
  Building2,
  CalendarDays,
  Clock3,
  DatabaseBackup,
  LayoutDashboard,
  ScrollText,
  Settings,
  Upload,
  UserRound,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import type { UserRole } from "../types/auth";

export interface NavigationItem {
  label: string;
  to: string;
  icon: LucideIcon;
  /** Shorter wording for the bottom bar, where the slot is about 70px wide. */
  shortLabel?: string;
}

/**
 * One source of truth for both navigations.
 *
 * The desktop sidebar and the mobile bottom bar are different shapes over the
 * SAME destinations. Keeping two lists would let a route added to one quietly
 * go missing from the other, which is exactly the failure the default-deny
 * middleware avoids on the server side.
 */
const adminNavigation: NavigationItem[] = [
  { label: "Dashboard", to: "/admin/dashboard", icon: LayoutDashboard, shortLabel: "Home" },
  { label: "Employees", to: "/admin/employees", icon: Users, shortLabel: "People" },
  { label: "Departments", to: "/admin/departments", icon: Building2 },
  { label: "Attendance", to: "/admin/attendance", icon: Clock3 },
  { label: "Leave", to: "/admin/leave", icon: CalendarDays },
  { label: "Payroll", to: "/admin/payroll", icon: Wallet },
  { label: "Reports", to: "/admin/reports", icon: BarChart3 },
  { label: "Audit log", to: "/admin/audit", icon: ScrollText },
  { label: "Data export", to: "/admin/export", icon: DatabaseBackup },
  { label: "Import", to: "/admin/import", icon: Upload },
  { label: "Settings", to: "/admin/settings", icon: Settings },
];

const employeeNavigation: NavigationItem[] = [
  { label: "Dashboard", to: "/employee/dashboard", icon: LayoutDashboard, shortLabel: "Home" },
  { label: "Attendance", to: "/employee/attendance", icon: Clock3 },
  { label: "Leave", to: "/employee/leave", icon: CalendarDays },
  { label: "Payslips", to: "/employee/payroll", icon: Wallet },
  { label: "Profile", to: "/employee/profile", icon: UserRound },
];

export function navigationFor(role: UserRole): NavigationItem[] {
  return role === "admin" ? adminNavigation : employeeNavigation;
}

/**
 * How many destinations reach the bottom bar directly.
 *
 * An employee has exactly five, so all five fit and there is no overflow.
 * An administrator has eleven, so four are promoted and the rest move behind
 * "More" - four plus More, never five plus More, because the bar has five
 * slots in total.
 */
const MOBILE_PRIMARY_ADMIN = 4;

export function mobilePrimaryFor(role: UserRole): NavigationItem[] {
  const all = navigationFor(role);
  return role === "admin" ? all.slice(0, MOBILE_PRIMARY_ADMIN) : all;
}

/** The destinations behind "More". Empty for an employee. */
export function mobileOverflowFor(role: UserRole): NavigationItem[] {
  return role === "admin" ? navigationFor(role).slice(MOBILE_PRIMARY_ADMIN) : [];
}
