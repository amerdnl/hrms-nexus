import type { RecognitionCategory } from "./recognition";

export interface GoalCounts {
  active: number;
  completed: number;
  cancelled: number;
  /** Active goals whose due date has passed. */
  overdue: number;
}

export interface LifecycleSummary {
  active: number;
  overdueTasks: number;
  completedInWindow: number;
}

export interface CycleProgress {
  id: number;
  name: string;
  status: "open" | "closed";
  selfDueOn: string;
  managerDueOn: string;
  participants: number;
  pendingSelf: number;
  pendingManager: number;
  completed: number;
}

export interface CategoryCount {
  category: RecognitionCategory;
  count: number;
}

export interface ActivePlan {
  id: number;
  kind: "onboarding" | "offboarding";
  title: string;
  employeeName: string;
  targetDate: string;
  tasksFinished: number;
  tasksTotal: number;
  overdueTasks: number;
}

export interface CompanyAnalytics {
  today: string;
  windowStart: string;
  windowDays: number;
  lifecycle: { onboarding: LifecycleSummary; offboarding: LifecycleSummary; plans: ActivePlan[] };
  performance: { goals: GoalCounts; cycles: CycleProgress[] };
  recognition: { total: number; employeesRecognised: number; workingEmployees: number; byCategory: CategoryCount[] };
}

export interface TeamAnalytics {
  today: string;
  windowStart: string;
  windowDays: number;
  teamSize: number;
  goals: GoalCounts;
  reviews: CycleProgress[];
  leave: { year: number; approvedDays: Array<{ leaveType: string; days: number }> };
  recognition: { total: number; byCategory: CategoryCount[] };
  lifecycle: { onboarding: number; offboarding: number };
}
