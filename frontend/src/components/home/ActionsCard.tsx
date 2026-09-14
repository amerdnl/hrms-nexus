import { ArrowRight, CircleCheck } from "lucide-react";
import { Link } from "react-router-dom";
import type { ActionCenter } from "../../types/workplace";
import { cn } from "../../utils/cn";
import { actionIcons } from "../workplace/workplaceIcons";
import { formatShortDay } from "./homeTime";

/**
 * "For you": the top of the Action Center, in the Home card language. Every row
 * is something the server computed for this account - a review to write, a
 * goal past due, an announcement to read, an onboarding task - and opens the
 * page where it is done.
 */
export default function ActionsCard({ data, failed, className, limit = 4 }: {
  data: ActionCenter | null; failed: boolean; className?: string; limit?: number;
}) {
  const items = data?.requiresAction ?? [];
  const today = data?.today ?? "";

  return (
    <section aria-labelledby="home-actions-title" className={cn("flex flex-col rounded-card border border-line bg-surface p-5 shadow-card sm:px-6 sm:pb-5 sm:pt-[1.375rem]", className)}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="home-actions-title" className="text-[1.0625rem] font-semibold text-fg">For you</h2>
        {data && <p className="text-[0.8125rem] text-fg-subtle">{items.length === 0 ? "All clear" : `${items.length} to do`}</p>}
      </div>

      <div className="mt-2.5 flex-1">
        {failed && <p className="text-sm text-fg-muted">Your Action Center could not be loaded.</p>}
        {!failed && !data && (
          <div aria-busy="true" className="space-y-4 pt-1">
            {[0, 1, 2].map((key) => <div key={key} aria-hidden="true" className="h-6 animate-pulse rounded bg-surface-muted motion-reduce:animate-none" />)}
          </div>
        )}
        {data && items.length === 0 && (
          <p className="flex items-center gap-2.5 py-2 text-sm text-fg-muted">
            <CircleCheck size={18} className="text-success-fg" aria-hidden="true" />
            You are all caught up.
          </p>
        )}
        {data && items.length > 0 && (
          <ul className="space-y-0.5">
            {items.slice(0, limit).map((item) => {
              const Icon = actionIcons[item.kind];
              const when = item.date ? (item.date === today ? "Today" : formatShortDay(item.date)) : null;
              return (
                <li key={item.id}>
                  <Link
                    to={item.link}
                    className="-mx-2 flex min-h-11 items-center gap-3 rounded-lg px-2 py-1.5 transition-colors hover:bg-surface-muted focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
                  >
                    <span
                      aria-hidden="true"
                      className={cn(
                        "grid size-8 shrink-0 place-items-center rounded-full",
                        item.important || item.kind === "goal_overdue" ? "bg-warning-soft text-warning-fg" : "bg-surface-muted text-fg",
                      )}
                    >
                      <Icon size={15} />
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm text-fg" title={item.detail ? `${item.title} - ${item.detail}` : item.title}>
                      {item.title}
                      {item.important && <span className="sr-only"> (important)</span>}
                    </span>
                    {when && <span className="shrink-0 text-[0.8125rem] text-fg-subtle">{when}</span>}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="mt-3 flex items-center justify-between gap-3">
        <p className="text-[0.8125rem] text-fg-subtle">{items.length > limit ? `${items.length - limit} more` : ""}</p>
        <Link to="/actions" className="inline-flex min-h-8 items-center gap-2 rounded-md text-[0.8125rem] font-medium text-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
          Action Center
          <ArrowRight size={14} aria-hidden="true" />
        </Link>
      </div>
    </section>
  );
}
