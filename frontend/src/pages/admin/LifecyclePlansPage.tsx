import { ClipboardList, ListChecks, Plus } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { getApiErrorMessage } from "../../api/axios";
import { getPlans } from "../../api/lifecycleApi";
import PlanProgressRow from "../../components/lifecycle/PlanProgressRow";
import StartPlanDialog from "../../components/lifecycle/StartPlanDialog";
import Button from "../../components/ui/Button";
import EmptyState from "../../components/ui/EmptyState";
import ErrorState from "../../components/ui/ErrorState";
import LinkButton from "../../components/ui/LinkButton";
import PageHeader from "../../components/ui/PageHeader";
import SectionCard from "../../components/ui/SectionCard";
import { SkeletonText } from "../../components/ui/Skeleton";
import Tabs from "../../components/ui/Tabs";
import type { LifecycleKind, LifecyclePlan, PlanStatus } from "../../types/lifecycle";

const TABS: Array<{ id: PlanStatus; label: string }> = [
  { id: "active", label: "In progress" },
  { id: "completed", label: "Completed" },
  { id: "cancelled", label: "Cancelled" },
];

/** HR's list of onboarding or offboarding plans, and where new ones start. */
export default function LifecyclePlansPage({ kind }: { kind: LifecycleKind }) {
  const [params, setParams] = useSearchParams();
  const requested = params.get("status") as PlanStatus | null;
  const status: PlanStatus = requested && TABS.some((tab) => tab.id === requested) ? requested : "active";
  const navigate = useNavigate();

  const [plans, setPlans] = useState<LifecyclePlan[] | null>(null);
  const [error, setError] = useState("");
  const [isStarting, setIsStarting] = useState(false);

  const load = useCallback(() => {
    setPlans(null);
    setError("");
    getPlans({ kind, status })
      .then((result) => setPlans(result.plans))
      .catch((requestError) => setError(getApiErrorMessage(requestError, "Plans could not be loaded.")));
  }, [kind, status]);

  useEffect(load, [load]);

  const title = kind === "onboarding" ? "Onboarding" : "Offboarding";
  return (
    <section className="max-w-5xl space-y-6">
      <PageHeader
        title={title}
        description={kind === "onboarding"
          ? "New joiners' checklists, shared between them, their manager and HR."
          : "Leavers' checklists. Completing one deactivates the employee and keeps their history."}
        actions={
          <div className="flex flex-wrap gap-2">
            <LinkButton to={`/admin/lifecycle/templates?kind=${kind}`} variant="secondary" icon={ListChecks}>Checklists</LinkButton>
            <Button icon={Plus} onClick={() => setIsStarting(true)}>Start {kind}</Button>
          </div>
        }
      />

      <SectionCard padded={false}>
        <div className="border-b border-line px-4 pt-2 sm:px-5">
          <Tabs tabs={TABS} active={status} onChange={(id) => setParams(id === "active" ? {} : { status: id }, { replace: true })} />
        </div>
        <div role="tabpanel" id={`panel-${status}`} aria-labelledby={`tab-${status}`} className="px-3 py-2 sm:px-4">
          {error ? (
            <ErrorState title="Plans could not be loaded" description={error} onRetry={load} />
          ) : plans === null ? (
            <div className="p-2"><p className="sr-only" role="status">Loading plans</p><SkeletonText lines={5} /></div>
          ) : plans.length === 0 ? (
            <EmptyState
              icon={ClipboardList}
              title={status === "active" ? `No ${kind} in progress` : `No ${status} plans`}
              description={status === "active" ? `Start ${kind} from here or from the employee's HR record.` : undefined}
            />
          ) : (
            <ul className="divide-y divide-line">
              {plans.map((plan) => <li key={plan.id}><PlanProgressRow plan={plan} to={`/admin/lifecycle/plans/${plan.id}`} /></li>)}
            </ul>
          )}
        </div>
      </SectionCard>

      <StartPlanDialog
        isOpen={isStarting}
        kind={kind}
        onClose={() => setIsStarting(false)}
        onStarted={(planId) => {
          setIsStarting(false);
          navigate(`/admin/lifecycle/plans/${planId}`);
        }}
      />
    </section>
  );
}
