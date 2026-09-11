import {
  BarChart3,
  Building2,
  CalendarCheck2,
  CalendarDays,
  Clock3,
  DatabaseBackup,
  LayoutDashboard,
  ScrollText,
  Settings,
  Timer,
  Upload,
  UserRound,
  Users,
  UsersRound,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import type { CurrentUser } from "../types/auth";

export interface NavigationItem {
  label: string;
  to: string;
  icon: LucideIcon;
  /** Shorter wording for the bottom bar, where the slot is about 70px wide. */
  shortLabel?: string;
}

export interface NavigationSection {
  id: string;
  /** Visible heading; the sidebar shows headings only when there is more than one section. */
  label: string;
  items: NavigationItem[];
}

/** What navigation needs to know about the session: the role and the scopes. */
export type NavigationSubject = Pick<CurrentUser, "role" | "isManager">;

/**
 * One source of truth for both navigations.
 *
 * The desktop sidebar and the mobile bottom bar are different shapes over the
 * SAME destinations. Keeping two lists would let a route added to one quietly
 * go missing from the other, which is exactly the failure the default-deny
 * middleware avoids on the server side.
 *
 * V3 builds the list from capabilities, not from the role alone: a manager is
 * an employee who also has a Team section. What appears here is convenience
 * only - every destination is guarded again by its route and by the server.
 */
const companySection: NavigationSection = {
  id: "company",
  label: "Company",
  items: [
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
  ],
};

const meSection: NavigationSection = {
  id: "me",
  label: "Me",
  items: [
    { label: "Dashboard", to: "/employee/dashboard", icon: LayoutDashboard, shortLabel: "Home" },
    { label: "Attendance", to: "/employee/attendance", icon: Clock3 },
    { label: "Leave", to: "/employee/leave", icon: CalendarDays },
    { label: "Payslips", to: "/employee/payroll", icon: Wallet },
    { label: "Profile", to: "/employee/profile", icon: UserRound },
  ],
};

const teamSection: NavigationSection = {
  id: "team",
  label: "My team",
  items: [
    { label: "Team overview", to: "/team", icon: UsersRound, shortLabel: "Team" },
    { label: "Team leave", to: "/team/leave", icon: CalendarCheck2 },
    { label: "Team attendance", to: "/team/attendance", icon: Timer },
  ],
};

export function navigationSectionsFor(subject: NavigationSubject): NavigationSection[] {
  if (subject.role === "admin") {
    return subject.isManager ? [companySection, teamSection] : [companySection];
  }
  return subject.isManager ? [meSection, teamSection] : [meSection];
}

/** Every destination, flattened in sidebar order. */
export function navigationFor(subject: NavigationSubject): NavigationItem[] {
  return navigationSectionsFor(subject).flatMap((section) => section.items);
}

/**
 * Which destinations reach the bottom bar directly.
 *
 * Named explicitly rather than taken as the first N of the sidebar list. That
 * shortcut looked equivalent and was not: it silently promoted Departments and
 * demoted Leave, because bar membership is about what people reach daily and
 * sidebar order is about how the sections group.
 *
 * The bar has five slots. Five destinations or fewer are all direct; more than
 * five means four direct and the rest behind "More" - never five plus More.
 */
function mobilePrimaryPaths(subject: NavigationSubject): string[] {
  if (subject.role === "admin") {
    return ["/admin/dashboard", "/admin/employees", "/admin/attendance", "/admin/leave"];
  }
  if (subject.isManager) {
    return ["/employee/dashboard", "/team", "/employee/attendance", "/employee/leave"];
  }
  return navigationFor(subject).map((item) => item.to);
}

export function mobilePrimaryFor(subject: NavigationSubject): NavigationItem[] {
  const all = navigationFor(subject);
  if (all.length <= 5) return all;

  // Mapped from the named paths rather than filtered, so the bar keeps the
  // order above rather than inheriting the sidebar's.
  return mobilePrimaryPaths(subject).slice(0, 4).map((path) => {
    const item = all.find((candidate) => candidate.to === path);
    if (!item) throw new Error(`Bottom navigation names an unknown route: ${path}`);
    return item;
  });
}

/** The destinations behind "More". Empty when everything fits in the bar. */
export function mobileOverflowFor(subject: NavigationSubject): NavigationItem[] {
  const primary = new Set(mobilePrimaryFor(subject).map((item) => item.to));
  return navigationFor(subject).filter((item) => !primary.has(item.to));
}
