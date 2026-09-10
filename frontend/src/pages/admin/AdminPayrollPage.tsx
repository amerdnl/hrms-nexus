import { Banknote, Calculator, Plus, Wallet } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { getApiErrorMessage } from "../../api/axios";
import {
  addPayrollItem,
  calculatePayrollPeriod,
  createPayrollPeriod,
  deletePayrollItem,
  getPayrollPeriod,
  getPayrollPeriods,
  getPayrollRecord,
  setPayrollOvertime,
  setPayrollStatus,
} from "../../api/payrollApi";
import PayslipView from "../../components/payroll/PayslipView";
import Alert from "../../components/ui/Alert";
import Button from "../../components/ui/Button";
import DataTable from "../../components/ui/DataTable";
import EmptyState from "../../components/ui/EmptyState";
import FormField from "../../components/ui/FormField";
import Modal from "../../components/ui/Modal";
import PageHeader from "../../components/ui/PageHeader";
import PrimaryButton from "../../components/ui/PrimaryButton";
import SectionCard from "../../components/ui/SectionCard";
import SelectInput from "../../components/ui/SelectInput";
import StatusBadge from "../../components/ui/StatusBadge";
import TextInput from "../../components/ui/TextInput";
import {
  formatPeriod,
  formatSen,
  type CalculationSummary,
  type PayrollPeriod,
  type PayrollRecord,
  type PayrollRecordDetail,
  type PayrollStatus,
} from "../../types/payroll";

const statusTone: Record<PayrollStatus, "neutral" | "info" | "warning" | "success" | "primary"> = {
  draft: "neutral", calculated: "info", reviewed: "warning",
  approved: "success", paid: "primary",
};

/** The single step available from each state, mirroring the server's rules. */
const nextStep: Partial<Record<PayrollStatus, { to: PayrollStatus; label: string }>> = {
  calculated: { to: "reviewed", label: "Mark reviewed" },
  reviewed: { to: "approved", label: "Approve payroll" },
  approved: { to: "paid", label: "Mark paid" },
};

