import {
  Award,
  BarChart3,
  CalendarCheck2,
  CalendarDays,
  CalendarRange,
  ClipboardCheck,
  ClipboardList,
  Clock3,
  FileText,
  History,
  Inbox,
  Megaphone,
  Target,
  Timer,
  UserPlus,
  Users,
  UsersRound,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import type { Tint } from "../../routes/navigation";
import type { WidgetSize } from "../../types/dashboardLayout";

/*
 * The one list of Home widgets: what each is, where it belongs in the gallery,
 * the sizes it is designed for, and the capability it needs. Plain data, so the
 * gallery, the layout rules and smart ordering all read the same entries.
 *
 * Paired with `backend/src/utils/dashboardLayout.ts`, which holds the same ids,
 * sizes and capabilities and refuses to store anything else. A capability here
 * matches the guard on the endpoints the widget reads; offering or hiding a
 * widget is a convenience, and the server still authorises every request.
 */

export type WidgetCategory = "Workflows" | "Time & leave" | "Me" | "Team" | "Company" | "Pay" | "Insights";
export type WidgetCapability = "any" | "employee" | "manager" | "admin";

export interface WidgetMeta {
  id: string;
  title: string;
  description: string;
  category: WidgetCategory;
  icon: LucideIcon;
  tint: Tint;
  sizes: readonly WidgetSize[];
  requires: WidgetCapability;
}

export const widgetCatalog: readonly WidgetMeta[] = [
  { id: "action-center", title: "Action Center", description: "What needs you across HR, from requests to reviews and tasks.", category: "Workflows", icon: Inbox, tint: "amber", sizes: ["small", "medium", "large"], requires: "any" },
  { id: "my-tasks", title: "My tasks", description: "Onboarding and offboarding tasks assigned to you, to tick off here.", category: "Workflows", icon: ClipboardCheck, tint: "green", sizes: ["medium"], requires: "any" },
  { id: "today", title: "Today", description: "The company date and clock, and what is on the calendar next.", category: "Time & leave", icon: CalendarRange, tint: "teal", sizes: ["medium", "large"], requires: "any" },
  { id: "whos-out", title: "Who’s out", description: "Colleagues away on approved leave, today and in the days ahead.", category: "Time & leave", icon: CalendarDays, tint: "blue", sizes: ["medium", "large"], requires: "any" },
  { id: "company-updates", title: "Company updates", description: "The latest announcements from HR.", category: "Company", icon: Megaphone, tint: "violet", sizes: ["medium"], requires: "any" },

  { id: "my-attendance", title: "My attendance", description: "Your check-in and check-out today. Checking in stays on the verified Attendance page.", category: "Me", icon: Clock3, tint: "teal", sizes: ["small", "medium"], requires: "employee" },
  { id: "leave-balance", title: "Leave", description: "Your annual leave left, and your next leave.", category: "Time & leave", icon: CalendarCheck2, tint: "blue", sizes: ["small", "medium"], requires: "employee" },
  { id: "my-payslip", title: "Latest payslip", description: "Your most recent approved payslip.", category: "Pay", icon: Wallet, tint: "green", sizes: ["small"], requires: "employee" },
  { id: "my-goals", title: "My goals", description: "Your active goals and how far along each one is.", category: "Me", icon: Target, tint: "rose", sizes: ["small", "medium"], requires: "employee" },
  { id: "recognition", title: "Recognition", description: "Thanks you have received from colleagues.", category: "Company", icon: Award, tint: "amber", sizes: ["medium"], requires: "employee" },

  { id: "team-today", title: "Your team today", description: "Who in your team is in, late, away or not clocked in.", category: "Team", icon: UsersRound, tint: "teal", sizes: ["medium"], requires: "manager" },
  { id: "team-leave", title: "Leave to decide", description: "Your team’s leave requests waiting for your decision.", category: "Team", icon: FileText, tint: "violet", sizes: ["small", "medium"], requires: "manager" },
  { id: "team-reviews", title: "Reviews to write", description: "Manager reviews waiting on you in open review cycles.", category: "Team", icon: ClipboardList, tint: "sky", sizes: ["small", "medium"], requires: "manager" },

  { id: "headcount", title: "Headcount", description: "Employees on record, and how many are active.", category: "Company", icon: Users, tint: "teal", sizes: ["small"], requires: "admin" },
  { id: "on-leave-today", title: "On leave today", description: "People away on approved leave today.", category: "Time & leave", icon: CalendarDays, tint: "blue", sizes: ["small"], requires: "admin" },
  { id: "late-today", title: "Late today", description: "Check-ins recorded late today.", category: "Time & leave", icon: Clock3, tint: "amber", sizes: ["small"], requires: "admin" },
  { id: "pending-leave", title: "Pending requests", description: "Leave requests waiting for a decision.", category: "Workflows", icon: FileText, tint: "rose", sizes: ["small"], requires: "admin" },
  { id: "attendance-today", title: "Attendance today", description: "Present, late, absent, on leave and not yet clocked in.", category: "Time & leave", icon: Timer, tint: "blue", sizes: ["medium"], requires: "admin" },
  { id: "payroll-status", title: "Payroll", description: "The latest payroll period and where it stands.", category: "Pay", icon: Wallet, tint: "green", sizes: ["small", "medium"], requires: "admin" },
  { id: "lifecycle", title: "Onboarding & offboarding", description: "Plans in progress for joiners and leavers.", category: "Workflows", icon: UserPlus, tint: "rose", sizes: ["small", "medium"], requires: "admin" },
  { id: "recent-activity", title: "Recent activity", description: "The latest company changes recorded in the audit log.", category: "Company", icon: History, tint: "slate", sizes: ["medium"], requires: "admin" },
  { id: "recent-employees", title: "Recently added employees", description: "The newest employee records.", category: "Company", icon: UserPlus, tint: "sky", sizes: ["medium"], requires: "admin" },
  { id: "insights", title: "Insights", description: "This month’s attendance and leave, against last month.", category: "Insights", icon: BarChart3, tint: "amber", sizes: ["medium"], requires: "admin" },
];

export const widgetById = new Map(widgetCatalog.map((meta) => [meta.id, meta]));

export const sizeLabels: Record<WidgetSize, string> = { small: "Small", medium: "Medium", large: "Large" };

/** What the session is, as far as widgets care. Advisory; the server decides. */
export interface DashboardSubject {
  role: "admin" | "employee";
  isManager: boolean;
  employeeId: number | null;
}

export function canUseWidget(subject: DashboardSubject, meta: WidgetMeta): boolean {
  switch (meta.requires) {
    case "any":
      return true;
    case "employee":
      return subject.role === "employee" && subject.employeeId !== null;
    case "manager":
      return subject.role === "employee" && subject.employeeId !== null && subject.isManager;
    case "admin":
      return subject.role === "admin";
  }
}

export function widgetsFor(subject: DashboardSubject): WidgetMeta[] {
  return widgetCatalog.filter((meta) => canUseWidget(subject, meta));
}
