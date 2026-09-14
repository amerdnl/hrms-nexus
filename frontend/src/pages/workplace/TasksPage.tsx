import { ClipboardCheck, ClipboardList, UsersRound } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { getApiErrorMessage } from "../../api/axios";
import { getMyWork, updateTask } from "../../api/lifecycleApi";
import PlanProgressRow from "../../components/lifecycle/PlanProgressRow";
import TaskRow from "../../components/lifecycle/TaskRow";
import Alert from "../../components/ui/Alert";
import EmptyState from "../../components/ui/EmptyState";
import ErrorState from "../../components/ui/ErrorState";
import PageHeader from "../../components/ui/PageHeader";
import SectionCard from "../../components/ui/SectionCard";
import { SkeletonText } from "../../components/ui/Skeleton";
import { useAuth } from "../../context/useAuth";
import type { AssignedTask, MyWork } from "../../types/lifecycle";

function contextFor(task: AssignedTask): string {
  if (task.isOwnPlan && task.assigneeRole === "employee") return `Your ${task.kind}`;
  return `${task.employeeName}'s ${task.kind}${task.assigneeRole === "manager" ? " · as their manager" : task.assigneeRole === "hr" ? " · for HR" : ""}`;
}

/**
 * Onboarding and offboarding work for the signed-in account: tasks its roles
 * hold right now, its own plans, and a manager's team plans. Finished tasks
 * leave this list; the plan page keeps the whole history.
 */
export default function TasksPage() {
  const { user } = useAuth();
  const [work, setWork] = useState<MyWork | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [actionError, setActionError] = useState("");
  const [busyTask, setBusyTask] = useState<number | null>(null);

  const load = useCallback(() => {
    setError("");
    getMyWork().then(setWork).catch((requestError) => setError(getApiErrorMessage(requestError, "Your tasks could not be loaded.")));
  }, []);

  useEffect(load, [load]);

  async function change(task: AssignedTask, status: AssignedTask["status"]) {
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

  const planLink = (id: number) => (user?.role === "admin" ? `/admin/lifecycle/plans/${id}` : `/lifecycle/plans/${id}`);

  return (
    <section className="max-w-4xl space-y-6">
      <PageHeader
        title="My tasks"
        description={work
          ? work.assigned.length === 0 ? "Nothing on your list." : `${work.assigned.length} onboarding or offboarding task${work.assigned.length === 1 ? "" : "s"} for you.`
          : "Onboarding and offboarding work for you."}
      />

      {notice && <Alert tone="success" onDismiss={() => setNotice("")}>{notice}</Alert>}
      {actionError && <Alert tone="danger" onDismiss={() => setActionError("")}>{actionError}</Alert>}

      {error ? (
        <SectionCard><ErrorState title="Your tasks could not be loaded" description={error} onRetry={load} /></SectionCard>
      ) : !work ? (
        <SectionCard><p className="sr-only" role="status">Loading your tasks</p><SkeletonText lines={5} /></SectionCard>
      ) : (
        <>
          <SectionCard title="To do" icon={ClipboardCheck} description="Tasks your role holds in a plan in progress, soonest first.">
            {work.assigned.length === 0 ? (
              <EmptyState icon={ClipboardCheck} title="You are all caught up" description="When a plan gives you a task, it appears here and in your Action Center." className="py-8" />
            ) : (
              <ul className="divide-y divide-line">
                {work.assigned.map((task) => (
                  <li key={task.id}>
                    <TaskRow
                      task={task}
                      context={contextFor(task)}
                      canAct
                      canSkip={user?.role === "admin"}
                      busy={busyTask === task.id}
                      onChange={(status) => void change(task, status)}
                    />
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>

          {work.ownPlans.length > 0 && (
            <SectionCard title="Your plans" icon={ClipboardList} description="Your own onboarding or offboarding, and how far along it is.">
              <ul className="-mx-2 divide-y divide-line">
                {work.ownPlans.map((plan) => <li key={plan.id}><PlanProgressRow plan={plan} to={planLink(plan.id)} /></li>)}
              </ul>
            </SectionCard>
          )}

          {work.teamPlans.length > 0 && (
            <SectionCard title="Your team" icon={UsersRound} description="Plans in progress for people who report to you.">
              <ul className="-mx-2 divide-y divide-line">
                {work.teamPlans.map((plan) => <li key={plan.id}><PlanProgressRow plan={plan} to={planLink(plan.id)} /></li>)}
              </ul>
            </SectionCard>
          )}
        </>
      )}
    </section>
  );
}
