import { CircleCheck, ClipboardList, FileText } from "lucide-react";
import { Link } from "react-router-dom";
import { leaveTypeMeta } from "../../../utils/status";
import KpiCard from "../../home/KpiCard";
import TeamCard from "../../home/TeamCard";
import { formatDayRange, formatShortDay } from "../../home/homeTime";
import { sources, useSource } from "../dashboardData";
import type { WidgetProps } from "../widgetRegistry";
import WidgetShell, { WidgetEmpty, WidgetFailed, WidgetLoading } from "./WidgetShell";

/**
 * A manager's widgets: direct reports only, through the team and review
 * endpoints that already scope themselves to this manager. No pay, no
 * coordinates, nothing about anyone outside the team.
 */

export function TeamTodayWidget() {
  return <TeamCard className="h-full" />;
}

const rowLink = "-mx-2 flex items-start justify-between gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-surface-muted focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring";

export function TeamLeaveWidget({ size }: WidgetProps) {
  const { data, failed } = useSource(sources.teamOverview);
  const pending = data?.pending ?? [];
  const count = data?.counts.pendingDecisions ?? 0;

  if (size === "small") {
    return (
      <KpiCard
        icon={FileText}
        tint="violet"
        label="Leave to decide"
        isLoading={!data && !failed}
        value={failed ? "—" : count}
        detail={failed ? "Could not be loaded" : !data ? undefined : count === 0 ? "Nothing waiting" : "Waiting for you"}
        to="/team/leave"
        className="h-full"
      />
    );
  }

  return (
    <WidgetShell title="Leave to decide" aside={data ? (count === 0 ? "All clear" : `${count} waiting`) : undefined} footer={{ label: "Team leave", to: "/team/leave" }}>
      {failed ? <WidgetFailed what="Your team's leave" /> : !data ? <WidgetLoading /> : pending.length === 0 ? (
        <WidgetEmpty icon={CircleCheck} title="Nothing to decide" description="New requests from your team appear here." />
      ) : (
        <ul className="space-y-0.5">
          {pending.slice(0, 3).map((request) => (
            <li key={request.id}>
              <Link to="/team/leave" className={rowLink}>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-fg">{request.employeeName}</span>
                  <span className="block text-xs text-fg-subtle">{leaveTypeMeta(request.leaveType).label} · {formatDayRange(request.startDate, request.endDate)}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </WidgetShell>
  );
}

export function TeamReviewsWidget({ size }: WidgetProps) {
  const { data, failed } = useSource(sources.teamReviews);
  const waiting = (data?.reviews ?? [])
    .filter((review) => review.status === "pending_manager" && review.cycle.status === "open")
    .sort((a, b) => (a.dueOn ?? "9999").localeCompare(b.dueOn ?? "9999"));
  const overdue = waiting.filter((review) => review.overdue).length;

  if (size === "small") {
    return (
      <KpiCard
        icon={ClipboardList}
        tint="sky"
        label="Reviews to write"
        isLoading={!data && !failed}
        value={failed ? "—" : waiting.length}
        detail={failed ? "Could not be loaded" : !data ? undefined : overdue > 0 ? `${overdue} overdue` : waiting[0]?.dueOn ? `Due ${formatShortDay(waiting[0].dueOn)}` : "Nothing waiting"}
        to="/team/reviews"
        className="h-full"
      />
    );
  }

  return (
    <WidgetShell title="Reviews to write" aside={data ? (waiting.length === 0 ? "All clear" : `${waiting.length} waiting`) : undefined} footer={{ label: "Team reviews", to: "/team/reviews" }}>
      {failed ? <WidgetFailed what="Your team's reviews" /> : !data ? <WidgetLoading /> : waiting.length === 0 ? (
        <WidgetEmpty icon={CircleCheck} title="No reviews waiting" description="Reviews appear here once your part of a cycle is open." />
      ) : (
        <ul className="space-y-0.5">
          {waiting.slice(0, 3).map((review) => (
            <li key={review.id}>
              <Link to={`/reviews/${review.id}`} className={rowLink}>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-fg">{review.employee.fullName}</span>
                  <span className="block truncate text-xs text-fg-subtle">{review.cycle.name}</span>
                </span>
                {review.dueOn && (
                  <span className={review.overdue ? "shrink-0 text-xs font-medium text-warning-fg" : "shrink-0 text-xs text-fg-subtle"}>
                    {review.overdue ? "Overdue" : `Due ${formatShortDay(review.dueOn)}`}
                  </span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </WidgetShell>
  );
}
