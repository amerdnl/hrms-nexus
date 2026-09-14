import { Award, BarChart3, CircleCheck, Target, UsersRound } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { getTeamAnalytics } from "../../api/analyticsApi";
import { getApiErrorMessage } from "../../api/axios";
import type { TeamAnalytics } from "../../types/analytics";
import { formatDate } from "../../utils/datetime";
import { leaveTypeMeta } from "../../utils/status";
import BarList from "../ui/BarList";
import ErrorState from "../ui/ErrorState";
import LinkButton from "../ui/LinkButton";
import MetricTile from "../ui/MetricTile";
import SectionCard from "../ui/SectionCard";
import { SkeletonText } from "../ui/Skeleton";
import CycleProgressBar from "./CycleProgressBar";

type LeaveTypeKey = Parameters<typeof leaveTypeMeta>[0];

/**
 * A manager's figures for their current direct reports: goals, open reviews,
 * leave taken this year and company-visible recognition. The server scopes
 * every number; nothing here names anyone or carries pay or review content.
 */
export default function TeamInsights() {
  const [data, setData] = useState<TeamAnalytics | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    setError("");
    getTeamAnalytics()
      .then(setData)
      .catch((requestError) => setError(getApiErrorMessage(requestError, "Team insights could not be loaded.")));
  }, []);

  useEffect(load, [load]);

  return (
    <SectionCard title="Team insights" icon={BarChart3}>
      {error ? (
        <ErrorState title="Team insights could not be loaded" description={error} onRetry={load} />
      ) : !data ? (
        <SkeletonText lines={5} />
      ) : (
        <div className="space-y-6">
          <p className="text-xs text-fg-subtle">
            For your {data.teamSize} current direct report{data.teamSize === 1 ? "" : "s"}. Recognition covers the last{" "}
            {data.windowDays} days and leave covers {data.leave.year}.
          </p>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <MetricTile label="Active goals" value={data.goals.active} icon={Target} tone={data.goals.overdue > 0 ? "warning" : "primary"}
              hint={data.goals.overdue > 0 ? `${data.goals.overdue} past due` : "None past due"} />
            <MetricTile label="Goals completed" value={data.goals.completed} icon={CircleCheck} tone="success" />
            <MetricTile label="Recognition received" value={data.recognition.total} icon={Award} tone="primary" hint="Company-visible recognition" />
            <MetricTile label="Onboarding in progress" value={data.lifecycle.onboarding} icon={UsersRound} tone="info"
              hint={data.lifecycle.offboarding > 0 ? `${data.lifecycle.offboarding} offboarding` : undefined} />
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-fg">Open reviews</h3>
              {data.reviews.length === 0 ? (
                <p className="text-sm text-fg-muted">No review cycle is open for your team.</p>
              ) : (
                data.reviews.map((cycle) => (
                  <div key={cycle.id} className="space-y-2">
                    {/* Visible, not only the bar's accessible title: a manager needs to see which cycle this is. */}
                    <p className="text-xs font-medium text-fg-muted [overflow-wrap:anywhere]">
                      {cycle.name} · managers due {formatDate(cycle.managerDueOn)}
                    </p>
                    <CycleProgressBar cycle={cycle} />
                  </div>
                ))
              )}
              <LinkButton to="/team/reviews" variant="link" size="sm">Team reviews</LinkButton>
            </div>
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-fg">Leave taken in {data.leave.year}</h3>
              {data.leave.approvedDays.length === 0 ? (
                <p className="text-sm text-fg-muted">No approved leave this year.</p>
              ) : (
                <BarList
                  title={`Approved working days of leave in ${data.leave.year}, by type`}
                  items={data.leave.approvedDays.map((entry) => {
                    const meta = leaveTypeMeta(entry.leaveType as LeaveTypeKey);
                    return { key: entry.leaveType, label: meta.label, value: entry.days, display: `${entry.days} day${entry.days === 1 ? "" : "s"}`, tone: meta.tone };
                  })}
                />
              )}
              <div className="flex flex-wrap gap-2">
                <LinkButton to="/team/leave" variant="link" size="sm">Team leave</LinkButton>
                <LinkButton to="/team/goals" variant="link" size="sm">Team goals</LinkButton>
              </div>
            </div>
          </div>
        </div>
      )}
    </SectionCard>
  );
}
