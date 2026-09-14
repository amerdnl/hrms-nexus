import { Link } from "react-router-dom";
import { resolveProfileImageUrl } from "../../api/axios";
import type { ReviewSummary } from "../../types/performance";
import { formatDate } from "../../utils/datetime";
import Avatar from "../ui/Avatar";
import StatusBadge from "../ui/StatusBadge";
import { reviewStatusMeta } from "./reviewMeta";

/** One review in a list: whose, which cycle, where it stands. Never its content. */
export default function ReviewRow({ review, showPerson }: { review: ReviewSummary; showPerson: boolean }) {
  const meta = reviewStatusMeta(review.status);
  return (
    <Link
      to={`/reviews/${review.id}`}
      className="flex flex-wrap items-center gap-3 rounded-lg px-2 py-3 transition-colors hover:bg-surface-muted focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
    >
      {showPerson && <Avatar name={review.employee.fullName} src={resolveProfileImageUrl(review.employee.profileImage)} size="sm" />}
      <span className="min-w-0 flex-1 basis-48">
        <span className="block text-sm font-semibold text-fg [overflow-wrap:anywhere]">{showPerson ? review.employee.fullName : review.cycle.name}</span>
        <span className="block text-xs text-fg-subtle [overflow-wrap:anywhere]">
          {showPerson
            ? [review.cycle.name, review.employee.departmentName].filter(Boolean).join(" · ")
            : `${formatDate(review.cycle.periodStart)} – ${formatDate(review.cycle.periodEnd)}`}
        </span>
      </span>
      <span className="flex shrink-0 flex-col items-end gap-1">
        <StatusBadge label={meta.label} tone={meta.tone} />
        {review.dueOn && review.cycle.status === "open" && (
          <span className={review.overdue ? "text-xs font-semibold text-danger-fg" : "text-xs text-fg-subtle"}>
            {review.overdue ? "Past due " : "Due "}{formatDate(review.dueOn)}
          </span>
        )}
        {review.cycle.status === "closed" && review.status !== "completed" && <span className="text-xs text-fg-subtle">Cycle closed</span>}
      </span>
    </Link>
  );
}
