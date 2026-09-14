import { Target } from "lucide-react";
import { useEffect, useState } from "react";
import { getPersonGoals } from "../../api/performanceApi";
import type { Goal } from "../../types/performance";
import LinkButton from "../ui/LinkButton";
import SectionCard from "../ui/SectionCard";
import { SkeletonText } from "../ui/Skeleton";
import GoalCard from "./GoalCard";

/**
 * Someone's goals on their profile, filtered by the server to what this viewer
 * may see: company goals for colleagues, team goals too for people sharing the
 * manager, everything for the owner, their manager and HR.
 */
export default function ProfileGoalsCard({ personId, isSelf }: { personId: number; isSelf: boolean }) {
  const [goals, setGoals] = useState<Goal[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    getPersonGoals(personId).then((list) => setGoals(list.goals)).catch(() => setFailed(true));
  }, [personId]);

  // Nothing to show a colleague is not worth a card.
  if (!isSelf && goals !== null && goals.length === 0) return null;

  const active = (goals ?? []).filter((goal) => goal.status === "active");
  return (
    <SectionCard
      title="Goals"
      icon={Target}
      actions={isSelf ? <LinkButton to="/goals" variant="ghost" size="sm">My goals</LinkButton> : undefined}
    >
      {failed ? (
        <p className="text-sm text-fg-muted">Goals could not be loaded.</p>
      ) : goals === null ? (
        <SkeletonText lines={2} />
      ) : active.length === 0 ? (
        <p className="text-sm text-fg-muted">{isSelf ? "No active goals." : "No active goals to show."}</p>
      ) : (
        <ul className="-mx-2 -my-3 divide-y divide-line">{active.slice(0, 4).map((goal) => <li key={goal.id}><GoalCard goal={goal} /></li>)}</ul>
      )}
    </SectionCard>
  );
}
