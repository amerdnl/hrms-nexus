import { ClipboardList, Plus } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { getApiErrorMessage } from "../../api/axios";
import { getCycles } from "../../api/performanceApi";
import CycleDialog from "../../components/performance/CycleDialog";
import { cycleStatusMeta } from "../../components/performance/reviewMeta";
import Button from "../../components/ui/Button";
import EmptyState from "../../components/ui/EmptyState";
import ErrorState from "../../components/ui/ErrorState";
import PageHeader from "../../components/ui/PageHeader";
import ProgressBar from "../../components/ui/ProgressBar";
import SectionCard from "../../components/ui/SectionCard";
import { SkeletonText } from "../../components/ui/Skeleton";
import StatusBadge from "../../components/ui/StatusBadge";
import type { ReviewCycle } from "../../types/performance";
import { formatDate } from "../../utils/datetime";

/** HR's review cycles: drafts, the one running, and past cycles, with completion counts. */
export default function PerformanceAdminPage() {
  const [cycles, setCycles] = useState<ReviewCycle[] | null>(null);
  const [error, setError] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const navigate = useNavigate();

  const load = useCallback(() => {
    setError("");
    getCycles().then(setCycles).catch((requestError) => setError(getApiErrorMessage(requestError, "Review cycles could not be loaded.")));
  }, []);

  useEffect(load, [load]);

  return (
    // Centred at the Workflows width, header and tabs included, as the Action Center is.
    <section className="mx-auto w-full max-w-5xl space-y-6">
      <PageHeader
        title="Performance"
        description="Review cycles. Each review runs self first, then the manager, rated 1 to 5."
        area="workflows"
        actions={<Button icon={Plus} onClick={() => setIsCreating(true)}>New cycle</Button>}
      />
      <SectionCard padded={false}>
        {error ? (
          <div className="p-5"><ErrorState title="Review cycles could not be loaded" description={error} onRetry={load} /></div>
        ) : cycles === null ? (
          <div className="p-5"><p className="sr-only" role="status">Loading review cycles</p><SkeletonText lines={4} /></div>
        ) : cycles.length === 0 ? (
          <EmptyState icon={ClipboardList} title="No review cycles yet" description="Draft one, then open it when you are ready." />
        ) : (
          <ul className="divide-y divide-line">
            {cycles.map((cycle) => {
              const meta = cycleStatusMeta(cycle.status);
              const { participants, completed } = cycle.counts;
              return (
                <li key={cycle.id}>
                  <Link to={`/admin/performance/cycles/${cycle.id}`} className="grid gap-3 px-4 py-4 transition-colors hover:bg-surface-muted focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring sm:grid-cols-[minmax(0,1fr)_14rem] sm:px-5">
                    <span className="min-w-0">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="text-base font-semibold text-fg [overflow-wrap:anywhere]">{cycle.name}</span>
                        <StatusBadge label={meta.label} tone={meta.tone} />
                      </span>
                      <span className="mt-0.5 block text-xs text-fg-subtle">
                        {formatDate(cycle.periodStart)} – {formatDate(cycle.periodEnd)} · self-reviews due {formatDate(cycle.selfDueOn)} · manager reviews due {formatDate(cycle.managerDueOn)}
                      </span>
                    </span>
                    <span>
                      {cycle.status === "draft" ? (
                        <span className="text-sm text-fg-muted">Not opened</span>
                      ) : (
                        <>
                          <ProgressBar size="sm" tone={cycle.status === "closed" ? "success" : "primary"} value={completed} max={Math.max(participants, 1)} label={`${completed} of ${participants} reviews complete`} isDecorative />
                          <span className="mt-1 block text-right text-xs text-fg-muted">{completed} of {participants} complete</span>
                        </>
                      )}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </SectionCard>
      <CycleDialog isOpen={isCreating} onClose={() => setIsCreating(false)} onSaved={(id) => { setIsCreating(false); navigate(`/admin/performance/cycles/${id}`); }} />
    </section>
  );
}
