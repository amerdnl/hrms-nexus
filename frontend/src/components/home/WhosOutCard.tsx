import { ArrowRight, CircleCheck } from "lucide-react";
import HomeEmptyState from "./HomeEmptyState";
import { Link } from "react-router-dom";
import { resolveProfileImageUrl } from "../../api/axios";
import type { Absence, CalendarData } from "../../types/workplace";
import { cn } from "../../utils/cn";
import Avatar from "../ui/Avatar";
import { formatDayRange } from "./homeTime";
import type { LoadState } from "./useCompanyCalendar";

const LEAVE_LABELS: Record<string, string> = {
  annual: "Annual leave",
  medical: "Medical leave",
  emergency: "Emergency leave",
  unpaid: "Unpaid leave",
};

function AbsenceRow({ absence, chip }: { absence: Absence; chip: string }) {
  return (
    <li className="flex items-start gap-3.5 py-1.5">
      <Avatar name={absence.name} src={resolveProfileImageUrl(absence.profileImage)} size="md" className="size-9" />
      <div className="min-w-0 flex-1">
        <Link to={`/people/${absence.employeeId}`} className="block truncate rounded text-sm font-medium text-fg hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
          {absence.name}
        </Link>
        <p className="line-clamp-2 text-[0.8125rem] leading-5 text-fg-muted">
          {absence.leaveType ? LEAVE_LABELS[absence.leaveType] ?? "Leave" : absence.departmentName ?? "Away"}
          {absence.status === "pending" && " · awaiting approval"}
        </p>
      </div>
      <span className={cn(
        "mt-0.5 shrink-0 whitespace-nowrap rounded-full px-3 py-0.5 text-[0.8125rem]",
        absence.status === "approved" ? "bg-info-soft text-info-fg" : "bg-warning-soft text-warning-fg",
      )}>
        {chip}
      </span>
    </li>
  );
}

/**
 * Who is away on the company's today, from the calendar's own visibility
 * rules: the leave type appears only where this viewer may see it (their own,
 * their team's, or HR), and a pending request says it is awaiting approval
 * rather than passing for confirmed absence. HR Nexus records whole days, so
 * an approved absence today is "All day". While there is room the card also
 * lists who is away next, with their dates.
 */
export default function WhosOutCard({ state, calendar, className, limit = 3 }: {
  state: LoadState; calendar: CalendarData | null; className?: string; limit?: number;
}) {
  const today = calendar?.config.today ?? "";
  const absences = calendar?.absences ?? [];
  const out = absences.filter((absence) => absence.startDate <= today && absence.endDate >= today);
  const shown = out.slice(0, limit);
  const next = absences
    .filter((absence) => absence.startDate > today)
    .sort((a, b) => a.startDate.localeCompare(b.startDate))
    .slice(0, Math.max(0, limit - shown.length));

  return (
    <section aria-labelledby="home-out-title" className={cn("flex flex-col rounded-card border border-line bg-surface p-5 shadow-card sm:px-6 sm:pb-3 sm:pt-[1.125rem]", className)}>
      <div className="flex items-center justify-between gap-3">
        <h2 id="home-out-title" className="text-[1.0625rem] font-semibold text-fg">Who’s out today</h2>
        <Link to={`/calendar?date=${today}`} className="inline-flex min-h-8 items-center gap-1.5 rounded-md text-[0.8125rem] font-medium text-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
          View all
          <ArrowRight size={14} aria-hidden="true" />
        </Link>
      </div>

      <div className="mt-2 flex flex-1 flex-col">
        {state === "failed" && <p className="text-sm text-fg-muted">Absences could not be loaded.</p>}
        {state === "loading" && (
          <div aria-busy="true" className="space-y-4 pt-2">
            {[0, 1, 2].map((key) => (
              <div key={key} aria-hidden="true" className="flex items-center gap-3">
                <div className="size-10 animate-pulse rounded-full bg-surface-muted motion-reduce:animate-none" />
                <div className="h-4 flex-1 animate-pulse rounded bg-surface-muted motion-reduce:animate-none" />
              </div>
            ))}
          </div>
        )}
        {state === "ready" && out.length === 0 && next.length === 0 && (
          <HomeEmptyState icon={CircleCheck} tint="green" title="Everyone is in today" description="No approved or pending leave in the next two weeks." />
        )}
        {state === "ready" && out.length === 0 && next.length > 0 && (
          <p className="flex items-center gap-2.5 py-2.5 text-sm text-fg-muted">
            <CircleCheck size={18} className="text-success-fg" aria-hidden="true" />
            Everyone is in today.
          </p>
        )}
        {state === "ready" && shown.length > 0 && (
          <ul aria-label="Out today" className="divide-y divide-line">
            {shown.map((absence) => (
              <AbsenceRow key={`${absence.employeeId}-${absence.startDate}`} absence={absence} chip={absence.status === "approved" ? "All day" : "Pending"} />
            ))}
          </ul>
        )}
        {state === "ready" && out.length > shown.length && (
          <p className="pt-1 text-[0.8125rem] text-fg-subtle">and {out.length - shown.length} more today</p>
        )}
        {state === "ready" && next.length > 0 && (
          <>
            <p className="mt-1.5 text-[0.6875rem] font-semibold uppercase tracking-[0.1em] text-fg-subtle">Away next</p>
            <ul aria-label="Away next" className="divide-y divide-line">
              {next.map((absence) => (
                <AbsenceRow key={`${absence.employeeId}-${absence.startDate}`} absence={absence} chip={formatDayRange(absence.startDate, absence.endDate)} />
              ))}
            </ul>
          </>
        )}
      </div>
    </section>
  );
}
