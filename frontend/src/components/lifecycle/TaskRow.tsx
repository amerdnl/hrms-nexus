import { CircleCheck, CircleDashed, RotateCcw, SkipForward } from "lucide-react";
import type { LifecycleTask } from "../../types/lifecycle";
import { roleLabels } from "../../types/lifecycle";
import { cn } from "../../utils/cn";
import { formatDate } from "../../utils/datetime";
import Button from "../ui/Button";
import StatusBadge from "../ui/StatusBadge";

/**
 * A checklist task with the actions the caller may take on it. The buttons are
 * convenience; the server checks the caller's role in the plan again.
 */
export default function TaskRow({ task, context, canAct, canSkip, busy, onChange }: {
  task: LifecycleTask;
  /** Extra line, e.g. whose plan it belongs to. */
  context?: string;
  canAct: boolean;
  canSkip: boolean;
  busy: boolean;
  onChange: (status: LifecycleTask["status"]) => void;
}) {
  const finished = task.status !== "pending";
  return (
    <div className="flex flex-wrap items-start gap-3 py-3">
      <span className={cn("mt-0.5 shrink-0", finished ? "text-success-fg" : "text-fg-subtle")} aria-hidden="true">
        {finished ? <CircleCheck size={20} /> : <CircleDashed size={20} />}
      </span>
      <div className="min-w-0 flex-1 basis-56">
        <p className={cn("text-sm font-semibold [overflow-wrap:anywhere]", finished ? "text-fg-muted line-through decoration-fg-subtle" : "text-fg")}>
          <span className="sr-only">{task.status === "done" ? "Done: " : task.status === "skipped" ? "Skipped: " : "To do: "}</span>
          {task.title}
        </p>
        {context && <p className="text-xs text-fg-subtle [overflow-wrap:anywhere]">{context}</p>}
        {task.instructions && <p className="mt-1 whitespace-pre-line text-sm text-fg-muted [overflow-wrap:anywhere]">{task.instructions}</p>}
        {task.note && <p className="mt-1 text-xs text-fg-subtle [overflow-wrap:anywhere]">Note: {task.note}</p>}
        <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-fg-subtle">
          <span>{roleLabels[task.assigneeRole]}</span>
          <span aria-hidden="true">·</span>
          <span>Due {formatDate(task.dueOn)}</span>
          {task.overdue && <StatusBadge label="Overdue" tone="danger" />}
          {task.status === "skipped" && <StatusBadge label="Skipped" tone="neutral" />}
        </div>
      </div>
      {canAct && (
        <div className="flex shrink-0 flex-wrap gap-2">
          {finished ? (
            <Button variant="ghost" size="sm" icon={RotateCcw} disabled={busy} onClick={() => onChange("pending")} aria-label={`Reopen ${task.title}`}>
              Reopen
            </Button>
          ) : (
            <>
              <Button variant="secondary" size="sm" icon={CircleCheck} isLoading={busy} loadingLabel="Saving…" onClick={() => onChange("done")} aria-label={`Mark ${task.title} done`}>
                Mark done
              </Button>
              {canSkip && (
                <Button variant="ghost" size="sm" icon={SkipForward} disabled={busy} onClick={() => onChange("skipped")} aria-label={`Skip ${task.title}`}>
                  Skip
                </Button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
