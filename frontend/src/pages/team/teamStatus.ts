import { CalendarOff, Clock3 } from "lucide-react";
import type { TeamMember } from "../../types/team";
import { attendanceStatusMeta, leaveTypeMeta, type StatusMeta } from "../../utils/status";

/**
 * Where one team member stands on a day, as a badge.
 *
 * Approved leave wins over a missing attendance row - someone on leave usually
 * has no record at all, and "not clocked in" would misreport them. With neither
 * a record nor leave, the badge says exactly that and no more: an absence of
 * evidence, not a judgement.
 */
export function dayStatusMeta(day: TeamMember["day"]): StatusMeta {
  if (day.status) return attendanceStatusMeta(day.status);
  if (day.onLeave) {
    return { label: `On ${leaveTypeMeta(day.onLeave.leaveType).label.toLowerCase()} leave`, tone: "info", icon: CalendarOff };
  }
  return { label: "Not clocked in", tone: "neutral", icon: Clock3 };
}