export default function AdminPayrollPage() {
  const [periods, setPeriods] = useState<PayrollPeriod[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [period, setPeriod] = useState<PayrollPeriod | null>(null);
  const [records, setRecords] = useState<PayrollRecord[]>([]);
  const [summary, setSummary] = useState<CalculationSummary | null>(null);
  const [detail, setDetail] = useState<PayrollRecordDetail | null>(null);

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const now = new Date();
  const [year, setYear] = useState(String(now.getFullYear()));
  const [month, setMonth] = useState(String(now.getMonth() + 1));

  const [itemType, setItemType] = useState<"earning" | "deduction">("deduction");
  const [itemLabel, setItemLabel] = useState("");
  const [itemAmount, setItemAmount] = useState("");
  const [itemStatutory, setItemStatutory] = useState(false);
  const [overtime, setOvertime] = useState("");

  const loadPeriods = useCallback(async () => {
    try {
      setLoading(true);
      const list = await getPayrollPeriods();
      setPeriods(list);
      setSelectedId((current) => current || (list[0]?.id ?? ""));
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, "Unable to load payroll periods."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadPeriods();
  }, [loadPeriods]);

  const loadPeriod = useCallback(async () => {
    if (!selectedId) {
      setPeriod(null);
      setRecords([]);
      return;
    }
    try {
      const result = await getPayrollPeriod(selectedId);
      setPeriod(result.period);
      setRecords(result.records);
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, "Unable to load that payroll period."));
    }
  }, [selectedId]);

  useEffect(() => {
    void loadPeriod();
  }, [loadPeriod]);

  const locked = period?.status === "approved" || period?.status === "paid";

  async function run(action: () => Promise<void>, success: string) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await action();
      setMessage(success);
      await Promise.all([loadPeriods(), loadPeriod()]);
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, "That payroll action could not be completed."));
    } finally {
      setBusy(false);
    }
  }

  async function openRecord(recordId: string) {
    try {
      const result = await getPayrollRecord(recordId);
      setDetail(result);
      setOvertime(result.record.overtime_hours);
      setItemLabel("");
      setItemAmount("");
      setItemStatutory(false);
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, "Unable to open that payroll record."));
    }
  }

  return (
    <section className="mx-auto max-w-7xl space-y-6">
      <PageHeader
        title="Payroll"
        description="Open a period, calculate it, then review, approve and pay."
      />

      {error && <Alert tone="danger" onDismiss={() => setError("")}>{error}</Alert>}
      {message && <Alert tone="success" onDismiss={() => setMessage("")}>{message}</Alert>}

      <SectionCard title="Payroll periods" icon={Wallet}>
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-4">
            <FormField id="payroll-period" label="Period">
              <SelectInput
                id="payroll-period"
                value={selectedId}
                onChange={(event) => { setSelectedId(event.target.value); setSummary(null); }}
              >
                <option value="">Select a period</option>
                {periods.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {formatPeriod(entry.period_year, entry.period_month)} — {entry.status}
                  </option>
                ))}
              </SelectInput>
            </FormField>

            <FormField id="payroll-year" label="New period year">
              <TextInput id="payroll-year" type="number" value={year}
                onChange={(event) => setYear(event.target.value)} />
            </FormField>

            <FormField id="payroll-month" label="Month">
              <SelectInput id="payroll-month" value={month}
                onChange={(event) => setMonth(event.target.value)}>
                {Array.from({ length: 12 }, (_, index) => (
                  <option key={index + 1} value={index + 1}>
                    {formatPeriod(2000, index + 1).split(" ")[0]}
                  </option>
                ))}
              </SelectInput>
            </FormField>

            <div className="flex items-end">
              <Button
                variant="secondary"
                icon={Plus}
                fullWidth
                disabled={busy}
                onClick={() => void run(
                  async () => {
                    const created = await createPayrollPeriod(Number(year), Number(month));
                    setSelectedId(created.id);
                  },
                  "Payroll period opened.",
                )}
              >
                Open period
              </Button>
            </div>
          </div>

          {period && (
            <div className="flex flex-wrap items-center gap-3 rounded-card border border-line bg-surface px-4 py-3">
              <StatusBadge
                label={period.status.charAt(0).toUpperCase() + period.status.slice(1)}
                tone={statusTone[period.status]}
              />
              <span className="text-sm text-fg-muted">
                {period.start_date} to {period.end_date} · {period.working_days} working days
              </span>

              <div className="ml-auto flex flex-wrap gap-2">
                <Button
                  variant="secondary"
                  icon={Calculator}
                  disabled={busy || locked}
                  onClick={() => void run(
                    async () => { setSummary(await calculatePayrollPeriod(period.id)); },
                    "Payroll calculated.",
                  )}
                >
                  {period.status === "draft" ? "Calculate" : "Recalculate"}
                </Button>

                {nextStep[period.status] && (
                  <PrimaryButton
                    disabled={busy}
                    onClick={() => void run(
                      () => setPayrollStatus(period.id, nextStep[period.status]!.to),
                      `Payroll ${nextStep[period.status]!.to}.`,
                    )}
                  >
                    {nextStep[period.status]!.label}
                  </PrimaryButton>
                )}
              </div>
            </div>
          )}

          {locked && (
            <Alert tone="info">
              This payroll is {period?.status} and is now final. Correct it with a
              reversal in a later period rather than editing it.
            </Alert>
          )}

          {summary && summary.skipped.length > 0 && (
            <Alert tone="warning" title="Some employees were not paid">
              <ul className="list-inside list-disc space-y-1">
                {summary.skipped.map((entry) => (
                  <li key={entry.employeeId}>
                    {entry.fullName} ({entry.employeeNumber}) — {entry.reason}
                  </li>
                ))}
              </ul>
            </Alert>
          )}

          <p className="text-xs text-fg-subtle">
            Periods are not pro-rated: an employee who joined or changed salary
            mid-month is paid the full monthly amount. HR Nexus calculates no
            statutory contribution; add EPF, SOCSO, EIS or PCB as manual lines.
          </p>
        </div>
      </SectionCard>

      <SectionCard title="Payroll records" icon={Banknote} padded={false}>
        <DataTable
          headers={["Employee", "Basic", "Gross", "Deductions", "Net", "Action"]}
          caption="Employees included in this payroll period"
          minWidthClass="min-w-200"
          isLoading={loading}
          loadingLabel="Loading payroll..."
          isEmpty={records.length === 0}
          emptyState={
            <EmptyState
              icon={Banknote}
              title="Nothing calculated yet"
              description="Open a period and calculate it to see payroll records."
            />
          }
        >
          {records.map((record) => (
            <tr key={record.id}>
              <td className="px-5 py-4">
                <p className="font-medium text-fg">{record.full_name}</p>
                <p className="mt-0.5 text-xs text-fg-subtle">{record.employee_number}</p>
              </td>
              <td className="px-5 py-4 font-mono text-sm tabular-nums text-fg-muted">
                {formatSen(record.basic_salary_sen)}
              </td>
              <td className="px-5 py-4 font-mono text-sm tabular-nums text-fg-muted">
                {formatSen(record.gross_sen)}
              </td>
              <td className="px-5 py-4 font-mono text-sm tabular-nums text-fg-muted">
                {formatSen(record.deductions_sen)}
              </td>
              <td className="px-5 py-4 font-mono text-sm font-semibold tabular-nums text-fg">
                {formatSen(record.net_sen)}
              </td>
              <td className="px-5 py-4">
                <Button variant="secondary" size="sm" onClick={() => void openRecord(record.id)}>
                  View
                </Button>
              </td>
            </tr>
          ))}
        </DataTable>
      </SectionCard>

      <Modal
        isOpen={detail !== null}
        onClose={() => setDetail(null)}
        title="Payroll record"
        size="lg"
      >
        {detail && (
          <div className="space-y-6">
            <PayslipView detail={detail} />

            {!locked && (
              <div className="space-y-4 border-t border-line pt-4">
                <div className="grid gap-4 sm:grid-cols-3">
                  <FormField id="ot-hours" label="Overtime hours" hint="Recalculate to apply.">
                    <TextInput id="ot-hours" value={overtime}
                      onChange={(event) => setOvertime(event.target.value)} placeholder="7.25" />
                  </FormField>
                  <div className="flex items-end">
                    <Button
                      variant="secondary"
                      fullWidth
                      disabled={busy}
                      onClick={() => void run(
                        async () => {
                          await setPayrollOvertime(detail.record.id, overtime);
                          await openRecord(detail.record.id);
                        },
                        "Overtime saved. Recalculate the period to apply it.",
                      )}
                    >
                      Save overtime
                    </Button>
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-4">
                  <FormField id="item-type" label="Line type">
                    <SelectInput id="item-type" value={itemType}
                      onChange={(event) => setItemType(event.target.value as "earning" | "deduction")}>
                      <option value="deduction">Deduction</option>
                      <option value="earning">Earning</option>
                    </SelectInput>
                  </FormField>
                  <FormField id="item-label" label="Label">
                    <TextInput id="item-label" value={itemLabel}
                      onChange={(event) => setItemLabel(event.target.value)} placeholder="Bonus" />
                  </FormField>
                  <FormField id="item-amount" label="Amount">
                    <TextInput id="item-amount" value={itemAmount}
                      onChange={(event) => setItemAmount(event.target.value)} placeholder="250.00" />
                  </FormField>
                  <div className="flex items-end">
                    <Button
                      variant="secondary"
                      fullWidth
                      disabled={busy}
                      onClick={() => void run(
                        async () => {
                          await addPayrollItem(detail.record.id, {
                            itemType, label: itemLabel, amount: itemAmount,
                            isStatutory: itemStatutory,
                          });
                          await openRecord(detail.record.id);
                        },
                        "Line added.",
                      )}
                    >
                      Add line
                    </Button>
                  </div>
                </div>

                <label className="flex items-start gap-3 text-sm">
                  <input
                    type="checkbox"
                    checked={itemStatutory}
                    onChange={(event) => setItemStatutory(event.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-line-strong accent-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                  />
                  <span className="text-fg">
                    This is a statutory amount I have calculated myself
                    <span className="block text-xs text-fg-muted">
                      HR Nexus does not compute EPF, SOCSO, EIS or PCB and makes no
                      compliance claim about the figure you enter.
                    </span>
                  </span>
                </label>

                <div className="space-y-1">
                  {detail.items.filter((item) => item.is_manual).map((item) => (
                    <div key={item.id} className="flex items-center justify-between gap-3 text-sm">
                      <span className="text-fg-muted">
                        {item.label} — {formatSen(item.amount_sen)}
                      </span>
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={busy}
                        onClick={() => void run(
                          async () => {
                            await deletePayrollItem(detail.record.id, item.id);
                            await openRecord(detail.record.id);
                          },
                          "Line removed.",
                        )}
                      >
                        Remove
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>
    </section>
  );
}
