import { Plus, Target } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getApiErrorMessage } from "../../api/axios";
import { getMyGoals } from "../../api/performanceApi";
import GoalCard from "../../components/performance/GoalCard";
import GoalDialog from "../../components/performance/GoalDialog";
import Button from "../../components/ui/Button";
import EmptyState from "../../components/ui/EmptyState";
import ErrorState from "../../components/ui/ErrorState";
import PageHeader from "../../components/ui/PageHeader";
import SectionCard from "../../components/ui/SectionCard";
import { SkeletonText } from "../../components/ui/Skeleton";
import Tabs from "../../components/ui/Tabs";
import type { Goal, GoalStatus } from "../../types/performance";

/** Your goals, whether you set them or your manager did. */
export default function GoalsPage() {
  const [goals, setGoals] = useState<Goal[] | null>(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<GoalStatus>("active");
  const [isCreating, setIsCreating] = useState(false);
  const navigate = useNavigate();

  const load = useCallback(() => {
    setError("");
    getMyGoals().then((list) => setGoals(list.goals)).catch((requestError) => setError(getApiErrorMessage(requestError, "Your goals could not be loaded.")));
  }, []);

  useEffect(load, [load]);

  const counts = { active: 0, completed: 0, cancelled: 0 };
  for (const goal of goals ?? []) counts[goal.status] += 1;
  const shown = (goals ?? []).filter((goal) => goal.status === tab);

  return (
    <section className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title="My goals"
        description="What you are working towards, and how far along it is."
        actions={<Button icon={Plus} onClick={() => setIsCreating(true)}>New goal</Button>}
      />
      <SectionCard padded={false}>
        <div className="border-b border-line px-4 pt-2 sm:px-5">
          <Tabs
            tabs={[{ id: "active", label: "Active", count: counts.active }, { id: "completed", label: "Completed", count: counts.completed }, { id: "cancelled", label: "Cancelled", count: counts.cancelled }]}
            active={tab}
            onChange={(id) => setTab(id as GoalStatus)}
          />
        </div>
        <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} className="px-3 py-2 sm:px-4">
          {error ? (
            <ErrorState title="Your goals could not be loaded" description={error} onRetry={load} />
          ) : goals === null ? (
            <div className="p-2"><p className="sr-only" role="status">Loading goals</p><SkeletonText lines={4} /></div>
          ) : shown.length === 0 ? (
            <EmptyState icon={Target} title={tab === "active" ? "No active goals" : `No ${tab} goals`} description={tab === "active" ? "Set one yourself, or your manager may set one with you." : undefined} />
          ) : (
            <ul className="divide-y divide-line">{shown.map((goal) => <li key={goal.id}><GoalCard goal={goal} /></li>)}</ul>
          )}
        </div>
      </SectionCard>
      <GoalDialog isOpen={isCreating} onClose={() => setIsCreating(false)} onSaved={(id) => { setIsCreating(false); navigate(`/goals/${id}`); }} />
    </section>
  );
}
