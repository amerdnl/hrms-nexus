import {
  Award,
  Bell,
  CalendarCheck2,
  CalendarClock,
  CalendarDays,
  CalendarX2,
  CircleCheck,
  CircleX,
  ClipboardList,
  Hourglass,
  Megaphone,
  Network,
  PartyPopper,
  Plane,
  Target,
  UserPlus,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import type { ActionKind, NotificationKind } from "../../types/workplace";

/** One icon per kind, so a list reads at a glance. The text always says the same thing. */
export const notificationIcons: Record<NotificationKind, LucideIcon> = {
  leave_submitted: CalendarCheck2,
  leave_approved: CircleCheck,
  leave_rejected: CircleX,
  leave_cancelled: CalendarX2,
  payslip_published: Wallet,
  announcement_published: Megaphone,
  manager_changed: Network,
  report_added: UserPlus,
  task_assigned: ClipboardList,
  plan_started: ClipboardList,
  recognition_received: Award,
  goal_assigned: Target,
  goal_updated: Target,
  review_opened: ClipboardList,
  review_submitted: ClipboardList,
};

export function notificationIcon(kind: string): LucideIcon {
  return notificationIcons[kind as NotificationKind] ?? Bell;
}

export const actionIcons: Record<ActionKind, LucideIcon> = {
  leave_decision: CalendarCheck2,
  payroll_step: Wallet,
  announcement: Megaphone,
  leave_waiting: Hourglass,
  leave_upcoming: Plane,
  team_out: CalendarDays,
  holiday: PartyPopper,
  event: CalendarClock,
};
