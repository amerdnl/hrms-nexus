import { ArrowRight, Target } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getMyGoals } from "../../api/performanceApi";
import type { Goal } from "../../types/performance";
import { cn } from "../../utils/cn";
import ProgressBar from "../ui/ProgressBar";
import HomeEmptyState from "./HomeEmptyState";
import { formatShortDay } from "./homeTime";

/** Your active goals with their recorded progress, soonest due first, and a count of where they stand. */
export default function GoalsCard({ className }: { className?: string }) {
  const [goals, setGoals] = useState<Goal[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    getMyGoals().then((list) => setGoals(list.goals)).catch(() => setFailed(true));
  }, []);

  const active = (goals ?? []).filter((goal) => goal.status === "active").sort((a, b) => a.dueOn.localeCompare(b.dueOn));
  const overdue = active.filter((goal) => goal.overdue).length;
  const completed = (goals ?? []).filter((goal) => goal.status === "completed").length;
  const summary = [
    `${active.length} active`,
    overdue > 0 ? `${overdue} past due` : null,
    completed > 0 ? `${completed} completed` : null,
  ].filter(Boolean).join(" · ");

  return (
    <section aria-labelledby="home-goals-title" className={cn("flex flex-col rounded-card border border-line bg-surface p-5 shadow-card sm:p-6", className)}>
      <div className="flex items-center justify-between gap-3">
        <h2 id="home-goals-title" className="text-[1.0625rem] font-semibold text-fg">Your goals</h2>
        <Link to="/goals" className="inline-flex min-h-8 items-center gap-1.5 rounded-md text-[0.8125rem] font-medium text-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
          View all
          <ArrowRight size={14} aria-hidden="true" />
        </Link>
      </div>

      <div className="mt-3 flex flex-1 flex-col">
        {failed && <p className="text-sm text-fg-muted">Your goals could not be loaded.</p>}
        {!failed && !goals && (
          <div aria-busy="true" className="space-y-4">
            {[0, 1].map((key) => <div key={key} aria-hidden="true" className="h-10 animate-pulse rounded bg-surface-muted motion-reduce:animate-none" />)}
          </div>
        )}
        {goals && active.length === 0 && (
          <HomeEmptyState
            icon={Target}
            tint="rose"
            title="No active goals"
            description={completed > 0
              ? `${completed} completed so far. Goals you set, or agree with your manager, show their progress here.`
              : "Goals you set, or agree with your manager, show their progress here."}
            action={{ label: "Set a goal", to: "/goals" }}
          />
        )}
        {goals && active.length > 0 && (
          <ul className="divide-y divide-line">
            {active.slice(0, 3).map((goal) => (
              <li key={goal.id} className="py-3 first:pt-1 last:pb-0">
                <Link to={`/goals/${goal.id}`} className="block rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
                  <span className="flex items-start justify-between gap-3">
                    <span className="min-w-0 line-clamp-2 text-sm font-medium leading-5 text-fg hover:underline">{goal.title}</span>
                    <span className="shrink-0 text-[0.8125rem] font-semibold leading-5 tabular-nums text-fg">{goal.progress}%</span>
                  </span>
                  <ProgressBar className="mt-2" tone={goal.overdue ? "warning" : "primary"} size="sm" value={goal.progress} max={100} label={`${goal.title}: ${goal.progress}% done`} isDecorative />
                  <span className={cn("mt-1.5 block text-[0.8125rem]", goal.overdue ? "text-danger-fg" : "text-fg-subtle")}>
                    {goal.overdue ? `Past due since ${formatShortDay(goal.dueOn)}` : `Due ${formatShortDay(goal.dueOn)}`}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      {goals && active.length > 0 && (
        <p className="mt-4 border-t border-line pt-3 text-[0.8125rem] text-fg-subtle">{summary}</p>
      )}
    </section>
  );
}
