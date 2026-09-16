import { lazy, type ComponentType, type LazyExoticComponent } from "react";
import type { WidgetSize } from "../../types/dashboardLayout";

/** Every widget renders at the size it was placed at, and only sizes its catalog entry lists. */
export interface WidgetProps {
  size: WidgetSize;
}

type WidgetModule = Record<string, ComponentType<WidgetProps>>;

/*
 * Widget code, loaded only when a personalised Home or the gallery needs it.
 * Grouped by audience so an employee never downloads HR's widgets, and so the
 * default Home - which renders none of this - costs nothing extra.
 */
const shared = () => import("./widgets/SharedWidgets") as unknown as Promise<WidgetModule>;
const employee = () => import("./widgets/EmployeeWidgets") as unknown as Promise<WidgetModule>;
const manager = () => import("./widgets/ManagerWidgets") as unknown as Promise<WidgetModule>;
const admin = () => import("./widgets/AdminWidgets") as unknown as Promise<WidgetModule>;

const pick = (load: () => Promise<WidgetModule>, name: string) =>
  lazy(async () => ({ default: (await load())[name]! }));

export const widgetComponents: Record<string, LazyExoticComponent<ComponentType<WidgetProps>>> = {
  "action-center": pick(shared, "ActionCenterWidget"),
  "my-tasks": pick(shared, "MyTasksWidget"),
  today: pick(shared, "TodayWidget"),
  "whos-out": pick(shared, "WhosOutWidget"),
  "company-updates": pick(shared, "CompanyUpdatesWidget"),
  "my-attendance": pick(employee, "MyAttendanceWidget"),
  "leave-balance": pick(employee, "LeaveBalanceWidget"),
  "my-payslip": pick(employee, "MyPayslipWidget"),
  "my-goals": pick(employee, "MyGoalsWidget"),
  recognition: pick(employee, "RecognitionWidget"),
  "team-today": pick(manager, "TeamTodayWidget"),
  "team-leave": pick(manager, "TeamLeaveWidget"),
  "team-reviews": pick(manager, "TeamReviewsWidget"),
  headcount: pick(admin, "HeadcountWidget"),
  "on-leave-today": pick(admin, "OnLeaveTodayWidget"),
  "late-today": pick(admin, "LateTodayWidget"),
  "pending-leave": pick(admin, "PendingLeaveWidget"),
  "attendance-today": pick(admin, "AttendanceTodayWidget"),
  "payroll-status": pick(admin, "PayrollStatusWidget"),
  lifecycle: pick(admin, "LifecycleWidget"),
  "recent-activity": pick(admin, "RecentActivityWidget"),
  "recent-employees": pick(admin, "RecentEmployeesWidget"),
  insights: pick(admin, "InsightsWidget"),
};
