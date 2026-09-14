import { ArrowRight, CalendarCheck2, CalendarDays } from "lucide-react";
import { Link } from "react-router-dom";
import type { EmployeeDashboardData } from "../../types/dashboard";
import { cn } from "../../utils/cn";
import { formatLeaveDuration } from "../../utils/leave";
import { leaveStatusMeta, leaveTypeMeta } from "../../utils/status";
import ProgressBar from "../ui/ProgressBar";
import { formatDayRange } from "./homeTime";

/**
 * Your leave: the annual balance first, the other balances under it, and the
 * next approved leave. A balance that could not be read says so - it is never
 * shown as zero.
 */
export default function LeaveCard({ dashboard, className }: { dashboard: EmployeeDashboardData | null; className?: string }) {
  const unavailable = dashboard?.unavailable.includes("leaveBalances") ?? false;
  const balances = dashboard?.leaveBalances ?? [];
  const annual = balances.find((balance) => balance.leaveType === "annual") ?? null;
  const others = balances.filter((balance) => balance.leaveType !== "annual");

  return (
    <section aria-labelledby="home-leave-title" className={cn("flex flex-col rounded-card border border-line bg-surface p-5 shadow-card sm:p-6", className)}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="home-leave-title" className="text-[1.0625rem] font-semibold text-fg">Your leave</h2>
        {dashboard?.leaveYear && <p className="text-[0.8125rem] text-fg-subtle">{dashboard.leaveYear}</p>}
      </div>

      <div className="mt-4 flex-1">
        {!dashboard && (
          <div aria-busy="true" className="space-y-4">
            {[0, 1, 2].map((key) => <div key={key} aria-hidden="true" className="h-8 animate-pulse rounded bg-surface-muted motion-reduce:animate-none" />)}
          </div>
        )}
        {dashboard && unavailable && (
          <p className="text-sm text-fg-muted">Your balance could not be loaded. This is a temporary problem, not a balance of zero.</p>
        )}
        {dashboard && !unavailable && balances.length === 0 && (
          <p className="text-sm text-fg-muted">No leave policy is active yet.</p>
        )}
        {dashboard && !unavailable && annual && (
          <div>
            <p className="text-sm text-fg-muted">Annual leave</p>
            <p className="mt-1 text-[1.75rem] font-semibold leading-8 tracking-tight text-fg tabular-nums">
              {annual.remainingDays}
              <span className="ml-1.5 text-sm font-medium tracking-normal text-fg-muted">of {annual.entitledDays} days left</span>
            </p>
            <ProgressBar className="mt-3" tone="primary" size="sm" value={annual.remainingDays} max={annual.entitledDays} label={`${annual.remainingDays} of ${annual.entitledDays} annual leave days left`} isDecorative />
            <p className="mt-2 text-[0.8125rem] text-fg-subtle">
              {annual.availableDays} available to request
              {dashboard.pendingLeaveCount > 0 ? ` · ${dashboard.pendingLeaveCount} pending` : ""}
            </p>
          </div>
        )}
        {dashboard && !unavailable && others.length > 0 && (
          <ul className="mt-5 space-y-3 border-t border-line pt-4">
            {others.map((balance) => (
              <li key={balance.leaveType} className="flex items-baseline justify-between gap-3 text-sm">
                <span className="text-fg">{leaveTypeMeta(balance.leaveType).label}</span>
                {balance.deductsBalance ? (
                  <span className="tabular-nums text-fg-muted">
                    <span className="font-semibold text-fg">{balance.remainingDays}</span> / {balance.entitledDays} left
                  </span>
                ) : (
                  <span className="text-fg-muted">{balance.usedDays} taken</span>
                )}
              </li>
            ))}
          </ul>
        )}
        {/* When nothing is booked, the latest request answers "where is my
            leave at?" - real, and it keeps the column from ending in a gap. */}
        {dashboard && !dashboard.upcomingLeave && (
          <p className="mt-4 flex items-start gap-2.5 rounded-xl bg-surface-muted px-3.5 py-3 text-[0.8125rem] text-fg-muted">
            <CalendarDays size={16} className="mt-0.5 shrink-0 text-fg-subtle" aria-hidden="true" />
            <span>
              {dashboard.recentLeaves[0]
                ? <>Latest request: {leaveTypeMeta(dashboard.recentLeaves[0].leaveType).label.toLowerCase()} leave, {formatDayRange(dashboard.recentLeaves[0].startDate.slice(0, 10), dashboard.recentLeaves[0].endDate.slice(0, 10))} · {leaveStatusMeta(dashboard.recentLeaves[0].status).label.toLowerCase()}</>
                : "No leave booked yet."}
            </span>
          </p>
        )}
        {dashboard?.upcomingLeave && (
          <p className="mt-4 flex items-start gap-2.5 rounded-xl bg-info-soft px-3.5 py-3 text-[0.8125rem] text-info-fg">
            <CalendarCheck2 size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
            <span>
              Next: {leaveTypeMeta(dashboard.upcomingLeave.leaveType).label.toLowerCase()} leave, {formatDayRange(dashboard.upcomingLeave.startDate.slice(0, 10), dashboard.upcomingLeave.endDate.slice(0, 10))} · {formatLeaveDuration(dashboard.upcomingLeave)}
            </span>
          </p>
        )}
      </div>

      <div className="mt-4 flex justify-end">
        <Link to="/employee/leave" className="inline-flex min-h-8 items-center gap-2 rounded-md text-[0.8125rem] font-medium text-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
          Request leave
          <ArrowRight size={14} aria-hidden="true" />
        </Link>
      </div>
    </section>
  );
}
