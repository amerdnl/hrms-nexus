/** Goals and performance reviews, as the server returns them for the signed-in account. */

export type GoalVisibility = "private" | "team" | "company";
export type GoalStatus = "active" | "completed" | "cancelled";
export type GoalRelation = "owner" | "manager" | "hr" | "peer" | "coworker";

export const visibilityLabels: Record<GoalVisibility, string> = {
  private: "Private",
  team: "Team",
  company: "Company",
};

export const visibilityDescriptions: Record<GoalVisibility, string> = {
  private: "You, your manager and HR.",
  team: "Also colleagues who share your manager.",
  company: "Everyone in the company.",
};

export interface Goal {
  id: number;
  ownerId: number;
  ownerName: string;
  ownerImage: string | null;
  title: string;
  description: string | null;
  startsOn: string;
  dueOn: string;
  status: GoalStatus;
  /** 0-100, recorded by the owner or their manager; 100 when completed. */
  progress: number;
  visibility: GoalVisibility;
  createdAs: "owner" | "manager";
  completedAt: string | null;
  cancelledAt: string | null;
  updatedAt: string;
  revision: number;
  overdue: boolean;
  canChange?: boolean;
}

export interface GoalUpdate {
  id: number;
  authorRole: "owner" | "manager";
  authorName: string | null;
  progressBefore: number;
  progressAfter: number;
  statusBefore: GoalStatus;
  statusAfter: GoalStatus;
  note: string | null;
  createdAt: string;
}

export interface GoalList {
  today: string;
  goals: Goal[];
}

export interface GoalDetail {
  today: string;
  relation: GoalRelation;
  goal: Goal;
  updates: GoalUpdate[];
}

export interface GoalInput {
  ownerId?: number | null;
  title: string;
  description: string | null;
  startsOn: string;
  dueOn: string;
  visibility: GoalVisibility;
}

export type ReviewStatus = "pending_self" | "pending_manager" | "completed";
export type CycleStatus = "draft" | "open" | "closed";

export interface ReviewCycle {
  id: number;
  name: string;
  periodStart: string;
  periodEnd: string;
  selfDueOn: string;
  managerDueOn: string;
  status: CycleStatus;
  openedAt: string | null;
  closedAt: string | null;
  revision: number;
  counts: { participants: number; pendingSelf: number; pendingManager: number; completed: number };
}

export interface ReviewSummary {
  id: number;
  cycle: { id: number; name: string; status: CycleStatus; selfDueOn: string; managerDueOn: string; periodStart: string; periodEnd: string };
  employee: { id: number; fullName: string; jobTitle: string | null; profileImage: string | null; departmentName: string | null; managerName: string | null };
  status: ReviewStatus;
  selfSubmittedAt: string | null;
  managerSubmittedAt: string | null;
  respondedAt: string | null;
  dueOn: string | null;
  overdue: boolean;
}

export interface ReviewRating {
  value: number;
  label: string;
}

export interface ReviewDetail extends ReviewSummary {
  role: "employee" | "manager" | "hr";
  content: {
    self: { summary: string | null; rating: ReviewRating | null } | null;
    manager: { summary: string | null; rating: ReviewRating | null } | null;
    response: string | null;
  };
  can: { writeSelf: boolean; writeManager: boolean; respond: boolean };
  ratingScale: ReviewRating[];
}

export const reviewStatusLabels: Record<ReviewStatus, string> = {
  pending_self: "Self-review to write",
  pending_manager: "Manager review to write",
  completed: "Complete",
};
