import type { StatusTone } from "../../utils/status";
import type { CycleStatus, ReviewStatus } from "../../types/performance";

export function reviewStatusMeta(status: ReviewStatus): { label: string; tone: StatusTone } {
  if (status === "pending_self") return { label: "Self-review due", tone: "warning" };
  if (status === "pending_manager") return { label: "Manager review due", tone: "info" };
  return { label: "Complete", tone: "success" };
}

export function cycleStatusMeta(status: CycleStatus): { label: string; tone: StatusTone } {
  if (status === "draft") return { label: "Draft", tone: "neutral" };
  if (status === "open") return { label: "Open", tone: "info" };
  return { label: "Closed", tone: "success" };
}
