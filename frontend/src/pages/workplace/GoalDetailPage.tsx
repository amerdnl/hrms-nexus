import axios from "axios";
import { History, Pencil, Target, TrendingUp } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { getApiErrorMessage, resolveProfileImageUrl } from "../../api/axios";
import { getGoal } from "../../api/performanceApi";
import GoalDialog from "../../components/performance/GoalDialog";
import GoalProgressDialog from "../../components/performance/GoalProgressDialog";
import Alert from "../../components/ui/Alert";
import Avatar from "../../components/ui/Avatar";
import Button from "../../components/ui/Button";
import EmptyState from "../../components/ui/EmptyState";
import ErrorState from "../../components/ui/ErrorState";
import LinkButton from "../../components/ui/LinkButton";
import PageHeader from "../../components/ui/PageHeader";
import ProgressBar from "../../components/ui/ProgressBar";
import SectionCard from "../../components/ui/SectionCard";
import { SkeletonText } from "../../components/ui/Skeleton";
import StatusBadge from "../../components/ui/StatusBadge";
import type { GoalDetail } from "../../types/performance";
import { visibilityDescriptions, visibilityLabels } from "../../types/performance";
import { formatDate } from "../../utils/datetime";
import { fullTimestamp, relativeTime } from "../../utils/relativeTime";

const statusWords = { active: "in progress", completed: "completed", cancelled: "cancelled" };

/** One goal: where it stands, who can see it, and every change to it. */
export default function GoalDetailPage() {
  const { id } = useParams();
  const goalId = Number(id);
  const [detail, setDetail] = useState<GoalDetail | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "missing" | "failed">("loading");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [dialog, setDialog] = useState<"edit" | "progress" | null>(null);

  const load = useCallback(() => {
    if (!Number.isSafeInteger(goalId) || goalId <= 0) {
      setState("missing");
      return;
    }
    getGoal(goalId)
      .then((found) => { setDetail(found); setState("ready"); })
      .catch((requestError) => {
        if (axios.isAxiosError(requestError) && requestError.response?.status === 404) setState("missing");
        else { setError(getApiErrorMessage(requestError, "This goal could not be loaded.")); setState("failed"); }
      });
  }, [goalId]);

  useEffect(load, [load]);

  if (state === "missing" || state === "failed") {
    return (
      <section className="max-w-3xl space-y-6">
        <PageHeader title="Goal" backTo="/goals" backLabel="My goals" />
        <SectionCard>
          {state === "missing"
            ? <EmptyState icon={Target} title="This goal is not available" description="It may be private to its owner and their manager." action={<LinkButton to="/goals" variant="secondary">My goals</LinkButton>} />
            : <ErrorState title="This goal could not be loaded" description={error} onRetry={load} />}
        </SectionCard>
      </section>
    );
  }
  if (!detail) {
    return <section className="max-w-3xl space-y-6"><SectionCard><p className="sr-only" role="status">Loading the goal</p><SkeletonText lines={6} /></SectionCard></section>;
  }

  const { goal, updates, relation } = detail;
  const canChange = goal.canChange === true && goal.status === "active";
  const back = relation === "owner" ? "/goals" : relation === "manager" ? "/team/goals" : `/people/${goal.ownerId}`;

  return (
    <section className="max-w-3xl space-y-6">
      <PageHeader
        title={goal.title}
        backTo={back}
        backLabel="Back"
        actions={canChange && (
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" icon={Pencil} onClick={() => setDialog("edit")}>Edit</Button>
            <Button size="sm" icon={TrendingUp} onClick={() => setDialog("progress")}>Record progress</Button>
          </div>
        )}
      />
      {notice && <Alert tone="success" onDismiss={() => setNotice("")}>{notice}</Alert>}

      <SectionCard>
        <div className="flex flex-wrap items-center gap-3">
          <Avatar name={goal.ownerName} src={resolveProfileImageUrl(goal.ownerImage)} size="sm" />
          <Link to={`/people/${goal.ownerId}`} className="text-sm font-semibold text-fg hover:text-primary hover:underline focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
            {relation === "owner" ? "Your goal" : goal.ownerName}
          </Link>
          {goal.createdAs === "manager" && <span className="text-xs text-fg-subtle">Set by their manager</span>}
          <span className="ml-auto flex flex-wrap gap-2">
            {goal.status !== "active" && <StatusBadge label={goal.status === "completed" ? "Completed" : "Cancelled"} tone={goal.status === "completed" ? "success" : "neutral"} />}
            {goal.overdue && <StatusBadge label="Past due" tone="danger" />}
          </span>
        </div>
        <div className="mt-5 flex items-end gap-3">
          <p className="text-4xl font-bold tabular-nums tracking-tight text-fg">{goal.progress}%</p>
          <p className="pb-1.5 text-sm text-fg-muted">{statusWords[goal.status]}</p>
        </div>
        <ProgressBar className="mt-2" tone={goal.status === "completed" ? "success" : goal.overdue ? "danger" : "primary"} value={goal.progress} max={100} label={`${goal.progress}% done`} isDecorative />
        <dl className="mt-5 grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
          <div><dt className="text-xs text-fg-subtle">Starts</dt><dd className="font-medium text-fg">{formatDate(goal.startsOn)}</dd></div>
          <div><dt className="text-xs text-fg-subtle">Due</dt><dd className="font-medium text-fg">{formatDate(goal.dueOn)}</dd></div>
          <div className="col-span-2 sm:col-span-1"><dt className="text-xs text-fg-subtle">Visible to</dt><dd className="font-medium text-fg">{visibilityLabels[goal.visibility]}: {visibilityDescriptions[goal.visibility].replace(/^Also /, "also ")}</dd></div>
        </dl>
        {goal.description && <p className="mt-5 whitespace-pre-line text-sm text-fg [overflow-wrap:anywhere]">{goal.description}</p>}
      </SectionCard>

      <SectionCard title="History" icon={History}>
        {updates.length === 0 ? (
          <p className="text-sm text-fg-muted">No progress recorded yet.</p>
        ) : (
          <ol className="divide-y divide-line">
            {updates.map((update) => (
              <li key={update.id} className="py-3">
                <p className="text-sm text-fg">
                  <span className="font-semibold">{update.authorName ?? (update.authorRole === "manager" ? "Their manager" : "The owner")}</span>
                  {" "}{update.statusAfter !== update.statusBefore
                    ? `marked it ${statusWords[update.statusAfter]}`
                    : `moved it from ${update.progressBefore}% to ${update.progressAfter}%`}
                </p>
                {update.note && <p className="mt-0.5 whitespace-pre-line text-sm text-fg-muted [overflow-wrap:anywhere]">{update.note}</p>}
                <time dateTime={update.createdAt} title={fullTimestamp(update.createdAt)} className="mt-0.5 block text-xs text-fg-subtle">{relativeTime(update.createdAt)}</time>
              </li>
            ))}
          </ol>
        )}
      </SectionCard>

      {canChange && (
        <>
          <GoalDialog isOpen={dialog === "edit"} goal={goal} onClose={() => setDialog(null)} onSaved={(_, message) => { setDialog(null); setNotice(message); load(); }} />
          <GoalProgressDialog isOpen={dialog === "progress"} goal={goal} onClose={() => setDialog(null)} onSaved={(message) => { setDialog(null); setNotice(message); load(); }} />
        </>
      )}
    </section>
  );
}
