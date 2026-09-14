import {
  CalendarCheck2,
  CalendarClock,
  CalendarOff,
  CircleCheck,
  Clock3,
  UserRoundX,
  UsersRound,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getApiErrorMessage, resolveProfileImageUrl } from "../../api/axios";
import { getTeamOverview } from "../../api/teamApi";
import TeamInsights from "../../components/analytics/TeamInsights";
import LeaveDecisionModal from "../../components/leave/LeaveDecisionModal";
import Alert from "../../components/ui/Alert";
import Avatar from "../../components/ui/Avatar";
import Button from "../../components/ui/Button";
import EmptyState from "../../components/ui/EmptyState";
import ErrorState from "../../components/ui/ErrorState";
import LinkButton from "../../components/ui/LinkButton";
import PageHeader from "../../components/ui/PageHeader";
import SectionCard from "../../components/ui/SectionCard";
import StatCard from "../../components/ui/StatCard";
import Skeleton, { SkeletonText } from "../../components/ui/Skeleton";
import StatusBadge from "../../components/ui/StatusBadge";
import type { TeamLeaveRequest, TeamOverview } from "../../types/team";
import { formatDate, formatDateRange, formatTime } from "../../utils/datetime";
import { formatLeaveDuration } from "../../utils/leave";
import { leaveStatusMeta, leaveTypeMeta } from "../../utils/status";
import { dayStatusMeta } from "./teamStatus";

/**
 * The manager's dashboard.
 *
 * Built around the two questions a manager opens it with: is my team here
 * today, and is anyone waiting on me. Everything on it is the team layer the
 * server sends for current direct reports - no pay, no location.
 */
