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
 * Which destinations reach the bottom bar directly.
 *
 * Named explicitly rather than taken as the first N of the sidebar list. That
 * shortcut looked equivalent and was not: it silently promoted Departments and
 * demoted Leave, because bar membership is about what people reach daily and
 * sidebar order is about how the sections group. Tying one to the other means
 * reordering the sidebar quietly reorganises the phone.
 *
 * An employee has exactly five destinations, so all five are direct and there
 * is no overflow. An administrator has eleven, so four are direct and the rest
 * move behind "More" - four plus More, never five plus More, because the bar
 * has five slots in total.
 */
const ADMIN_MOBILE_PRIMARY = [
  "/admin/dashboard",
  "/admin/employees",
  "/admin/attendance",
  "/admin/leave",
];

export function mobilePrimaryFor(role: UserRole): NavigationItem[] {
  const all = navigationFor(role);
  if (role !== "admin") return all;

  // Mapped from the named paths rather than filtered, so the bar keeps the
  // order above rather than inheriting the sidebar's.
  return ADMIN_MOBILE_PRIMARY.map((path) => {
    const item = all.find((candidate) => candidate.to === path);
    if (!item) throw new Error(`Bottom navigation names an unknown route: ${path}`);
    return item;
  });
}

/** The destinations behind "More". Empty for an employee. */
export function mobileOverflowFor(role: UserRole): NavigationItem[] {
  if (role !== "admin") return [];
  return navigationFor(role).filter(
    (item) => !ADMIN_MOBILE_PRIMARY.includes(item.to),
  );
}
