import {
  Banknote,
  Calculator,
  CircleMinus,
  Eye,
  Lock,
  Plus,
  Trash2,
  Users,
  Wallet,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
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
import Avatar from "../../components/ui/Avatar";
import Button from "../../components/ui/Button";
import Checkbox from "../../components/ui/Checkbox";
import DataTable from "../../components/ui/DataTable";
import EmptyState from "../../components/ui/EmptyState";
import FormField from "../../components/ui/FormField";
import MetricTile from "../../components/ui/MetricTile";
import Modal from "../../components/ui/Modal";
import PageHeader from "../../components/ui/PageHeader";
import PrimaryButton from "../../components/ui/PrimaryButton";
import RecordCard from "../../components/ui/RecordCard";
import SecondaryButton from "../../components/ui/SecondaryButton";
import SectionCard from "../../components/ui/SectionCard";
import SelectInput from "../../components/ui/SelectInput";
import Skeleton from "../../components/ui/Skeleton";
import StatusBadge from "../../components/ui/StatusBadge";
import Stepper, { type Step } from "../../components/ui/Stepper";
import TextInput from "../../components/ui/TextInput";
import {
  formatPeriod,
  formatSen,
  payrollStatuses,
  sumSen,
  type CalculationSummary,
  type PayrollPeriod,
  type PayrollRecord,
  type PayrollRecordDetail,
  type PayrollStatus,
} from "../../types/payroll";
import { formatDateRange, formatDateTime } from "../../utils/datetime";

const statusTone: Record<PayrollStatus, "neutral" | "info" | "warning" | "success" | "primary"> = {
  draft: "neutral", calculated: "info", reviewed: "warning",
  approved: "success", paid: "primary",
};

const statusLabel = (status: PayrollStatus) =>
  status.charAt(0).toUpperCase() + status.slice(1);

/** The single step available from each state, mirroring the server's rules. */
const nextStep: Partial<Record<PayrollStatus, { to: PayrollStatus; label: string }>> = {
  calculated: { to: "reviewed", label: "Mark reviewed" },
  reviewed: { to: "approved", label: "Approve payroll" },
  approved: { to: "paid", label: "Mark paid" },
};

/**
 * The lifecycle, drawn from the same list the server's states come from, so
 * the stepper cannot show a state the period cannot be in.
 */
const LIFECYCLE: Step[] = payrollStatuses.map((status) => ({
  id: status,
  label: statusLabel(status),
}));

const recordHeaders = [
  "Employee",
  <span key="basic" className="block text-right">Basic</span>,
  <span key="gross" className="block text-right">Gross</span>,
  <span key="ded" className="block text-right">Deductions</span>,
  <span key="net" className="block text-right">Net</span>,
  <span key="action" className="sr-only">Action</span>,
];

export default function AdminPayrollPage() {
  const [periods, setPeriods] = useState<PayrollPeriod[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [period, setPeriod] = useState<PayrollPeriod | null>(null);
  const [records, setRecords] = useState<PayrollRecord[]>([]);
  const [summary, setSummary] = useState<CalculationSummary | null>(null);
  const [detail, setDetail] = useState<PayrollRecordDetail | null>(null);

  const [loading, setLoading] = useState(true);
  const [periodLoading, setPeriodLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const [isOpeningPeriod, setIsOpeningPeriod] = useState(false);
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
      setPeriodLoading(true);
      const result = await getPayrollPeriod(selectedId);
      setPeriod(result.period);
      setRecords(result.records);
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, "Unable to load that payroll period."));
    } finally {
      setPeriodLoading(false);
    }
  }, [selectedId]);

  useEffect(() => {
    void loadPeriod();
  }, [loadPeriod]);

  const locked = period?.status === "approved" || period?.status === "paid";

  /*
   * Period totals, summed here from the records this page already holds. In
   * BigInt, because these are money and must be exactly as exact as the rows
   * they add up; nothing new is fetched and nothing is estimated.
   */
  const totals = useMemo(
    () => ({
      gross: sumSen(records.map((record) => record.gross_sen)),
      deductions: sumSen(records.map((record) => record.deductions_sen)),
      net: sumSen(records.map((record) => record.net_sen)),
    }),
    [records],
  );

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

  // A paid period is terminal: every step, including Paid, is done.
  const lifecycleIndex = period
    ? payrollStatuses.indexOf(period.status) + (period.status === "paid" ? 1 : 0)
    : 0;

  const openRecordButton = (record: PayrollRecord) => (
    <Button
      variant="ghost"
      size="sm"
      icon={Eye}
      onClick={() => void openRecord(record.id)}
      aria-label={`Open payroll record for ${record.full_name}`}
      title="Open record"
    />
  );

  return (
    <section className="mx-auto max-w-7xl space-y-6">
      <PageHeader
        title="Payroll"
        description="Open a period, calculate it, then review, approve and pay."
        actions={
          <Button variant="secondary" icon={Plus} onClick={() => setIsOpeningPeriod(true)}>
            Open period
          </Button>
        }
      />

      {error && <Alert tone="danger" onDismiss={() => setError("")}>{error}</Alert>}
      {message && <Alert tone="success" onDismiss={() => setMessage("")}>{message}</Alert>}

      {loading ? (
        <SectionCard>
          <div className="space-y-4" aria-busy="true">
            <span className="sr-only" aria-live="polite">Loading payroll</span>
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-72" />
            <Skeleton className="h-10 w-full" />
          </div>
        </SectionCard>
      ) : periods.length === 0 ? (
        <SectionCard>
          <EmptyState
            icon={Wallet}
            title="No payroll periods yet"
            description="Open the first period to start calculating payroll."
            action={
              <PrimaryButton icon={Plus} onClick={() => setIsOpeningPeriod(true)}>
                Open a period
              </PrimaryButton>
            }
          />
        </SectionCard>
      ) : (
        <SectionCard>
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0 space-y-3">
              <div className="w-full sm:w-72">
                <label htmlFor="payroll-period" className="text-xs font-semibold uppercase tracking-wide text-fg-subtle">
                  Period
                </label>
                <SelectInput
                  id="payroll-period"
                  className="mt-1"
                  value={selectedId}
                  onChange={(event) => { setSelectedId(event.target.value); setSummary(null); }}
                >
                  {periods.map((entry) => (
                    <option key={entry.id} value={entry.id}>
                      {formatPeriod(entry.period_year, entry.period_month)} — {entry.status}
                    </option>
                  ))}
                </SelectInput>
              </div>

              {period && (
                <div>
                  <div className="flex flex-wrap items-center gap-3">
                    <h2 className="text-2xl font-bold tracking-tight text-fg">
                      {formatPeriod(period.period_year, period.period_month)}
                    </h2>
                    <StatusBadge
                      label={statusLabel(period.status)}
                      tone={statusTone[period.status]}
                      icon={locked ? Lock : undefined}
                    />
                  </div>
                  <p className="mt-1 text-sm text-fg-muted">
                    {formatDateRange(period.start_date, period.end_date)} ·{" "}
                    {period.working_days} working days
                  </p>
                  {/* When each step happened, so the state above is never a guess. */}
                  {(period.calculated_at || period.reviewed_at || period.approved_at || period.paid_at) && (
                    <p className="mt-1 text-xs text-fg-subtle">
                      {[
                        period.calculated_at && `Calculated ${formatDateTime(period.calculated_at)}`,
                        period.reviewed_at && `Reviewed ${formatDateTime(period.reviewed_at)}`,
                        period.approved_at && `Approved ${formatDateTime(period.approved_at)}`,
                        period.paid_at && `Paid ${formatDateTime(period.paid_at)}`,
                      ].filter(Boolean).join(" · ")}
                    </p>
                  )}
                </div>
              )}
            </div>

            {period && (
              <div className="flex flex-wrap gap-2 lg:justify-end">
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
            )}
          </div>

          {period && (
            <div className="mt-6 border-t border-line pt-6">
              {/* Where the period is in its lifecycle, and so what the one
                  button above will do. Read-only: moving between states is
                  only ever the single step the server allows. */}
              <Stepper steps={LIFECYCLE} current={lifecycleIndex} />
            </div>
          )}

          <div className="mt-6 space-y-3">
            {locked && (
              <Alert tone="info" title={`This payroll is ${period?.status} and final`}>
                Its figures can no longer be edited. Correct it with a reversal in a
                later period.
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

            <p className="flex gap-2 text-xs text-fg-subtle">
              <CircleMinus size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
              <span>
                Periods are not pro-rated: an employee who joined or changed salary
                mid-month is paid the full monthly amount. HR Nexus calculates no
                statutory contribution; add EPF, SOCSO, EIS or PCB as manual lines.
              </span>
            </p>
          </div>
        </SectionCard>
      )}

      {period && records.length > 0 && (
        <section aria-label="Period totals" className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          <MetricTile
            className="border border-line bg-surface shadow-card"
            label="Employees paid"
            value={records.length}
            icon={Users}
            tone="primary"
          />
          <MetricTile
            className="border border-line bg-surface shadow-card"
            label="Gross, RM"
            value={formatSen(totals.gross)}
            icon={Banknote}
            tone="info"
          />
          <MetricTile
            className="border border-line bg-surface shadow-card"
            label="Deductions, RM"
            value={formatSen(totals.deductions)}
            icon={CircleMinus}
            tone="warning"
          />
          <MetricTile
            className="border border-line bg-surface shadow-card"
            label="Net pay, RM"
            value={formatSen(totals.net)}
            icon={Wallet}
            tone="success"
            emphasis
          />
        </section>
      )}

      {period && (
        <section className="space-y-3">
          <h2 className="flex items-center gap-2 text-base font-semibold text-fg">
            <Banknote size={18} className="text-primary" aria-hidden="true" />
            Employee records
          </h2>

          <DataTable
            headers={recordHeaders}
            caption="Employees included in this payroll period"
            minWidthClass="min-w-200"
            isLoading={periodLoading && records.length === 0}
            loadingLabel="Loading payroll records"
            isEmpty={records.length === 0}
            emptyState={
              <EmptyState
                icon={Calculator}
                title="Nothing calculated yet"
                description={
                  locked
                    ? "This period has no records."
                    : "Calculate this period to produce a record for each paid employee."
                }
              />
            }
            mobileCards={records.map((record) => (
              <RecordCard
                key={record.id}
                leading={<Avatar name={record.full_name} size="md" />}
                title={record.full_name}
                subtitle={record.employee_number}
                badge={
                  <span className="text-sm font-semibold tabular-nums text-fg">
                    RM {formatSen(record.net_sen)}
                  </span>
                }
                meta={[
                  { label: "Gross", value: formatSen(record.gross_sen) },
                  { label: "Deductions", value: formatSen(record.deductions_sen) },
                ]}
                actions={openRecordButton(record)}
              />
            ))}
          >
            {records.map((record) => (
              <tr key={record.id} className="transition-colors hover:bg-surface-muted">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <Avatar name={record.full_name} size="sm" />
                    <div className="min-w-0 max-w-52">
                      <p className="truncate font-medium text-fg" title={record.full_name}>
                        {record.full_name}
                      </p>
                      <p className="mt-0.5 truncate text-xs text-fg-subtle">
                        {record.employee_number}
                        {record.department_name ? ` · ${record.department_name}` : ""}
                      </p>
                    </div>
                  </div>
                </td>
                {/* Right-aligned with tabular figures, so the decimal points
                    line up and the columns can be compared by eye. */}
                <td className="px-4 py-3 text-right tabular-nums text-fg-muted">
                  {formatSen(record.basic_salary_sen)}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-fg-muted">
                  {formatSen(record.gross_sen)}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-fg-muted">
                  {formatSen(record.deductions_sen)}
                </td>
                <td className="px-4 py-3 text-right font-semibold tabular-nums text-fg">
                  {formatSen(record.net_sen)}
                </td>
                <td className="px-2 py-3 text-right">{openRecordButton(record)}</td>
              </tr>
            ))}
          </DataTable>
          <p className="text-xs text-fg-subtle">All amounts in Malaysian ringgit (MYR).</p>
        </section>
      )}

      <Modal
        isOpen={isOpeningPeriod}
        onClose={() => !busy && setIsOpeningPeriod(false)}
        title="Open a payroll period"
        description="A period covers one calendar month. It opens as a draft, ready to calculate."
        icon={<Plus size={22} />}
        size="md"
        isDismissDisabled={busy}
        footer={
          <>
            <SecondaryButton onClick={() => setIsOpeningPeriod(false)} disabled={busy}>
              Cancel
            </SecondaryButton>
            <PrimaryButton
              isLoading={busy}
              loadingLabel="Opening..."
              onClick={() => void run(
                async () => {
                  const created = await createPayrollPeriod(Number(year), Number(month));
                  setSelectedId(created.id);
                  setSummary(null);
                  setIsOpeningPeriod(false);
                },
                "Payroll period opened.",
              )}
            >
              Open period
            </PrimaryButton>
          </>
        }
      >
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
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
          <FormField id="payroll-year" label="Year">
            <TextInput id="payroll-year" type="number" value={year}
              onChange={(event) => setYear(event.target.value)} />
          </FormField>
        </div>
      </Modal>

      <Modal
        isOpen={detail !== null}
        onClose={() => setDetail(null)}
        // Generic on purpose: PayslipView opens with the employee, number and
        // period, so naming them here too printed each one twice.
        title="Payroll record"
        size="lg"
      >
        {detail && (
          <div className="mt-5 space-y-6">
            <PayslipView detail={detail} />

            {locked ? (
              <p className="flex items-center gap-2 text-sm text-fg-muted">
                <Lock size={15} aria-hidden="true" />
                This period is {detail.period.status}; its records are final.
              </p>
            ) : (
              <div className="space-y-6 border-t border-line pt-6">
                <section aria-labelledby="ot-heading" className="space-y-3">
                  <h3 id="ot-heading" className="text-sm font-semibold text-fg">Overtime</h3>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                    <FormField id="ot-hours" label="Overtime hours" hint="Recalculate the period to apply." className="sm:w-56">
                      <TextInput id="ot-hours" value={overtime}
                        onChange={(event) => setOvertime(event.target.value)} placeholder="7.25" />
                    </FormField>
                    <Button
                      variant="secondary"
                      disabled={busy}
                      className="sm:mb-6"
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
                </section>

                <section aria-labelledby="line-heading" className="space-y-3">
                  <h3 id="line-heading" className="text-sm font-semibold text-fg">Add a manual line</h3>
                  <div className="grid gap-4 sm:grid-cols-3">
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
                    <FormField id="item-amount" label="Amount, RM">
                      <TextInput id="item-amount" inputMode="decimal" value={itemAmount}
                        onChange={(event) => setItemAmount(event.target.value)} placeholder="250.00" />
                    </FormField>
                  </div>

                  <Checkbox
                    checked={itemStatutory}
                    onChange={(event) => setItemStatutory(event.target.checked)}
                    label="This is a statutory amount I have calculated myself"
                    description="HR Nexus does not compute EPF, SOCSO, EIS or PCB and makes no compliance claim about the figure you enter."
                  />

                  <div className="flex justify-end">
                    <Button
                      variant="secondary"
                      icon={Plus}
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
                </section>

                {detail.items.some((item) => item.is_manual) && (
                  <section aria-labelledby="manual-heading" className="space-y-2">
                    <h3 id="manual-heading" className="text-sm font-semibold text-fg">Manual lines</h3>
                    <ul className="divide-y divide-line rounded-xl border border-line">
                      {detail.items.filter((item) => item.is_manual).map((item) => (
                        <li key={item.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                          <span className="min-w-0">
                            <span className="block truncate text-fg">{item.label}</span>
                            <span className="text-xs text-fg-subtle">
                              {item.item_type === "earning" ? "Earning" : "Deduction"}
                              {item.is_statutory ? " · statutory, entered manually" : ""}
                            </span>
                          </span>
                          <span className="flex shrink-0 items-center gap-2">
                            <span className="tabular-nums text-fg">
                              {item.item_type === "deduction" ? "−" : ""}
                              {formatSen(item.amount_sen)}
                            </span>
                            <Button
                              variant="danger-ghost"
                              size="sm"
                              icon={Trash2}
                              disabled={busy}
                              aria-label={`Remove ${item.label}`}
                              title="Remove line"
                              onClick={() => void run(
                                async () => {
                                  await deletePayrollItem(detail.record.id, item.id);
                                  await openRecord(detail.record.id);
                                },
                                "Line removed.",
                              )}
                            />
                          </span>
                        </li>
                      ))}
                    </ul>
                  </section>
                )}
              </div>
            )}
          </div>
        )}
      </Modal>
    </section>
  );
}