export default function TeamOverviewPage() {
  const [overview, setOverview] = useState<TeamOverview | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [reviewing, setReviewing] = useState<TeamLeaveRequest | null>(null);

  const load = useCallback(async () => {
    setError("");
    try {
      setOverview(await getTeamOverview());
    } catch (requestError) {
      setOverview(null);
      setError(getApiErrorMessage(requestError, "Your team could not be loaded."));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const header = (
    <PageHeader
      title="My team"
      description="Who is in today, what is waiting for your decision, and who is away soon."
    />
  );

  if (isLoading) {
    return (
      <section className="max-w-7xl space-y-6" aria-busy="true">
        {header}
        <p className="sr-only" aria-live="polite">Loading your team</p>
        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-5">
          {Array.from({ length: 5 }, (_, index) => <Skeleton key={index} className="h-28 rounded-xl" />)}
        </div>
        <SectionCard><SkeletonText lines={6} /></SectionCard>
      </section>
    );
  }

  if (error || !overview) {
    return (
      <section className="max-w-7xl space-y-6">
        {header}
        <SectionCard>
          <ErrorState
            title="Your team could not be loaded"
            description={error || "No team data was returned."}
            onRetry={() => { setIsLoading(true); void load(); }}
          />
        </SectionCard>
      </section>
    );
  }

  const { counts, members, pending, upcoming } = overview;
  const inToday = counts.present + counts.late;

  return (
    <section className="max-w-7xl space-y-6">
      {header}

      {notice && <Alert tone="success" onDismiss={() => setNotice("")}>{notice}</Alert>}

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-5">
        <StatCard label="Direct reports" value={counts.members} icon={UsersRound} tone="primary" iconPlacement="leading" />
        <StatCard label="In today" value={inToday} icon={CircleCheck} tone="success" iconPlacement="leading" hint={counts.late > 0 ? `${counts.late} late` : "None late"} />
        <StatCard label="On leave today" value={counts.onLeave} icon={CalendarOff} tone="info" iconPlacement="leading" />
        <StatCard label="Not clocked in" value={counts.notClockedIn} icon={UserRoundX} tone="neutral" iconPlacement="leading" hint="No record and no leave" />
        <StatCard
          label="Awaiting your decision"
          value={counts.pendingDecisions}
          icon={CalendarClock}
          tone={counts.pendingDecisions > 0 ? "warning" : "neutral"}
          iconPlacement="leading"
          to="/team/leave"
          className="col-span-2 lg:col-span-1"
        />
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-3">
        <SectionCard
          className="lg:col-span-2"
          title="Today"
          description={formatDate(overview.today)}
          icon={Clock3}
          actions={<LinkButton to="/team/attendance" variant="link" size="sm">Attendance</LinkButton>}
          padded={members.length === 0}
        >
          {members.length === 0 ? (
            <EmptyState
              icon={UsersRound}
              title="No one reports to you right now"
              description="Your team appears here when HR records reporting lines."
            />
          ) : (
            <ul className="divide-y divide-line">
              {members.map((member) => {
                const meta = dayStatusMeta(member.day);
                return (
                  <li key={member.id} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-5 py-3">
                    <Avatar name={member.fullName} src={resolveProfileImageUrl(member.profileImage)} size="md" />
                    <div className="min-w-0">
                      <Link
                        to={`/people/${member.id}`}
                        className="text-sm font-semibold text-fg hover:text-primary hover:underline focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring [overflow-wrap:anywhere]"
                      >
                        {member.fullName}
                      </Link>
                      <p className="text-xs text-fg-subtle [overflow-wrap:anywhere]">
                        {member.jobTitle ?? "No job title recorded"}
                        {member.day.checkInTime ? ` · in ${formatTime(member.day.checkInTime)}` : ""}
                        {member.day.checkOutTime ? `, out ${formatTime(member.day.checkOutTime)}` : ""}
                        {member.day.lateMinutes ? ` · ${member.day.lateMinutes} min late` : ""}
                      </p>
                    </div>
                    <StatusBadge {...meta} />
                  </li>
                );
              })}
            </ul>
          )}
        </SectionCard>

        <div className="space-y-6">
          <SectionCard title="Waiting for you" icon={CalendarCheck2}>
            {pending.length === 0 ? (
              <EmptyState icon={CircleCheck} title="Nothing to decide" description="New leave requests from your team appear here." className="py-6" />
            ) : (
              <ul className="space-y-3">
                {pending.slice(0, 5).map((leave) => (
                  <li key={leave.id} className="rounded-xl border border-line p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-fg [overflow-wrap:anywhere]">{leave.employeeName}</p>
                        <p className="mt-0.5 text-xs text-fg-subtle">
                          {leaveTypeMeta(leave.leaveType).label} · {formatDateRange(leave.startDate, leave.endDate)} · {formatLeaveDuration(leave)}
                        </p>
                      </div>
                      <Button size="sm" variant="secondary" onClick={() => setReviewing(leave)}>Review</Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {/* At the foot rather than in the header: the side column is too
                narrow for a title and a link on one line. */}
            <LinkButton to="/team/leave" variant="link" size="sm" className="mt-3">
              All team requests
            </LinkButton>
          </SectionCard>

          <SectionCard title={`Away in the next ${overview.upcomingDays} days`} icon={CalendarOff}>
            {upcoming.length === 0 ? (
              <p className="text-sm text-fg-muted">No approved or pending leave in the next {overview.upcomingDays} days.</p>
            ) : (
              <ul className="divide-y divide-line">
                {upcoming.map((leave) => (
                  <li key={leave.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2 py-2.5 first:pt-0 last:pb-0">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-fg [overflow-wrap:anywhere]">{leave.employeeName}</p>
                      <p className="text-xs text-fg-subtle">{formatDateRange(leave.startDate, leave.endDate)} · {leaveTypeMeta(leave.leaveType).label}</p>
                    </div>
                    <StatusBadge {...leaveStatusMeta(leave.status)} />
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>
        </div>
      </div>

      <TeamInsights />

      <LeaveDecisionModal
        leave={reviewing}
        onClose={() => setReviewing(null)}
        onDecided={(status, leave) => {
          setReviewing(null);
          setNotice(`${leave.employeeName}'s request was ${status}.`);
          void load();
        }}
      />
    </section>
  );
}
