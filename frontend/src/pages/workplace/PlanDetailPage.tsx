import axios from "axios";
import { Ban, ClipboardList, Flag } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { getApiErrorMessage, resolveProfileImageUrl } from "../../api/axios";
import { cancelPlan, completePlan, getPlan, updateTask } from "../../api/lifecycleApi";
import ConfirmationModal from "../../components/common/ConfirmationModal";
import TaskRow from "../../components/lifecycle/TaskRow";
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
import { useAuth } from "../../context/useAuth";
import type { AssigneeRole, LifecycleTask, PlanDetail } from "../../types/lifecycle";
import { exitStatusLabels, kindLabels, roleLabels } from "../../types/lifecycle";
import { formatDate } from "../../utils/datetime";

const ROLE_ORDER: AssigneeRole[] = ["employee", "manager", "hr"];

/**
 * One onboarding or offboarding plan. Everyone who holds a role in it sees the
 * overall progress and the tasks for their role; HR sees every task and can
 * complete or cancel the plan. Completing offboarding deactivates the
 * employee, so the confirmation says exactly that.
 */
export default function PlanDetailPage() {
  const { id } = useParams();
  const planId = Number(id);
  const { user } = useAuth();
  const isHr = user?.role === "admin";

  const [detail, setDetail] = useState<PlanDetail | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "missing" | "failed">("loading");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [actionError, setActionError] = useState("");
  const [busyTask, setBusyTask] = useState<number | null>(null);
  const [confirm, setConfirm] = useState<"complete" | "cancel" | null>(null);
  const [isWorking, setIsWorking] = useState(false);

  const load = useCallback(() => {
    if (!Number.isSafeInteger(planId) || planId <= 0) {
      setState("missing");
      return;
    }
    getPlan(planId)
      .then((found) => {
        setDetail(found);
        setState("ready");
      })
      .catch((requestError) => {
        if (axios.isAxiosError(requestError) && requestError.response?.status === 404) setState("missing");
        else {
          setError(getApiErrorMessage(requestError, "This plan could not be loaded."));
          setState("failed");
        }
      });
  }, [planId]);

  useEffect(load, [load]);

  async function change(task: LifecycleTask, status: LifecycleTask["status"]) {
    setBusyTask(task.id);
    setActionError("");
    try {
      const result = await updateTask(task.id, { status });
      setNotice(result.planCompleted ? result.message : `"${task.title}" marked ${status}.`);
      load();
    } catch (requestError) {
      setActionError(getApiErrorMessage(requestError, "That task could not be updated."));
    } finally {
      setBusyTask(null);
    }
  }

  async function runConfirmed() {
    if (!detail || !confirm) return;
    setIsWorking(true);
    setActionError("");
    try {
      setNotice(confirm === "complete" ? await completePlan(detail.plan.id) : await cancelPlan(detail.plan.id));
      load();
    } catch (requestError) {
      setActionError(getApiErrorMessage(requestError, "That did not work. Reload to see the latest state."));
    } finally {
      setIsWorking(false);
      setConfirm(null);
    }
  }

  const back = isHr ? "/admin/onboarding" : "/tasks";

  if (state === "missing" || state === "failed") {
    return (
      <section className="mx-auto max-w-4xl space-y-6">
        <PageHeader title="Plan" backTo={back} backLabel="Back" />
        <SectionCard>
          {state === "missing" ? (
            <EmptyState icon={ClipboardList} title="This plan is not available" description="It may belong to someone whose tasks are not yours." action={<LinkButton to="/tasks" variant="secondary">My tasks</LinkButton>} />
          ) : (
            <ErrorState title="This plan could not be loaded" description={error} onRetry={load} />
          )}
        </SectionCard>
      </section>
    );
  }

  if (!detail) {
    return (
      <section className="mx-auto max-w-4xl space-y-6">
        <SectionCard><p className="sr-only" role="status">Loading the plan</p><SkeletonText lines={8} /></SectionCard>
      </section>
    );
  }

  const { plan, tasks, roles } = detail;
  const pending = tasks.filter((task) => task.status === "pending").length;
  const isActive = plan.status === "active";
  const canAct = (task: LifecycleTask) => isActive && (isHr || roles.includes(task.assigneeRole));

  return (
    <section className="mx-auto max-w-4xl space-y-6">
      <PageHeader
        title={`${kindLabels[plan.kind]}: ${plan.employeeName}`}
        description={plan.title}
        backTo={plan.kind === "offboarding" && isHr ? "/admin/offboarding" : back}
        backLabel="Back"
        actions={isHr && isActive && (
          <div className="flex flex-wrap gap-2">
            <Button variant="ghost" size="sm" icon={Ban} onClick={() => setConfirm("cancel")}>Cancel plan</Button>
            <Button size="sm" icon={Flag} onClick={() => setConfirm("complete")}>
              {plan.kind === "offboarding" ? "Complete and deactivate" : "Complete onboarding"}
            </Button>
          </div>
        )}
      />

      {notice && <Alert tone="success" onDismiss={() => setNotice("")}>{notice}</Alert>}
      {actionError && <Alert tone="danger" onDismiss={() => setActionError("")}>{actionError}</Alert>}

      <SectionCard>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <Avatar name={plan.employeeName} src={resolveProfileImageUrl(plan.profileImage)} size="lg" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              {isHr ? (
                <Link to={`/admin/employees/${plan.employeeId}`} className="text-lg font-semibold text-fg hover:text-primary hover:underline focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring [overflow-wrap:anywhere]">
                  {plan.employeeName}
                </Link>
              ) : (
                <span className="text-lg font-semibold text-fg [overflow-wrap:anywhere]">{plan.employeeName}</span>
              )}
              <StatusBadge
                label={plan.status === "active" ? "In progress" : plan.status === "completed" ? "Completed" : "Cancelled"}
                tone={plan.status === "active" ? "info" : plan.status === "completed" ? "success" : "neutral"}
              />
            </div>
            <p className="text-sm text-fg-muted [overflow-wrap:anywhere]">
              {[plan.departmentName, plan.managerName ? `Reports to ${plan.managerName}` : null].filter(Boolean).join(" · ")}
            </p>
            <dl className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
              <div><dt className="text-xs text-fg-subtle">Starts</dt><dd className="font-medium text-fg">{formatDate(plan.startsOn)}</dd></div>
              <div><dt className="text-xs text-fg-subtle">{plan.kind === "offboarding" ? "Last working day" : "Target"}</dt><dd className="font-medium text-fg">{formatDate(plan.targetDate)}</dd></div>
              {isHr && plan.exitStatus && <div><dt className="text-xs text-fg-subtle">Leaves as</dt><dd className="font-medium text-fg">{exitStatusLabels[plan.exitStatus]}</dd></div>}
            </dl>
          </div>
        </div>
        <div className="mt-5">
          <ProgressBar
            tone={plan.status === "completed" ? "success" : "primary"}
            value={plan.progress.finished}
            max={Math.max(plan.progress.total, 1)}
            label={`${plan.progress.finished} of ${plan.progress.total} tasks finished`}
          />
          <p className="mt-1.5 text-sm text-fg-muted">
            {plan.progress.finished} of {plan.progress.total} tasks finished
            {plan.progress.overdue > 0 ? ` · ${plan.progress.overdue} overdue` : ""}
          </p>
        </div>
        {isHr && isActive && plan.kind === "offboarding" && (
          <p className="mt-4 text-sm text-fg-muted">
            Their account stays active until you complete this plan, which you can do on or after the last working day, once every task is finished and nobody still reports to them.
          </p>
        )}
      </SectionCard>

      {ROLE_ORDER.filter((role) => tasks.some((task) => task.assigneeRole === role)).map((role) => (
        <SectionCard key={role} title={role === "employee" ? `${plan.employeeName.split(" ")[0]}'s tasks` : `${roleLabels[role]} tasks`}>
          <ul className="divide-y divide-line">
            {tasks.filter((task) => task.assigneeRole === role).map((task) => (
              <li key={task.id}>
                <TaskRow task={task} canAct={canAct(task)} canSkip={isHr} busy={busyTask === task.id} onChange={(status) => void change(task, status)} />
              </li>
            ))}
          </ul>
        </SectionCard>
      ))}

      <ConfirmationModal
        isOpen={confirm !== null}
        isProcessing={isWorking}
        tone={confirm === "complete" && plan.kind === "offboarding" ? "danger" : "primary"}
        title={confirm === "cancel" ? "Cancel this plan?" : plan.kind === "offboarding" ? `Complete ${plan.employeeName}'s offboarding?` : "Complete onboarding?"}
        description={confirm === "cancel"
          ? "The plan stops and its tasks leave everyone's lists. Employment is not changed."
          : plan.kind === "offboarding"
            ? `${plan.employeeName} becomes ${exitStatusLabels[plan.exitStatus ?? "inactive"].toLowerCase()} and can no longer sign in. Attendance, leave, payroll and their timeline are kept.${pending > 0 ? ` ${pending} task${pending === 1 ? " is" : "s are"} still pending, so this will be refused.` : ""}`
            : "The plan is marked complete."}
        confirmLabel={confirm === "cancel" ? "Cancel plan" : plan.kind === "offboarding" ? "Complete and deactivate" : "Complete"}
        processingLabel="Working…"
        onCancel={() => setConfirm(null)}
        onConfirm={() => void runConfirmed()}
      />
    </section>
  );
}
