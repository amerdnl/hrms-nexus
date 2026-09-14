import { Eye, Lock, Users } from "lucide-react";
import { Link } from "react-router-dom";
import type { Goal } from "../../types/performance";
import { visibilityLabels } from "../../types/performance";
import { formatDate } from "../../utils/datetime";
import ProgressBar from "../ui/ProgressBar";
import StatusBadge from "../ui/StatusBadge";

const visibilityIcons = { private: Lock, team: Users, company: Eye };

/** One goal as a row: title, who can see it, how far along, and when it is due. */
export default function GoalCard({ goal, showOwner = false }: { goal: Goal; showOwner?: boolean }) {
  const VisibilityIcon = visibilityIcons[goal.visibility];
  return (
    <Link
      to={`/goals/${goal.id}`}
      className="block rounded-lg px-2 py-3 transition-colors hover:bg-surface-muted focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="min-w-0 flex-1 basis-48 text-sm font-semibold text-fg [overflow-wrap:anywhere]">{goal.title}</span>
        {goal.status === "completed" && <StatusBadge label="Completed" tone="success" />}
        {goal.status === "cancelled" && <StatusBadge label="Cancelled" tone="neutral" />}
        {goal.overdue && <StatusBadge label="Past due" tone="danger" />}
      </div>
      <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-fg-subtle">
        {showOwner && <span>{goal.ownerName}</span>}
        <span className="inline-flex items-center gap-1"><VisibilityIcon size={12} aria-hidden="true" />{visibilityLabels[goal.visibility]}</span>
        <span>Due {formatDate(goal.dueOn)}</span>
      </p>
      <div className="mt-2 flex items-center gap-3">
        <ProgressBar
          className="min-w-0 flex-1"
          size="sm"
          tone={goal.status === "completed" ? "success" : goal.overdue ? "danger" : "primary"}
          value={goal.progress}
          max={100}
          label={`${goal.progress}% done`}
          isDecorative
        />
        <span className="w-10 shrink-0 text-right text-xs font-semibold tabular-nums text-fg-muted">{goal.progress}%</span>
      </div>
    </Link>
  );
}
