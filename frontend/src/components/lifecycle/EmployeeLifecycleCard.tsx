import { ClipboardList, UserMinus, UserPlus } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getPlans } from "../../api/lifecycleApi";
import type { LifecycleKind, LifecyclePlan } from "../../types/lifecycle";
import Button from "../ui/Button";
import SectionCard from "../ui/SectionCard";
import { SkeletonText } from "../ui/Skeleton";
import PlanProgressRow from "./PlanProgressRow";
import StartPlanDialog from "./StartPlanDialog";

/** On HR's employee record: this person's onboarding and offboarding, and where to start one. */
export default function EmployeeLifecycleCard({ employeeId, employeeName, employed }: {
  employeeId: number;
  employeeName: string;
  employed: boolean;
}) {
  const [plans, setPlans] = useState<LifecyclePlan[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [starting, setStarting] = useState<LifecycleKind | null>(null);
  const navigate = useNavigate();

  const load = useCallback(() => {
    getPlans()
      .then((result) => setPlans(result.plans.filter((plan) => plan.employeeId === employeeId)))
      .catch(() => setFailed(true));
  }, [employeeId]);

  useEffect(load, [load]);

  const activeKinds = new Set((plans ?? []).filter((plan) => plan.status === "active").map((plan) => plan.kind));

  return (
    <SectionCard
      title="Onboarding and offboarding"
      icon={ClipboardList}
      description={plans && plans.length === 0 ? "No plans yet." : undefined}
      actions={employed && plans && (
        <div className="flex flex-wrap gap-2">
          {/* Nobody is onboarded while they are being offboarded. */}
          {!activeKinds.has("onboarding") && !activeKinds.has("offboarding") && <Button variant="secondary" size="sm" icon={UserPlus} onClick={() => setStarting("onboarding")}>Start onboarding</Button>}
          {!activeKinds.has("offboarding") && <Button variant="secondary" size="sm" icon={UserMinus} onClick={() => setStarting("offboarding")}>Start offboarding</Button>}
        </div>
      )}
      padded={Boolean(failed || !plans || plans.length > 0)}
    >
      {failed ? (
        <p className="text-sm text-fg-muted">Plans could not be loaded.</p>
      ) : !plans ? (
        <SkeletonText lines={2} />
      ) : plans.length > 0 ? (
        <ul className="-mx-2 divide-y divide-line">
          {plans.map((plan) => <li key={plan.id}><PlanProgressRow plan={plan} to={`/admin/lifecycle/plans/${plan.id}`} /></li>)}
        </ul>
      ) : null}

      {starting && (
        <StartPlanDialog
          isOpen
          kind={starting}
          employee={{ id: employeeId, name: employeeName }}
          onClose={() => setStarting(null)}
          onStarted={(planId) => {
            setStarting(null);
            navigate(`/admin/lifecycle/plans/${planId}`);
          }}
        />
      )}
    </SectionCard>
  );
}
