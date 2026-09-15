import {
  Award,
  BarChart3,
  Building2,
  CalendarCheck2,
  CalendarDays,
  CalendarRange,
  ClipboardCheck,
  ClipboardList,
  Clock3,
  Contact,
  DatabaseBackup,
  House,
  Inbox,
  Megaphone,
  Network,
  ScrollText,
  Settings,
  Target,
  Timer,
  TrendingUp,
  Upload,
  UserMinus,
  UserPlus,
  UserRound,
  Users,
  UsersRound,
  Wallet,
  Workflow,
  type LucideIcon,
} from "lucide-react";
import type { CurrentUser } from "../types/auth";
import { roleDashboard } from "./roleDashboard";

/** The pale tile colours a destination is drawn on, from the design tokens. */
export type Tint = "teal" | "blue" | "violet" | "green" | "amber" | "rose" | "sky" | "slate";

export interface NavigationItem {
  label: string;
  to: string;
  icon: LucideIcon;
  tint: Tint;
  /** Shorter wording where the slot is narrow, e.g. a launcher tile on a phone. */
  shortLabel?: string;
  /** Extra words the launcher's filter also matches ("pay" finds Payslips). */
  keywords?: string;
}

export interface NavigationSection {
  id: string;
  label: string;
  items: NavigationItem[];
}

/** One of the four persistent destinations in the header. */
export interface PrimaryItem {
  id: "home" | "people" | "insights" | "team" | "growth" | "workflows";
  label: string;
  to: string;
  icon: LucideIcon;
  /**
   * Path prefixes that belong to this destination, so People stays lit on an
   * employee record and Workflows on an onboarding plan. The exact `to` path
   * always matches.
   */
  sections: string[];
}

/** What navigation needs to know about the session: the role and the scopes. */
export type NavigationSubject = Pick<CurrentUser, "role" | "isManager">;

/*
 * One registry of destinations, shaped two ways: the four persistent header
 * destinations and the App Launcher's complete, grouped directory. Keeping a
 * single source is what stops a route from appearing in one and quietly going
 * missing from the other - the failure the default-deny server avoids on its
 * side.
 *
 * Built from capabilities, not from the role alone: a manager is an employee
 * who also has a Team group. What appears here is convenience only; every
 * destination is guarded again by its route and by the server.
 */
