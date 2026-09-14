import { ArrowRight, type LucideIcon } from "lucide-react";
import { Link } from "react-router-dom";
import { cn } from "../../utils/cn";
import { compactAgo } from "./homeTime";

export interface ActivityEntry {
  key: string;
  icon: LucideIcon;
  text: string;
  at: string;
  /** "alert" draws the reference's red disc, for a failure or a removal. */
  tone?: "neutral" | "alert";
  to?: string | null;
}

/**
 * Recent activity: something that really happened, most recent first. The
 * caller decides the source - HR reads the audit log, everyone else their
 * own notifications - and this renders it in the reference's language.
 */
export default function ActivityCard({ state, entries, viewAllTo, className, emptyText }: {
  state: "loading" | "ready" | "failed";
  entries: ActivityEntry[];
  viewAllTo: string;
  className?: string;
  emptyText: string;
}) {
  return (
    <section aria-labelledby="home-activity-title" className={cn("flex flex-col rounded-card border border-line bg-surface p-5 shadow-card sm:px-6 sm:pb-3 sm:pt-[1.125rem]", className)}>
      <div className="flex items-center justify-between gap-3">
        <h2 id="home-activity-title" className="text-[1.0625rem] font-semibold text-fg">Recent activity</h2>
        <Link to={viewAllTo} className="inline-flex min-h-8 items-center gap-1.5 rounded-md text-[0.8125rem] font-medium text-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
          View all
          <ArrowRight size={14} aria-hidden="true" />
        </Link>
      </div>

      <div className="mt-2 flex-1">
        {state === "failed" && <p className="text-sm text-fg-muted">Recent activity could not be loaded.</p>}
        {state === "loading" && (
          <div aria-busy="true" className="space-y-4">
            {[0, 1, 2, 3].map((key) => <div key={key} aria-hidden="true" className="h-8 animate-pulse rounded bg-surface-muted motion-reduce:animate-none" />)}
          </div>
        )}
        {state === "ready" && entries.length === 0 && <p className="py-2 text-sm text-fg-muted">{emptyText}</p>}
        {state === "ready" && entries.length > 0 && (
          <ul className="divide-y divide-line">
            {entries.map((entry) => {
              const inner = (
                <>
                  <span
                    aria-hidden="true"
                    className={cn(
                      "grid size-7 shrink-0 place-items-center rounded-full",
                      entry.tone === "alert" ? "bg-danger-soft text-danger-fg" : "bg-surface-muted text-fg",
                    )}
                  >
                    <entry.icon size={14} />
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm text-fg" title={entry.text}>{entry.text}</span>
                  <time dateTime={entry.at} className="shrink-0 text-[0.8125rem] text-fg-subtle">{compactAgo(entry.at)}</time>
                </>
              );
              return (
                <li key={entry.key}>
                  {entry.to ? (
                    <Link to={entry.to} className="-mx-2 flex items-center gap-4 rounded-lg px-2 py-1.5 transition-colors hover:bg-surface-muted focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring">
                      {inner}
                    </Link>
                  ) : (
                    <div className="flex items-center gap-4 py-1.5">{inner}</div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
