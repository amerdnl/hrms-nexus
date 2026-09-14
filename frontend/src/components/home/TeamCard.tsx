import { ArrowRight, CalendarClock } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { resolveProfileImageUrl } from "../../api/axios";
import { getTeamOverview } from "../../api/teamApi";
import { dayStatusMeta } from "../../pages/team/teamStatus";
import type { TeamOverview } from "../../types/team";
import { cn } from "../../utils/cn";
import Avatar from "../ui/Avatar";
import StatusBadge from "../ui/StatusBadge";

/**
 * A manager's team today, on their own Home: who is in, who is away, and the
 * leave decisions waiting for them. Only someone the server says manages people
 * is shown this card, and the team request is refused for anyone else. No pay,
 * no location - the team layer never carries either.
 */
export default function TeamCard({ className }: { className?: string }) {
  const [overview, setOverview] = useState<TeamOverview | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    getTeamOverview().then(setOverview).catch(() => setFailed(true));
  }, []);

  const counts = overview?.counts;

  return (
    <section aria-labelledby="home-team-title" className={cn("flex flex-col rounded-card border border-line bg-surface p-5 shadow-card sm:p-6", className)}>
      <div className="flex items-center justify-between gap-3">
        <h2 id="home-team-title" className="text-[1.0625rem] font-semibold text-fg">Your team today</h2>
        <Link to="/team" className="inline-flex min-h-8 items-center gap-1.5 rounded-md text-[0.8125rem] font-medium text-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
          Team
          <ArrowRight size={14} aria-hidden="true" />
        </Link>
      </div>

      <div className="mt-2 flex-1">
        {failed && <p className="text-sm text-fg-muted">Your team could not be loaded.</p>}
        {!failed && !overview && (
          <div aria-busy="true" className="space-y-4 pt-1">
            {[0, 1, 2].map((key) => <div key={key} aria-hidden="true" className="h-8 animate-pulse rounded bg-surface-muted motion-reduce:animate-none" />)}
          </div>
        )}
        {overview && counts && (
          <>
            <p className="text-[0.8125rem] text-fg-muted">
              {counts.present + counts.late} of {counts.members} in · {counts.onLeave} on leave · {counts.notClockedIn} not clocked in
            </p>
            {counts.pendingDecisions > 0 && (
              <Link
                to="/team/leave?status=pending"
                className="mt-3 flex items-center gap-2.5 rounded-xl bg-warning-soft px-3.5 py-2.5 text-[0.8125rem] font-medium text-warning-fg hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                <CalendarClock size={16} aria-hidden="true" />
                {counts.pendingDecisions} leave {counts.pendingDecisions === 1 ? "request" : "requests"} waiting for you
              </Link>
            )}
            <ul className="mt-2 divide-y divide-line">
              {overview.members.slice(0, 3).map((member) => (
                <li key={member.id} className="flex items-center gap-3 py-2.5">
                  <Avatar name={member.fullName} src={resolveProfileImageUrl(member.profileImage)} size="sm" />
                  <Link to={`/people/${member.id}`} className="min-w-0 flex-1 truncate rounded text-sm font-medium text-fg hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
                    {member.fullName}
                  </Link>
                  <StatusBadge {...dayStatusMeta(member.day)} className="shrink-0" />
                </li>
              ))}
            </ul>
            {overview.members.length > 3 && (
              <p className="pt-1 text-[0.8125rem] text-fg-subtle">and {overview.members.length - 3} more</p>
            )}
          </>
        )}
      </div>
    </section>
  );
}
