/**
 * The shared workplace layer: notifications, the Action Center, search, the
 * company calendar and announcements. Shapes mirror the server's responses;
 * every list is already filtered for the signed-in account.
 */

export type NotificationKind =
  | "leave_submitted"
  | "leave_approved"
  | "leave_rejected"
  | "leave_cancelled"
  | "payslip_published"
  | "announcement_published"
  | "manager_changed"
  | "report_added"
  | "task_assigned"
  | "plan_started"
  | "recognition_received"
  | "goal_assigned"
  | "goal_updated"
  | "review_opened"
  | "review_submitted";

export interface NotificationItem {
  id: number;
  kind: NotificationKind;
  title: string;
  body: string | null;
  /** An in-app path; the page behind it checks access again. */
  link: string | null;
  createdAt: string;
  readAt: string | null;
}

export interface NotificationPage {
  items: NotificationItem[];
  nextBefore: number | null;
  unreadCount: number;
}

export type ActionKind =
  | "leave_decision"
  | "payroll_step"
  | "announcement"
  | "leave_waiting"
  | "leave_upcoming"
  | "team_out"
  | "holiday"
  | "event"
  | "lifecycle_task"
  | "offboarding_ready"
  | "review"
  | "goal_overdue";

export interface ActionItem {
  id: string;
  kind: ActionKind;
  title: string;
  detail: string | null;
  date: string | null;
  link: string;
  important?: boolean;
}

export interface ActionCenter {
  today: string;
  requiresAction: ActionItem[];
  waiting: ActionItem[];
  upcoming: ActionItem[];
  recent: NotificationItem[];
  counts: { requiresAction: number };
}

export interface SearchResults {
  query: string;
  people: Array<{
    id: number;
    fullName: string;
    jobTitle: string | null;
    departmentName: string | null;
    profileImage: string | null;
    path: string;
  }>;
  departments: Array<{ id: number; name: string; people: number; path: string }>;
  destinations: Array<{ label: string; description: string; path: string }>;
  /** HR only: employee records in any status. */
  records: Array<{ id: number; fullName: string; employeeNumber: string; status: string; path: string }>;
}

export interface CalendarConfig {
  configured: boolean;
  timezone: string;
  /** ISO weekdays, Monday = 1 ... Sunday = 7. */
  workingDays: number[] | null;
  today: string;
}

export interface CompanyHoliday {
  date: string;
  name: string;
}

export interface Holiday extends CompanyHoliday {
  id: number;
  revision: number;
}

export interface CompanyEvent {
  id: number;
  title: string;
  description: string | null;
  location: string | null;
  startsOn: string;
  endsOn: string;
  startTime: string | null;
  endTime: string | null;
  revision: number;
}

export interface CompanyEventInput {
  title: string;
  description: string | null;
  location: string | null;
  startsOn: string;
  endsOn: string;
  startTime: string | null;
  endTime: string | null;
}

export interface Absence {
  employeeId: number;
  name: string;
  profileImage: string | null;
  departmentName: string | null;
  startDate: string;
  endDate: string;
  status: "approved" | "pending";
  /** Only for yourself, your team, or HR. */
  leaveType: string | null;
  relation: "self" | "team" | "other";
}

export interface CalendarData {
  from: string;
  to: string;
  config: CalendarConfig;
  holidays: CompanyHoliday[];
  events: CompanyEvent[];
  absences: Absence[];
  truncated: boolean;
}

export type AnnouncementStatus = "draft" | "published" | "archived";
export type AnnouncementPriority = "normal" | "important";
export type AnnouncementAudience = "company" | "department";

export interface Announcement {
  id: number;
  title: string;
  body: string;
  priority: AnnouncementPriority;
  audience: AnnouncementAudience;
  departmentId: number | null;
  departmentName: string | null;
  status: AnnouncementStatus;
  expiresOn: string | null;
  publishedAt: string | null;
  archivedAt: string | null;
  updatedAt: string;
  edited: boolean;
  revision: number;
  authorName: string | null;
  isRead: boolean;
}

export interface AnnouncementFeed {
  items: Announcement[];
  total: number;
  unreadCount: number;
  page: number;
  pageSize: number;
}

export interface ManagedAnnouncement extends Announcement {
  readCount: number;
  audienceSize: number;
}

export interface AnnouncementManagePage {
  items: ManagedAnnouncement[];
  total: number;
  counts: Partial<Record<AnnouncementStatus, number>>;
  page: number;
  pageSize: number;
}

export interface AnnouncementInput {
  title: string;
  body: string;
  priority: AnnouncementPriority;
  audience: AnnouncementAudience;
  departmentId: number | null;
  expiresOn: string | null;
}
