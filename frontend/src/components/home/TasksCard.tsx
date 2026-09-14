import { ArrowRight, Check } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getMyWork, updateTask } from "../../api/lifecycleApi";
import type { AssignedTask, MyWork } from "../../types/lifecycle";
import { cn } from "../../utils/cn";
import { addDays, formatShortDay, givenName, localIsoDate } from "./homeTime";

const ROWS = 4;

function TaskRow({ task, today, busy, onToggle, showDue }: {
  task: AssignedTask; today: string; busy: boolean; onToggle: (task: AssignedTask) => void; showDue: boolean;
}) {
  const checked = task.status === "done";
  const overdue = !checked && task.dueOn < today;
  return (
    <li>
      <label className="flex min-h-8 cursor-pointer items-center gap-3.5">
        <span className="relative grid shrink-0 place-items-center">
          <input
            type="checkbox"
            checked={checked}
            disabled={busy}
            onChange={() => onToggle(task)}
            className="peer size-5 appearance-none rounded-md border border-control-border bg-surface transition-colors checked:border-primary checked:bg-primary disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          />
          <Check size={13} strokeWidth={3} className="pointer-events-none absolute text-primary-fg opacity-0 peer-checked:opacity-100" aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1 truncate text-sm" title={`${task.title} - ${task.employeeName}'s ${task.kind}`}>
          <span className={checked ? "text-fg-muted" : "text-fg"}>{task.title}</span>
          <span className="text-fg-subtle"> · {givenName(task.employeeName)}</span>
          {overdue && <span className="text-danger-fg"> · overdue</span>}
        </span>
        {showDue && <span className="shrink-0 text-[0.8125rem] text-fg-subtle">{formatShortDay(task.dueOn)}</span>}
      </label>
    </li>
  );
}

/**
 * Tasks for today: the onboarding and offboarding tasks assigned to this
 * account that are due today or overdue, plus those finished today - and,
 * while there is room, the ones due in the next two weeks, labelled with
 * their dates so they never pass for today's.
 *
 * The checkboxes are real. Ticking one records the task as done through the
 * same request as My tasks, and unticking puts it back to pending; the server
 * decides whether this account may, as it always did.
 */
export default function TasksCard({ className }: { className?: string }) {
  const [work, setWork] = useState<MyWork | null>(null);
  const [failed, setFailed] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [message, setMessage] = useState("");

  const load = useCallback(() => {
    setFailed(false);
    getMyWork().then(setWork).catch(() => setFailed(true));
  }, []);
  useEffect(load, [load]);

  const today = work?.today ?? "";
  const assigned = work?.assigned ?? [];
  const forToday = assigned
    .filter((task) =>
      (task.status === "pending" && task.dueOn <= today) ||
      (task.status === "done" && Boolean(task.completedAt) && localIsoDate(task.completedAt!) === today))
    .sort((a, b) => a.dueOn.localeCompare(b.dueOn) || a.position - b.position);
  const done = forToday.filter((task) => task.status === "done").length;
  const shown = forToday.slice(0, ROWS);
  const soon = assigned
    .filter((task) => task.dueOn > today && task.dueOn <= addDays(today, 14) && (task.status === "pending" || !forToday.includes(task)))
    .filter((task) => task.status === "pending")
    .sort((a, b) => a.dueOn.localeCompare(b.dueOn))
    .slice(0, Math.max(0, ROWS - shown.length));

  async function toggle(task: AssignedTask) {
    const status = task.status === "done" ? "pending" : "done";
    setBusyId(task.id);
    setMessage("");
    const stamp = new Date().toISOString();
    setWork((current) => current && {
      ...current,
      assigned: current.assigned.map((item) => item.id === task.id ? { ...item, status, completedAt: status === "done" ? stamp : null } : item),
    });
    try {
      const result = await updateTask(task.id, { status });
      setMessage(result.planCompleted ? result.message : status === "done" ? `"${task.title}" marked done.` : `"${task.title}" is pending again.`);
    } catch {
      setWork((current) => current && {
        ...current,
        assigned: current.assigned.map((item) => item.id === task.id ? task : item),
      });
      setMessage("That task could not be updated. Try again.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section aria-labelledby="home-tasks-title" className={cn("flex flex-col rounded-card border border-line bg-surface p-5 shadow-card sm:px-6 sm:pb-5 sm:pt-[1.375rem]", className)}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="home-tasks-title" className="text-[1.0625rem] font-semibold text-fg">Tasks for today</h2>
        {work && forToday.length > 0 && (
          <p className="text-[0.8125rem] text-fg-subtle">{done}/{forToday.length} completed</p>
        )}
      </div>

      <p className="sr-only" role="status" aria-live="polite">{message}</p>

      <div className="mt-3.5 flex-1">
        {failed && <p className="text-sm text-fg-muted">Your tasks could not be loaded.</p>}
        {!failed && !work && (
          <div aria-busy="true" className="space-y-4">
            {[0, 1, 2].map((key) => <div key={key} aria-hidden="true" className="h-5 animate-pulse rounded bg-surface-muted motion-reduce:animate-none" />)}
          </div>
        )}
        {work && forToday.length === 0 && (
          <p className="text-sm text-fg-muted">
            Nothing due today{soon.length === 0 ? ". No onboarding or offboarding tasks are assigned to you." : "."}
          </p>
        )}
        {work && shown.length > 0 && (
          <ul aria-label="Due today" className="space-y-0.5">
            {shown.map((task) => (
              <TaskRow key={task.id} task={task} today={today} busy={busyId === task.id} onToggle={(item) => void toggle(item)} showDue={false} />
            ))}
          </ul>
        )}
        {work && soon.length > 0 && (
          <>
            <p className="mb-1 mt-3 text-[0.6875rem] font-semibold uppercase tracking-[0.1em] text-fg-subtle">Due soon</p>
            <ul aria-label="Due soon" className="space-y-0.5">
              {soon.map((task) => (
                <TaskRow key={task.id} task={task} today={today} busy={busyId === task.id} onToggle={(item) => void toggle(item)} showDue />
              ))}
            </ul>
          </>
        )}
      </div>

      <div className="mt-3 flex items-center justify-between gap-3">
        <p className="text-[0.8125rem] text-fg-subtle">{forToday.length > shown.length ? `${forToday.length - shown.length} more today` : ""}</p>
        <Link to="/tasks" className="inline-flex min-h-8 items-center gap-2 rounded-md text-[0.8125rem] font-medium text-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
          View all tasks
          <ArrowRight size={14} aria-hidden="true" />
        </Link>
      </div>
    </section>
  );
}
