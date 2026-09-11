import { ChevronRight, Receipt } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { getApiErrorMessage } from "../../api/axios";
import { getMyPayslip, getMyPayslips } from "../../api/payrollApi";
import PayslipView from "../../components/payroll/PayslipView";
import Alert from "../../components/ui/Alert";
import EmptyState from "../../components/ui/EmptyState";
import ErrorState from "../../components/ui/ErrorState";
import Modal from "../../components/ui/Modal";
import PageHeader from "../../components/ui/PageHeader";
import SectionCard from "../../components/ui/SectionCard";
import Skeleton, { SkeletonText } from "../../components/ui/Skeleton";
import StatusBadge from "../../components/ui/StatusBadge";
import {
  formatPeriod,
  formatSen,
  type PayrollRecordDetail,
  type PayslipListEntry,
} from "../../types/payroll";
import { cn } from "../../utils/cn";

/** lg, where the list and the payslip sit side by side. */
const SIDE_BY_SIDE = "(min-width: 1024px)";

/**
 * The employee's own payslips.
 *
 * Only approved and paid periods appear: a draft figure is not a payslip, and
 * the server enforces that as well as this page. Every payslip is fetched
 * through the employee's own endpoint, which resolves the employee from the
 * session - nothing here can ask for someone else's.
 *
 * Desktop is list-and-detail, opening on the newest payslip. On a phone the
 * list is the page and a payslip opens as a sheet over it.
 */
export default function EmployeePayslipsPage() {
  const [payslips, setPayslips] = useState<PayslipListEntry[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<PayrollRecordDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [listFailed, setListFailed] = useState(false);
  const [error, setError] = useState("");

  const open = useCallback(async (recordId: string) => {
    setSelectedId(recordId);
    setDetailLoading(true);
    try {
      setDetail(await getMyPayslip(recordId));
    } catch (requestError) {
      setDetail(null);
      setError(getApiErrorMessage(requestError, "Unable to open that payslip."));
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    getMyPayslips()
      .then((list) => {
        setPayslips(list);
        // Open the newest on desktop, where there is a panel waiting for it.
        if (list[0] && window.matchMedia(SIDE_BY_SIDE).matches) void open(list[0].id);
      })
      .catch((requestError) => {
        setListFailed(true);
        setError(getApiErrorMessage(requestError, "Unable to load your payslips."));
      })
      .finally(() => setLoading(false));
  }, [open]);

  function choose(recordId: string) {
    setError("");
    void open(recordId);
    if (!window.matchMedia(SIDE_BY_SIDE).matches) setSheetOpen(true);
  }

  const detailBody = detailLoading ? (
    <div aria-busy="true">
      <p className="sr-only" aria-live="polite">Loading payslip</p>
      <Skeleton className="h-5 w-48" />
      <SkeletonText lines={6} className="mt-5" />
      <Skeleton className="mt-5 h-14 w-full rounded-xl" />
    </div>
  ) : detail ? (
    <PayslipView detail={detail} />
  ) : null;

  return (
    <section className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        title="Payslips"
        description="Your published payslips. Only approved payroll appears here."
      />

      {error && <Alert tone="danger" onDismiss={() => setError("")}>{error}</Alert>}

      {loading ? (
        <SectionCard>
          <div className="space-y-3" aria-busy="true">
            <p className="sr-only" aria-live="polite">Loading your payslips</p>
            {Array.from({ length: 4 }, (_, index) => <Skeleton key={index} className="h-14 w-full rounded-xl" />)}
          </div>
        </SectionCard>
      ) : listFailed ? (
        <SectionCard>
          <ErrorState
            title="Your payslips could not be loaded"
            description="This is a temporary problem reading them, not an absence of pay records."
            onRetry={() => window.location.reload()}
          />
        </SectionCard>
      ) : payslips.length === 0 ? (
        <SectionCard>
          <EmptyState
            icon={Receipt}
            title="No payslips yet"
            description="A payslip appears here once your payroll has been approved."
          />
        </SectionCard>
      ) : (
        <div className="grid items-start gap-6 lg:grid-cols-3">
          <SectionCard className="overflow-hidden" title="Pay periods" icon={Receipt} padded={false}>
            <ul className="divide-y divide-line">
              {payslips.map((payslip) => {
                const isSelected = payslip.id === selectedId;
                return (
                  <li key={payslip.id}>
                    <button
                      type="button"
                      onClick={() => choose(payslip.id)}
                      aria-current={isSelected ? "true" : undefined}
                      className={cn(
                        "flex w-full items-center gap-3 px-5 py-4 text-left transition-colors",
                        "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring",
                        // A rail on the selected period as well as a tint, so
                        // the selection does not rest on colour alone.
                        isSelected
                          ? "bg-primary-soft shadow-[inset_3px_0_0_var(--primary)]"
                          : "hover:bg-surface-muted",
                      )}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold text-fg">
                          {formatPeriod(payslip.period_year, payslip.period_month)}
                        </span>
                        <span className="mt-1 block">
                          <StatusBadge
                            label={payslip.status === "paid" ? "Paid" : "Approved"}
                            tone={payslip.status === "paid" ? "primary" : "success"}
                          />
                        </span>
                      </span>
                      <span className="text-right">
                        <span className="block text-sm font-semibold tabular-nums text-fg">
                          {formatSen(payslip.net_sen)}
                        </span>
                        <span className="block text-xs text-fg-subtle">net, RM</span>
                      </span>
                      <ChevronRight size={16} className="shrink-0 text-fg-subtle lg:hidden" aria-hidden="true" />
                    </button>
                  </li>
                );
              })}
            </ul>
          </SectionCard>

          {/* Desktop detail. Below lg the same content opens in a sheet. */}
          <SectionCard className="hidden lg:col-span-2 lg:block">
            {detailBody ?? (
              <EmptyState icon={Receipt} title="Choose a pay period" description="Its payslip opens here." />
            )}
          </SectionCard>
        </div>
      )}

      <Modal
        isOpen={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title="Payslip"
        size="lg"
      >
        <div className="mt-4">{detailBody}</div>
      </Modal>
    </section>
  );
}
