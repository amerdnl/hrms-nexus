import { ClipboardList, Lock, Pencil, Play } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { getApiErrorMessage } from "../../api/axios";
import { getDepartments, type Department } from "../../api/departmentApi";
import { closeCycle, getCycle, openCycle } from "../../api/performanceApi";
import ConfirmationModal from "../../components/common/ConfirmationModal";
import CycleDialog from "../../components/performance/CycleDialog";
import ReviewRow from "../../components/performance/ReviewRow";
import { cycleStatusMeta } from "../../components/performance/reviewMeta";
import Alert from "../../components/ui/Alert";
import Button from "../../components/ui/Button";
import EmptyState from "../../components/ui/EmptyState";
import ErrorState from "../../components/ui/ErrorState";
import FormField from "../../components/ui/FormField";
import Modal from "../../components/ui/Modal";
import PageHeader from "../../components/ui/PageHeader";
import SecondaryButton from "../../components/ui/SecondaryButton";
import SectionCard from "../../components/ui/SectionCard";
import SelectInput from "../../components/ui/SelectInput";
import { SkeletonText } from "../../components/ui/Skeleton";
import StatCard from "../../components/ui/StatCard";
import StatusBadge from "../../components/ui/StatusBadge";
import type { ReviewCycle, ReviewSummary } from "../../types/performance";
import { formatDate } from "../../utils/datetime";

/**
 * One review cycle for HR: its dates, who is in it and where each review
 * stands. Lists show status only; opening a review reads its content, and that
 * read is audited.
 */
export default function CycleDetailPage() {
  const { id } = useParams();
  const cycleId = Number(id);
  const [data, setData] = useState<{ cycle: ReviewCycle; participants: ReviewSummary[] } | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [actionError, setActionError] = useState("");
  const [dialog, setDialog] = useState<"edit" | "open" | "close" | null>(null);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [departmentId, setDepartmentId] = useState<number | "">("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setError("");
    getCycle(cycleId).then(setData).catch((requestError) => setError(getApiErrorMessage(requestError, "This cycle could not be loaded.")));
  }, [cycleId]);

  useEffect(load, [load]);
  useEffect(() => { getDepartments().then(setDepartments).catch(() => setDepartments([])); }, []);

  async function run(action: "open" | "close") {
    setBusy(true);
    setActionError("");
    try {
      setNotice(action === "open" ? await openCycle(cycleId, departmentId === "" ? null : departmentId) : await closeCycle(cycleId));
      setDialog(null);
      load();
    } catch (requestError) {
      setActionError(getApiErrorMessage(requestError, "That did not work. Reload to see the latest state."));
      setDialog(null);
    } finally {
      setBusy(false);
    }
  }

  if (error) {
    return (
      <section className="max-w-5xl space-y-6">
        <PageHeader title="Review cycle" backTo="/admin/performance" backLabel="Performance" />
        <SectionCard><ErrorState title="This cycle could not be loaded" description={error} onRetry={load} /></SectionCard>
      </section>
    );
  }
  if (!data) {
    return <section className="max-w-5xl space-y-6"><SectionCard><p className="sr-only" role="status">Loading the cycle</p><SkeletonText lines={6} /></SectionCard></section>;
  }

  const { cycle, participants } = data;
  const meta = cycleStatusMeta(cycle.status);
  const overdue = participants.filter((participant) => participant.overdue).length;

  return (
    <section className="max-w-5xl space-y-6">
      <PageHeader
        title={cycle.name}
        description={`${formatDate(cycle.periodStart)} – ${formatDate(cycle.periodEnd)} · self-reviews due ${formatDate(cycle.selfDueOn)} · manager reviews due ${formatDate(cycle.managerDueOn)}`}
        backTo="/admin/performance"
        backLabel="Performance"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge label={meta.label} tone={meta.tone} />
            {cycle.status === "draft" && (
              <>
                <Button variant="secondary" size="sm" icon={Pencil} onClick={() => setDialog("edit")}>Edit</Button>
                <Button size="sm" icon={Play} onClick={() => setDialog("open")}>Open cycle</Button>
              </>
            )}
            {cycle.status === "open" && <Button variant="secondary" size="sm" icon={Lock} onClick={() => setDialog("close")}>Close cycle</Button>}
          </div>
        }
      />
      {notice && <Alert tone="success" onDismiss={() => setNotice("")}>{notice}</Alert>}
      {actionError && <Alert tone="danger" onDismiss={() => setActionError("")}>{actionError}</Alert>}

      {cycle.status !== "draft" && (
        <div className="grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-4">
          <StatCard label="People" value={cycle.counts.participants} icon={ClipboardList} tone="primary" />
          <StatCard label="Self-review due" value={cycle.counts.pendingSelf} icon={ClipboardList} tone={cycle.counts.pendingSelf > 0 ? "warning" : "neutral"} />
          <StatCard label="Manager review due" value={cycle.counts.pendingManager} icon={ClipboardList} tone={cycle.counts.pendingManager > 0 ? "info" : "neutral"} />
          <StatCard label="Complete" value={cycle.counts.completed} icon={ClipboardList} tone="success" hint={overdue > 0 ? `${overdue} past due` : undefined} />
        </div>
      )}

      <SectionCard title="People in this cycle" icon={ClipboardList} description={cycle.status === "draft" ? undefined : "Opening a review reads its content, and that is recorded in the audit log."}>
        {cycle.status === "draft" ? (
          <EmptyState icon={ClipboardList} title="Nobody yet" description="Opening the cycle adds everyone currently employed, or one department." className="py-8" />
        ) : (
          <ul className="-mx-2 divide-y divide-line">{participants.map((participant) => <li key={participant.id}><ReviewRow review={participant} showPerson /></li>)}</ul>
        )}
      </SectionCard>

      <CycleDialog isOpen={dialog === "edit"} cycle={cycle} onClose={() => setDialog(null)} onSaved={() => { setDialog(null); setNotice("Draft saved."); load(); }} />
      <Modal
        isOpen={dialog === "open"}
        onClose={() => setDialog(null)}
        title={`Open ${cycle.name}?`}
        description="Each person gets a review and is told their self-review is due. The dates cannot be edited once it is open."
        size="md"
        isDismissDisabled={busy}
        footer={
          <>
            <SecondaryButton onClick={() => setDialog(null)} disabled={busy}>Cancel</SecondaryButton>
            <Button icon={Play} isLoading={busy} loadingLabel="Opening…" onClick={() => void run("open")}>Open cycle</Button>
          </>
        }
      >
        <FormField id="cycle-department" label="Who is reviewed" hint="Everyone currently employed, or one department.">
          <SelectInput id="cycle-department" value={departmentId} onChange={(e) => setDepartmentId(Number(e.target.value) || "")}>
            <option value="">The whole company</option>
            {departments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}
          </SelectInput>
        </FormField>
      </Modal>
      <ConfirmationModal
        isOpen={dialog === "close"}
        isProcessing={busy}
        tone="primary"
        title={`Close ${cycle.name}?`}
        description="Reviews can no longer be written. Everything already submitted is kept, and people can still read their reviews."
        confirmLabel="Close cycle"
        processingLabel="Closing…"
        onCancel={() => setDialog(null)}
        onConfirm={() => void run("close")}
      />
    </section>
  );
}