const to = {
  // One directory for everyone. HR's employee management lives inside it
  // (list view, status filters, row actions), so there is no second
  // "Employees" destination competing with it; /admin/employees redirects here.
  people: { label: "People", to: "/people", icon: Contact, tint: "teal", keywords: "directory colleagues coworkers employees staff records" },
  departments: { label: "Departments", to: "/admin/departments", icon: Building2, tint: "sky", keywords: "teams units" },
  org: { label: "Org chart", to: "/org", icon: Network, tint: "slate", shortLabel: "Org", keywords: "reporting lines structure manager" },
  adminAttendance: { label: "Attendance", to: "/admin/attendance", icon: Clock3, tint: "blue", keywords: "check in time clock" },
  adminLeave: { label: "Leave", to: "/admin/leave", icon: CalendarDays, tint: "violet", keywords: "time off holiday requests" },
  calendar: { label: "Calendar", to: "/calendar", icon: CalendarRange, tint: "sky", keywords: "events holidays who is out" },
  actions: { label: "Action Center", to: "/actions", icon: Inbox, tint: "teal", shortLabel: "Actions", keywords: "to do approvals inbox" },
  tasks: { label: "My tasks", to: "/tasks", icon: ClipboardCheck, tint: "green", shortLabel: "Tasks", keywords: "checklist" },
  onboarding: { label: "Onboarding", to: "/admin/onboarding", icon: UserPlus, tint: "rose", keywords: "joiners new hire" },
  offboarding: { label: "Offboarding", to: "/admin/offboarding", icon: UserMinus, tint: "amber", keywords: "leavers exit" },
  performance: { label: "Performance", to: "/admin/performance", icon: TrendingUp, tint: "blue", keywords: "review cycles appraisal" },
  payroll: { label: "Payroll", to: "/admin/payroll", icon: Wallet, tint: "green", keywords: "pay salary payslips" },
  reports: { label: "Reports", to: "/admin/reports", icon: BarChart3, tint: "amber", keywords: "analytics insights" },
  recognition: { label: "Recognition", to: "/recognition", icon: Award, tint: "amber", shortLabel: "Kudos", keywords: "kudos thanks" },
  announcements: { label: "Announcements", to: "/announcements", icon: Megaphone, tint: "violet", shortLabel: "News", keywords: "news updates" },
  importData: { label: "Import", to: "/admin/import", icon: Upload, tint: "slate", keywords: "upload spreadsheet csv" },
  exportData: { label: "Data export", to: "/admin/export", icon: DatabaseBackup, tint: "slate", shortLabel: "Export", keywords: "download backup csv" },
  audit: { label: "Audit log", to: "/admin/audit", icon: ScrollText, tint: "slate", shortLabel: "Audit", keywords: "history activity" },
  settings: { label: "Settings", to: "/admin/settings", icon: Settings, tint: "slate", keywords: "company policies holidays" },
  myAttendance: { label: "Attendance", to: "/employee/attendance", icon: Clock3, tint: "blue", keywords: "check in time clock" },
  myLeave: { label: "Leave", to: "/employee/leave", icon: CalendarDays, tint: "violet", keywords: "time off holiday apply balance" },
  payslips: { label: "Payslips", to: "/employee/payroll", icon: Wallet, tint: "green", keywords: "pay salary" },
  goals: { label: "Goals", to: "/goals", icon: Target, tint: "rose", keywords: "objectives progress" },
  reviews: { label: "Reviews", to: "/reviews", icon: ClipboardList, tint: "blue", keywords: "performance self review" },
  profile: { label: "Profile", to: "/employee/profile", icon: UserRound, tint: "teal", keywords: "me account password photo" },
  teamOverview: { label: "Team overview", to: "/team", icon: UsersRound, tint: "teal", shortLabel: "Team", keywords: "my team reports" },
  teamLeave: { label: "Team leave", to: "/team/leave", icon: CalendarCheck2, tint: "violet", keywords: "approve requests" },
  teamAttendance: { label: "Team attendance", to: "/team/attendance", icon: Timer, tint: "blue", keywords: "who is in" },
  teamGoals: { label: "Team goals", to: "/team/goals", icon: Target, tint: "rose", keywords: "objectives" },
  teamReviews: { label: "Team reviews", to: "/team/reviews", icon: ClipboardList, tint: "sky", keywords: "performance" },
} satisfies Record<string, NavigationItem>;

const teamSection: NavigationSection = {
  id: "team",
  label: "My team",
  items: [to.teamOverview, to.teamLeave, to.teamAttendance, to.teamGoals, to.teamReviews],
};

export type NavigationArea = "people" | "workflows";

/**
 * The pages inside a header destination, shown as tabs under their page titles
 * (AreaNav) and as the matching App Launcher group for HR.
 *
 * People is the directory, then how the company is structured. Workflows is
 * work that needs to happen: the Action Center, the account's own task
 * records and, for HR, the processes those items come from.
 */
export function areaNavigationFor(subject: NavigationSubject, area: NavigationArea): NavigationSection {
  const admin = subject.role === "admin";
  if (area === "people") {
    return { id: "people", label: "People", items: admin ? [to.people, to.departments, to.org] : [to.people, to.org] };
  }
  return {
    id: "workflows",
    label: "Workflows",
    items: admin ? [to.actions, to.tasks, to.onboarding, to.offboarding, to.performance] : [to.actions, to.tasks],
  };
}

function adminSections(subject: NavigationSubject): NavigationSection[] {
  return [
    areaNavigationFor(subject, "people"),
    { id: "time", label: "Time & leave", items: [to.adminAttendance, to.adminLeave, to.calendar] },
    areaNavigationFor(subject, "workflows"),
    { id: "pay", label: "Pay & insights", items: [to.payroll, to.reports] },
    { id: "workplace", label: "Workplace", items: [to.recognition, to.announcements] },
    { id: "administration", label: "Administration", items: [to.importData, to.exportData, to.audit, to.settings] },
  ];
}

