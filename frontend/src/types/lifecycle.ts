/** Onboarding and offboarding, as the server returns them for the signed-in account. */

export type LifecycleKind = "onboarding" | "offboarding";
export type AssigneeRole = "employee" | "manager" | "hr";
export type TaskStatus = "pending" | "done" | "skipped";
export type PlanStatus = "active" | "completed" | "cancelled";
export type ExitStatus = "resigned" | "terminated" | "inactive";

export interface LifecycleTask {
  id: number;
  planId: number;
  position: number;
  title: string;
  instructions: string | null;
  assigneeRole: AssigneeRole;
  dueOn: string;
  status: TaskStatus;
  note: string | null;
  completedAt: string | null;
  overdue: boolean;
}

export interface PlanProgress {
  total: number;
  finished: number;
  overdue: number;
  nextDue: string | null;
}

export interface LifecyclePlan {
  id: number;
  employeeId: number;
  employeeName: string;
  employeeNumber: string;
  profileImage: string | null;
  departmentName: string | null;
  managerName: string | null;
  kind: LifecycleKind;
  title: string;
  status: PlanStatus;
  startsOn: string;
  targetDate: string;
  exitStatus: ExitStatus | null;
  completedAt: string | null;
  cancelledAt: string | null;
  revision: number;
  progress: PlanProgress;
}

export interface PlanDetail {
  today: string;
  /** The roles the caller holds in this plan right now; tasks are filtered to them. */
  roles: AssigneeRole[];
  plan: LifecyclePlan;
  tasks: LifecycleTask[];
}

export interface AssignedTask extends LifecycleTask {
  kind: LifecycleKind;
  planTitle: string;
  employeeId: number;
  employeeName: string;
  isOwnPlan: boolean;
}

export interface MyWork {
  today: string;
  assigned: AssignedTask[];
  ownPlans: LifecyclePlan[];
  teamPlans: LifecyclePlan[];
}

export interface TemplateTask {
  title: string;
  instructions: string | null;
  assigneeRole: AssigneeRole;
  dueOffsetDays: number;
}

export interface LifecycleTemplate {
  id: number;
  kind: LifecycleKind;
  name: string;
  description: string | null;
  isActive: boolean;
  revision: number;
  updatedAt: string;
  plansStarted: number;
  tasks: Array<TemplateTask & { position: number }>;
}

export const roleLabels: Record<AssigneeRole, string> = {
  employee: "Employee",
  manager: "Manager",
  hr: "HR",
};

export const kindLabels: Record<LifecycleKind, string> = {
  onboarding: "Onboarding",
  offboarding: "Offboarding",
};

export const exitStatusLabels: Record<ExitStatus, string> = {
  resigned: "Resigned",
  terminated: "Terminated",
  inactive: "Inactive",
};
