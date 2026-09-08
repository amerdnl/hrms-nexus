import {
  CalendarDays,
  CalendarOff,
  CircleCheck,
  CircleMinus,
  CircleX,
  Clock3,
  Siren,
  Stethoscope,
  type LucideIcon,
} from "lucide-react";
import type { AttendanceStatus } from "../types/attendance";
import type { LeaveStatus, LeaveType } from "../types/leave";

/**
 * The semantic colour roles a badge/alert can take. These map onto the
 * --success / --warning / --danger / --info token triplets from index.css.
 */
export type StatusTone =
  | "success"
  | "warning"
  | "danger"
  | "info"
  | "primary"
  | "neutral";

export interface StatusMeta {
  /** Human-readable text. Never rely on colour alone to convey this. */
  label: string;
  tone: StatusTone;
  icon: LucideIcon;
}

const attendanceStatusMap: Record<AttendanceStatus, StatusMeta> = {
  present: { label: "Present", tone: "success", icon: CircleCheck },
  late: { label: "Late", tone: "warning", icon: Clock3 },
  absent: { label: "Absent", tone: "danger", icon: CircleX },
  on_leave: { label: "On leave", tone: "info", icon: CalendarOff },
};

const leaveStatusMap: Record<LeaveStatus, StatusMeta> = {
  approved: { label: "Approved", tone: "success", icon: CircleCheck },
  pending: { label: "Pending", tone: "warning", icon: Clock3 },
  rejected: { label: "Rejected", tone: "danger", icon: CircleX },
};

const leaveTypeMap: Record<LeaveType, StatusMeta> = {
  annual: { label: "Annual", tone: "info", icon: CalendarDays },
  medical: { label: "Medical", tone: "primary", icon: Stethoscope },
  emergency: { label: "Emergency", tone: "warning", icon: Siren },
  unpaid: { label: "Unpaid", tone: "neutral", icon: CircleMinus },
};

const employmentStatusMap: Record<string, StatusMeta> = {
  active: { label: "Active", tone: "success", icon: CircleCheck },
  probation: { label: "Probation", tone: "info", icon: Clock3 },
  inactive: { label: "Inactive", tone: "neutral", icon: CircleMinus },
  resigned: { label: "Resigned", tone: "warning", icon: CircleMinus },
  terminated: { label: "Terminated", tone: "danger", icon: CircleX },
};

/** Turns an unknown backend value into something displayable, e.g. "on_leave" -> "On leave". */
function fallbackMeta(value: string): StatusMeta {
  const label = value.replace(/_/g, " ");

  return {
    label: label.charAt(0).toUpperCase() + label.slice(1),
    tone: "neutral",
    icon: CircleMinus,
  };
}

export function attendanceStatusMeta(status: AttendanceStatus): StatusMeta {
  return attendanceStatusMap[status] ?? fallbackMeta(status);
}

export function leaveStatusMeta(status: LeaveStatus): StatusMeta {
  return leaveStatusMap[status] ?? fallbackMeta(status);
}

export function leaveTypeMeta(leaveType: LeaveType): StatusMeta {
  return leaveTypeMap[leaveType] ?? fallbackMeta(leaveType);
}

/**
 * `employmentStatus` is a loose `string` in the data model rather than a
 * union, so this must tolerate values beyond active/inactive.
 */
export function employmentStatusMeta(status: string): StatusMeta {
  return employmentStatusMap[status] ?? fallbackMeta(status);
}
