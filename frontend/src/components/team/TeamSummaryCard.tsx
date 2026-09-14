import { CalendarClock, UsersRound } from "lucide-react";
import { useEffect, useState } from "react";
import { getTeamOverview } from "../../api/teamApi";
import type { TeamOverview } from "../../types/team";
import LinkButton from "../ui/LinkButton";
import SectionCard from "../ui/SectionCard";
import { SkeletonText } from "../ui/Skeleton";

/**
 * A manager's team at a glance, for their own dashboard.
 *
 * Its own request and its own state, so a failure here degrades this card and
 * nothing else: the employee dashboard is still primarily about the person
 * reading it.
 */
export default function TeamSummaryCard() {
  const [overview, setOverview] = useState<TeamOverview | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "failed">("loading");

  useEffect(() => {
    getTeamOverview()
      .then((result) => { setOverview(result); setState("ready"); })
      .catch(() => setState("failed"));
  }, []);

  return (
    <SectionCard
      title="Your team"
      icon={UsersRound}
      actions={<LinkButton to="/team" variant="link" size="sm">Open</LinkButton>}
    >
      {state === "loading" && <SkeletonText lines={3} />}
      {state === "failed" && (
        <p className="text-sm text-fg-muted">Your team could not be loaded. Open My team to try again.</p>
      )}
      {state === "ready" && overview && (
        <>
          <p className="text-3xl font-bold tracking-tight text-fg">
            {overview.counts.present + overview.counts.late}
            <span className="ml-1.5 text-sm font-medium text-fg-muted">
              of {overview.counts.members} in today
            </span>
          </p>
          <p className="mt-1 text-xs text-fg-subtle">
            {overview.counts.onLeave} on leave · {overview.counts.notClockedIn} not clocked in
          </p>
          {overview.counts.pendingDecisions > 0 ? (
            <LinkButton to="/team/leave" variant="secondary" size="sm" icon={CalendarClock} className="mt-4">
              {overview.counts.pendingDecisions} request{overview.counts.pendingDecisions === 1 ? "" : "s"} waiting for you
            </LinkButton>
          ) : (
            <p className="mt-4 text-sm text-fg-muted">No leave requests waiting for you.</p>
          )}
        </>
      )}
    </SectionCard>
  );
}
