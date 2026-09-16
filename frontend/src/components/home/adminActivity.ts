import {
  Activity,
  Award,
  CalendarDays,
  ClipboardCheck,
  Clock3,
  FileText,
  LayoutGrid,
  Megaphone,
  Settings,
  Target,
  Upload,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import type { AuditEvent } from "../../types/audit";
import { formatDate, formatDateRange } from "../../utils/datetime";
import type { ActivityEntry } from "./ActivityCard";

/*
 * HR's "Recent activity", shared by the default Home and its dashboard widget so
 * the two read the audit log identically.
 */

/** Audit actions that are not company activity: signing in, exports, reading. */
export const QUIET_ACTIONS = new Set(["LOGIN", "LOGIN_FAILED", "LOGOUT", "PASSWORD_CHANGED", "DATA_EXPORTED", "REVIEW_VIEWED"]);

const ENTITY_ICONS: Record<string, LucideIcon> = {
  employee: Users,
  leave: FileText,
  attendance: Clock3,
  department: LayoutGrid,
  payroll: Wallet,
  compensation: Wallet,
  announcement: Megaphone,
  lifecycle: ClipboardCheck,
  review: Target,
  goal: Target,
  recognition: Award,
  settings: Settings,
  holiday: CalendarDays,
  event: CalendarDays,
  import: Upload,
};

/**
 * An audit summary as a sentence to read: "employee #9006" becomes the person's
 * name when HR's employee list has it, and ISO dates read as "17-21 Aug 2026".
 * Presentation only - the audit log itself is unchanged.
 */
function readableSummary(summary: string, names: Map<number, string>): string {
  return summary
    .replace(/employee #(\d+)/g, (match, id: string) => names.get(Number(id)) ?? match)
    .replace(/(\d{4}-\d{2}-\d{2}) to (\d{4}-\d{2}-\d{2})/g, (_, from: string, to: string) => formatDateRange(from, to))
    .replace(/\b(\d{4}-\d{2}-\d{2})\b/g, (_, day: string) => formatDate(day));
}

export function toActivity(event: AuditEvent, names: Map<number, string>): ActivityEntry {
  return {
    key: event.id,
    icon: ENTITY_ICONS[event.entity_type] ?? Activity,
    text: readableSummary(event.summary, names),
    at: event.occurred_at,
    tone: event.outcome === "failure" || /DELETED|DEACTIVATED|REJECTED|CANCELLED/.test(event.action) ? "alert" : "neutral",
  };
}
