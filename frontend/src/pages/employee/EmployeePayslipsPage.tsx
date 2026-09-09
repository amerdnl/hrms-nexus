import { Receipt } from "lucide-react";
import { useEffect, useState } from "react";
import { getApiErrorMessage } from "../../api/axios";
import { getMyPayslip, getMyPayslips } from "../../api/payrollApi";
import PayslipView from "../../components/payroll/PayslipView";
import Alert from "../../components/ui/Alert";
import Button from "../../components/ui/Button";
import DataTable from "../../components/ui/DataTable";
import EmptyState from "../../components/ui/EmptyState";
import Modal from "../../components/ui/Modal";
import PageHeader from "../../components/ui/PageHeader";
import SectionCard from "../../components/ui/SectionCard";
import StatusBadge from "../../components/ui/StatusBadge";
import {
  formatPeriod,
  formatSen,
  type PayrollRecordDetail,
  type PayslipListEntry,
} from "../../types/payroll";

/**
 * The employee's own payslips.
 *
 * Only approved and paid periods appear: a draft figure is not a payslip, and
 * the server enforces that as well as this page.
 */
export default function EmployeePayslipsPage() {
  const [payslips, setPayslips] = useState<PayslipListEntry[]>([]);
  const [detail, setDetail] = useState<PayrollRecordDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    getMyPayslips()
      .then(setPayslips)
      .catch((requestError) =>
        setError(getApiErrorMessage(requestError, "Unable to load your payslips.")))
      .finally(() => setLoading(false));
  }, []);

  async function open(recordId: string) {
    try {
      setDetail(await getMyPayslip(recordId));
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, "Unable to open that payslip."));
    }
  }

  return (
    <section className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        title="Payslips"
        description="Your published payslips. Only approved payroll appears here."
      />

      {error && <Alert tone="danger" onDismiss={() => setError("")}>{error}</Alert>}

      <SectionCard title="Payslip history" icon={Receipt} padded={false}>
        <DataTable
          headers={["Period", "Status", "Gross", "Deductions", "Net", "Action"]}
          caption="Your published payslips"
          minWidthClass="min-w-200"
          isLoading={loading}
          loadingLabel="Loading payslips..."
          isEmpty={payslips.length === 0}
          emptyState={
            <EmptyState
              icon={Receipt}
              title="No payslips yet"
              description="A payslip appears here once your payroll has been approved."
            />
          }
        >
          {payslips.map((payslip) => (
            <tr key={payslip.id}>
              <td className="px-5 py-4 font-medium text-fg">
                {formatPeriod(payslip.period_year, payslip.period_month)}
              </td>
              <td className="px-5 py-4">
                <StatusBadge
                  label={payslip.status === "paid" ? "Paid" : "Approved"}
                  tone={payslip.status === "paid" ? "primary" : "success"}
                />
              </td>
              <td className="px-5 py-4 font-mono text-sm tabular-nums text-fg-muted">
                {formatSen(payslip.gross_sen)}
              </td>
              <td className="px-5 py-4 font-mono text-sm tabular-nums text-fg-muted">
                {formatSen(payslip.deductions_sen)}
              </td>
              <td className="px-5 py-4 font-mono text-sm font-semibold tabular-nums text-fg">
                {formatSen(payslip.net_sen)}
              </td>
              <td className="px-5 py-4">
                <Button variant="secondary" size="sm" onClick={() => void open(payslip.id)}>
                  View
                </Button>
              </td>
            </tr>
          ))}
        </DataTable>
      </SectionCard>

      <Modal isOpen={detail !== null} onClose={() => setDetail(null)} title="Payslip" size="lg">
        {detail && <PayslipView detail={detail} />}
      </Modal>
    </section>
  );
}
