import { Link } from "react-router-dom";
import { resolveProfileImageUrl } from "../../api/axios";
import type { LifecyclePlan } from "../../types/lifecycle";
import { kindLabels } from "../../types/lifecycle";
import { formatDate } from "../../utils/datetime";
import Avatar from "../ui/Avatar";
import ProgressBar from "../ui/ProgressBar";
import StatusBadge from "../ui/StatusBadge";

/** One plan as a row: who, which checklist, how far along, and what is late. */
export default function PlanProgressRow({ plan, to }: { plan: LifecyclePlan; to: string }) {
  const { total, finished, overdue } = plan.progress;
  return (
    <Link
      to={to}
      className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-3 rounded-lg px-2 py-3 transition-colors hover:bg-surface-muted focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring sm:grid-cols-[auto_minmax(0,1fr)_12rem]"
    >
      <Avatar name={plan.employeeName} src={resolveProfileImageUrl(plan.profileImage)} size="md" />
      <span className="min-w-0">
        <span className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold text-fg [overflow-wrap:anywhere]">{plan.employeeName}</span>
          {plan.status !== "active" && (
            <StatusBadge label={plan.status === "completed" ? "Completed" : "Cancelled"} tone={plan.status === "completed" ? "success" : "neutral"} />
          )}
          {plan.status === "active" && overdue > 0 && <StatusBadge label={`${overdue} overdue`} tone="danger" />}
        </span>
        <span className="block text-xs text-fg-subtle [overflow-wrap:anywhere]">
          {kindLabels[plan.kind]} · {plan.title} · {plan.kind === "offboarding" ? "last day" : "target"} {formatDate(plan.targetDate)}
        </span>
      </span>
      <span className="col-span-2 sm:col-span-1">
        <ProgressBar
          size="sm"
          tone={plan.status === "completed" ? "success" : "primary"}
          value={finished}
          max={Math.max(total, 1)}
          label={`${finished} of ${total} tasks finished`}
        />
        <span className="mt-1 block text-right text-xs text-fg-muted">{finished} of {total} finished</span>
      </span>
    </Link>
  );
}
