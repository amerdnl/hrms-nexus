import { Award, CircleCheck, ClipboardList, Clock3, Target, TrendingUp, UserRoundX, UsersRound } from "lucide-react";
import { Link } from "react-router-dom";
import type { CompanyAnalytics } from "../../types/analytics";
import { categoryLabels } from "../../types/recognition";
import { formatDate } from "../../utils/datetime";
import { cycleStatusMeta } from "../performance/reviewMeta";
import BarList from "../ui/BarList";
import EmptyState from "../ui/EmptyState";
import LinkButton from "../ui/LinkButton";
import MetricTile from "../ui/MetricTile";
import SectionCard from "../ui/SectionCard";
import StatusBadge from "../ui/StatusBadge";
import CycleProgressBar from "./CycleProgressBar";

/**
 * HR's onboarding, performance and recognition figures. Every number is a
 * count of stored records, and every list entry opens the page it summarises.
 */

export function LifecycleAnalytics({ data }: { data: CompanyAnalytics }) {
  const { onboarding, offboarding, plans } = data.lifecycle;
  const overdue = onboarding.overdueTasks + offboarding.overdueTasks;
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-3">
        <MetricTile label="Onboarding in progress" value={onboarding.active} icon={UsersRound} tone="primary"
          hint={`${onboarding.completedInWindow} completed in the last ${data.windowDays} days`} />
        <MetricTile label="Offboarding in progress" value={offboarding.active} icon={UserRoundX} tone="neutral"
          hint={`${offboarding.completedInWindow} completed in the last ${data.windowDays} days`} />
        <MetricTile label="Overdue tasks" value={overdue} icon={Clock3} tone={overdue > 0 ? "warning" : "success"}
          hint={overdue > 0 ? `${onboarding.overdueTasks} onboarding · ${offboarding.overdueTasks} offboarding` : "Nothing past due"} />
      </div>

      <SectionCard title="Plans in progress" icon={ClipboardList}>
        {plans.length === 0 ? (
          <EmptyState icon={ClipboardList} title="No plans in progress" description="Start onboarding or offboarding from an employee's record."
            action={<LinkButton to="/admin/onboarding" variant="secondary">Onboarding</LinkButton>} className="py-6" />
        ) : (
          <ul className="divide-y divide-line">
            {plans.map((plan) => {
              const percent = plan.tasksTotal === 0 ? 0 : Math.round((plan.tasksFinished / plan.tasksTotal) * 100);
              return (
                <li key={plan.id} className="py-3 first:pt-0 last:pb-0">
                  <Link to={`/admin/lifecycle/plans/${plan.id}`} className="block rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-primary">
                    <span className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                      <span className="text-sm font-semibold text-fg [overflow-wrap:anywhere]">{plan.employeeName}</span>
                      <span className="text-xs text-fg-subtle">
                        {plan.kind === "onboarding" ? "Onboarding" : "Offboarding"} · target {formatDate(plan.targetDate)}
                      </span>
                    </span>
                    <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-surface-muted" aria-hidden="true">
                      <span className="block h-full rounded-full bg-primary" style={{ width: `${percent}%` }} />
                    </span>
                    <span className="mt-1 block text-xs text-fg-muted">
                      {plan.tasksFinished} of {plan.tasksTotal} tasks finished
                      {plan.overdueTasks > 0 && <span className="font-semibold text-warning-fg"> · {plan.overdueTasks} overdue</span>}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </SectionCard>
    </>
  );
}

export function PerformanceAnalytics({ data }: { data: CompanyAnalytics }) {
  const { goals, cycles } = data.performance;
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricTile label="Active goals" value={goals.active} icon={TrendingUp} tone="primary" hint="Working employees' goals" />
        <MetricTile label="Past due" value={goals.overdue} icon={Clock3} tone={goals.overdue > 0 ? "warning" : "success"} hint="Active goals past their due date" />
        <MetricTile label="Completed goals" value={goals.completed} icon={CircleCheck} tone="success" />
        <MetricTile label="Cancelled goals" value={goals.cancelled} icon={Target} tone="neutral" />
      </div>

      <SectionCard title="Review cycles" icon={ClipboardList}>
        {cycles.length === 0 ? (
          <EmptyState icon={ClipboardList} title="No review cycles opened yet" description="Open a cycle from Performance to see its progress here."
            action={<LinkButton to="/admin/performance" variant="secondary">Performance</LinkButton>} className="py-6" />
        ) : (
          <ul className="divide-y divide-line">
            {cycles.map((cycle) => (
              <li key={cycle.id} className="space-y-3 py-4 first:pt-0 last:pb-0">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Link to={`/admin/performance/cycles/${cycle.id}`} className="text-sm font-semibold text-primary hover:underline [overflow-wrap:anywhere]">
                    {cycle.name}
                  </Link>
                  <span className="flex items-center gap-2 text-xs text-fg-subtle">
                    {cycle.status === "open" && <>Managers due {formatDate(cycle.managerDueOn)}</>}
                    <StatusBadge {...cycleStatusMeta(cycle.status)} />
                  </span>
                </div>
                <CycleProgressBar cycle={cycle} />
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </>
  );
}

export function RecognitionAnalytics({ data }: { data: CompanyAnalytics }) {
  const { total, employeesRecognised, workingEmployees, byCategory } = data.recognition;
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <MetricTile label={`Recognition in the last ${data.windowDays} days`} value={total} icon={Award} tone="primary"
          hint="Private thanks are counted; hidden recognition is not" />
        <MetricTile label="People recognised" value={`${employeesRecognised} of ${workingEmployees}`} icon={UsersRound} tone="info"
          hint="Working employees who received at least one" />
      </div>
      <SectionCard title="By category" icon={Award}>
        {byCategory.length === 0 ? (
          <EmptyState icon={Award} title={`No recognition in the last ${data.windowDays} days`} description="Recognition people give each other appears here."
            action={<LinkButton to="/recognition" variant="secondary">Recognition</LinkButton>} className="py-6" />
        ) : (
          <BarList
            title="Recognition given by category"
            items={byCategory.map((entry) => ({
              key: entry.category,
              label: categoryLabels[entry.category] ?? entry.category,
              value: entry.count,
              display: String(entry.count),
            }))}
          />
        )}
      </SectionCard>
    </>
  );
}
