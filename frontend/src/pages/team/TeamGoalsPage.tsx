import { Plus, Target } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getApiErrorMessage, resolveProfileImageUrl } from "../../api/axios";
import { getTeamGoals } from "../../api/performanceApi";
import { getTeamOverview } from "../../api/teamApi";
import GoalCard from "../../components/performance/GoalCard";
import GoalDialog from "../../components/performance/GoalDialog";
import Avatar from "../../components/ui/Avatar";
import Button from "../../components/ui/Button";
import EmptyState from "../../components/ui/EmptyState";
import ErrorState from "../../components/ui/ErrorState";
import PageHeader from "../../components/ui/PageHeader";
import SectionCard from "../../components/ui/SectionCard";
import { SkeletonText } from "../../components/ui/Skeleton";
import type { Goal } from "../../types/performance";

/**
 * Your reports' goals, person by person, including their private ones. You can
 * set a goal for any of them and record progress on theirs.
 */
export default function TeamGoalsPage() {
  const [goals, setGoals] = useState<Goal[] | null>(null);
  const [members, setMembers] = useState<Array<{ id: number; name: string; image: string | null }>>([]);
  const [error, setError] = useState("");
  const [isSetting, setIsSetting] = useState(false);
  const navigate = useNavigate();

  const load = useCallback(() => {
    setError("");
    Promise.all([getTeamGoals(), getTeamOverview()])
      .then(([list, overview]) => {
        setGoals(list.goals);
        setMembers(overview.members.map((member) => ({ id: member.id, name: member.fullName, image: member.profileImage })));
      })
      .catch((requestError) => setError(getApiErrorMessage(requestError, "Team goals could not be loaded.")));
  }, []);

  useEffect(load, [load]);

  return (
    <section className="max-w-4xl space-y-6">
      <PageHeader
        title="Team goals"
        description="Goals for the people who report to you, private ones included."
        actions={members.length > 0 && <Button icon={Plus} onClick={() => setIsSetting(true)}>Set a goal</Button>}
      />
      {error ? (
        <SectionCard><ErrorState title="Team goals could not be loaded" description={error} onRetry={load} /></SectionCard>
      ) : goals === null ? (
        <SectionCard><p className="sr-only" role="status">Loading team goals</p><SkeletonText lines={5} /></SectionCard>
      ) : members.length === 0 ? (
        <SectionCard><EmptyState icon={Target} title="Nobody reports to you" /></SectionCard>
      ) : (
        members.map((member) => {
          const theirs = goals.filter((goal) => goal.ownerId === member.id && goal.status !== "cancelled");
          return (
            <SectionCard key={member.id}>
              <div className="mb-2 flex items-center gap-3">
                <Avatar name={member.name} src={resolveProfileImageUrl(member.image)} size="sm" />
                <h2 className="text-base font-semibold text-fg [overflow-wrap:anywhere]">{member.name}</h2>
                <span className="ml-auto text-xs text-fg-subtle">{theirs.filter((goal) => goal.status === "active").length} active</span>
              </div>
              {theirs.length === 0 ? (
                <p className="text-sm text-fg-muted">No goals yet.</p>
              ) : (
                <ul className="-mx-2 divide-y divide-line">{theirs.map((goal) => <li key={goal.id}><GoalCard goal={goal} /></li>)}</ul>
              )}
            </SectionCard>
          );
        })
      )}
      <GoalDialog
        isOpen={isSetting}
        owners={members.map((member) => ({ id: member.id, name: member.name }))}
        onClose={() => setIsSetting(false)}
        onSaved={(id) => { setIsSetting(false); navigate(`/goals/${id}`); }}
      />
    </section>
  );
}