function employeeSections(): NavigationSection[] {
  return [
    { id: "me", label: "Me", items: [to.myAttendance, to.myLeave, to.payslips, to.goals, to.reviews, to.profile] },
    { id: "workplace", label: "Workplace", items: [to.actions, to.tasks, to.people, to.org, to.calendar, to.recognition, to.announcements] },
  ];
}

/** The App Launcher's groups: every destination this session may open. */
export function navigationSectionsFor(subject: NavigationSubject): NavigationSection[] {
  const sections = subject.role === "admin" ? adminSections(subject) : employeeSections();
  if (!subject.isManager) return sections;
  // The team layer sits right after the account's own area: after Me for an
  // employee, and after People for HR.
  return [sections[0], teamSection, ...sections.slice(1)];
}

/**
 * The launcher's shortcuts: the six destinations this session opens most,
 * shown before the full directory ("View all pages").
 */
export function featuredFor(subject: NavigationSubject): NavigationItem[] {
  if (subject.role === "admin") return [to.people, to.adminAttendance, to.adminLeave, to.payroll, to.departments, to.reports];
  if (subject.isManager) return [to.teamOverview, to.teamLeave, to.myAttendance, to.myLeave, to.payslips, to.people];
  return [to.myAttendance, to.myLeave, to.payslips, to.goals, to.people, to.calendar];
}

/** Every launcher destination, flattened in launcher order. */
export function navigationFor(subject: NavigationSubject): NavigationItem[] {
  return navigationSectionsFor(subject).flatMap((section) => section.items);
}

/**
 * The four persistent destinations: Home, People, a role's insight
 * destination and Workflows.
 *
 * The third slot is honest rather than uniform. HR's Insights is Reports.
 * A manager's best insight destination is their team overview, which carries
 * the team insights, so it is named Team. An employee has no reporting
 * destination at all, and a page invented to fill the slot would be fake UI,
 * so theirs is Growth: goals and reviews, their own progress.
 */
export function primaryNavigationFor(subject: NavigationSubject): PrimaryItem[] {
  const home: PrimaryItem = { id: "home", label: "Home", to: roleDashboard(subject.role), icon: House, sections: [] };
  const people: PrimaryItem = {
    id: "people",
    label: "People",
    to: "/people",
    icon: Users,
    sections: subject.role === "admin" ? ["/people", "/org", "/admin/employees", "/admin/departments"] : ["/people", "/org"],
  };
  const workflows: PrimaryItem = {
    id: "workflows",
    label: "Workflows",
    to: "/actions",
    icon: Workflow,
    sections:
      subject.role === "admin"
        ? ["/actions", "/tasks", "/notifications", "/lifecycle", "/admin/onboarding", "/admin/offboarding", "/admin/lifecycle", "/admin/performance"]
        : ["/actions", "/tasks", "/notifications", "/lifecycle"],
  };

  let third: PrimaryItem;
  if (subject.role === "admin") {
    third = { id: "insights", label: "Insights", to: "/admin/reports", icon: BarChart3, sections: ["/admin/reports"] };
  } else if (subject.isManager) {
    third = { id: "team", label: "Team", to: "/team", icon: UsersRound, sections: ["/team"] };
  } else {
    third = { id: "growth", label: "Growth", to: "/goals", icon: Target, sections: ["/goals", "/reviews"] };
  }

  return [home, people, third, workflows];
}

/** Whether a header destination owns the current page. */
export function isPrimaryActive(item: PrimaryItem, pathname: string): boolean {
  if (pathname === item.to) return true;
  return item.sections.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

/** Whether a launcher destination is the current page (Team overview must not light up on /team/leave). */
export function isDestinationActive(item: NavigationItem, pathname: string): boolean {
  if (item.to === "/team") return pathname === "/team";
  return pathname === item.to || pathname.startsWith(`${item.to}/`);
}

/** The launcher's filter: label, group name and keywords, case-insensitive. */
export function filterSections(sections: NavigationSection[], query: string): NavigationSection[] {
  const term = query.trim().toLowerCase();
  if (!term) return sections;
  return sections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) =>
        `${item.label} ${item.shortLabel ?? ""} ${section.label} ${item.keywords ?? ""}`.toLowerCase().includes(term),
      ),
    }))
    .filter((section) => section.items.length > 0);
}
