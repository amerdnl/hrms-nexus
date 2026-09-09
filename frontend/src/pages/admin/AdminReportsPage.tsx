import {
  BarChart3,
  CalendarDays,
  Clock3,
  Download,
  Users,
  Wallet,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { getApiErrorMessage } from "../../api/axios";
import { getDepartments } from "../../api/departmentApi";
import { getPayrollPeriods } from "../../api/payrollApi";
import {
  downloadReport,
  getAttendanceReport,
  getLeaveReport,
  getPayrollReport,
  getWorkforceReport,
  readBlobErrorMessage,
  type ReportFilters,
} from "../../api/reportsApi";
import Alert from "../../components/ui/Alert";
import Button from "../../components/ui/Button";
import DataTable from "../../components/ui/DataTable";
import EmptyState from "../../components/ui/EmptyState";
import FilterPanel from "../../components/ui/FilterPanel";
import FormField from "../../components/ui/FormField";
import PageHeader from "../../components/ui/PageHeader";
import SectionCard from "../../components/ui/SectionCard";
import SelectInput from "../../components/ui/SelectInput";
import StatCard from "../../components/ui/StatCard";
import StatusBadge from "../../components/ui/StatusBadge";
import Tabs from "../../components/ui/Tabs";
import TextInput from "../../components/ui/TextInput";
import { formatPeriod, formatSen, type PayrollPeriod } from "../../types/payroll";
import { leaveStatusMeta } from "../../utils/status";
import {
  formatMinutes,
  type AttendanceReport,
  type LeaveReport,
  type PayrollReport,
  type WorkforceReport,
} from "../../types/reports";

type TabId = "workforce" | "attendance" | "leave" | "payroll";

/** Mirrors the payroll page, so a period reads the same wherever it appears. */
const payrollStatusTone: Record<string, "neutral" | "info" | "warning" | "success" | "primary"> = {
  draft: "neutral", calculated: "info", reviewed: "warning",
  approved: "success", paid: "primary",
};

const tabs = [
  { id: "workforce", label: "Workforce" },
  { id: "attendance", label: "Attendance" },
  { id: "leave", label: "Leave" },
  { id: "payroll", label: "Payroll" },
];

interface Department {
  id: number;
  name: string;
}

export default function AdminReportsPage() {
  const [active, setActive] = useState<TabId>("workforce");

  const [departments, setDepartments] = useState<Department[]>([]);
  const [periods, setPeriods] = useState<PayrollPeriod[]>([]);

  const [departmentId, setDepartmentId] = useState<string>("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [leaveType, setLeaveType] = useState("");
  const [leaveStatus, setLeaveStatus] = useState("");
  const [periodId, setPeriodId] = useState("");

  const [workforce, setWorkforce] = useState<WorkforceReport | null>(null);
  const [attendance, setAttendance] = useState<AttendanceReport | null>(null);
  const [leave, setLeave] = useState<LeaveReport | null>(null);
  const [payroll, setPayroll] = useState<PayrollReport | null>(null);

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  /**
   * Draft filters live in the inputs above; these are the ones a report was
   * actually run with. Keeping them apart is what makes "Apply filters" mean
   * something, and it keeps the loader's dependencies honest: deriving the
   * filter object on every render and then memoising the loader without it
   * would capture the first render's values and quietly send those forever.
   */
  const [applied, setApplied] = useState<ReportFilters>({});

  const draft: ReportFilters = {
    from: from || undefined,
    to: to || undefined,
    departmentId: departmentId ? Number(departmentId) : null,
    leaveType: leaveType || null,
    status: leaveStatus || null,
  };

  useEffect(() => {
    void (async () => {
      try {
        const [departmentList, periodList] = await Promise.all([
          getDepartments(),
          getPayrollPeriods(),
        ]);
        setDepartments(departmentList.map((item) => ({ id: item.id, name: item.name })));
        setPeriods(periodList);
        if (periodList.length > 0) setPeriodId(periodList[0].id);
      } catch (requestError) {
        setError(getApiErrorMessage(requestError, "Unable to load report filters."));
      }
    })();
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      if (active === "workforce") setWorkforce(await getWorkforceReport());
      if (active === "attendance") setAttendance(await getAttendanceReport(applied));
      if (active === "leave") setLeave(await getLeaveReport(applied));
      if (active === "payroll") {
        setPayroll(periodId ? await getPayrollReport(periodId, applied) : null);
      }
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, "Unable to load this report."));
      // Clear what the failed tab was showing. Leaving the previous run's rows
      // on screen next to an error means the figures no longer correspond to
      // the filters in the form, which is worse than showing nothing.
      if (active === "workforce") setWorkforce(null);
      if (active === "attendance") setAttendance(null);
      if (active === "leave") setLeave(null);
      if (active === "payroll") setPayroll(null);
    } finally {
      setLoading(false);
    }
  }, [active, periodId, applied]);

  useEffect(() => {
    void load();
  }, [load]);

  /** Commits the draft, which re-runs the report through the effect above. */
  const applyFilters = () => setApplied(draft);

  /**
   * A refused request must never be presented as an empty result. "No leave in
   * this range" is a claim about the data; if the query was rejected we do not
   * know what the data holds, and saying so is simply wrong.
   */
  const failed = error !== "";
  const emptyFor = (title: string, description: string) =>
    failed
      ? { title: "This report could not be run", description: "Adjust the filters above and apply again." }
      : { title, description };

  async function exportCsv(path: string) {
    setBusy(true);
    setError("");
    try {
      await downloadReport(path, applied);
    } catch (requestError) {
      setError(await readBlobErrorMessage(requestError, "Unable to export this report."));
    } finally {
      setBusy(false);
    }
  }

  const exportButton = (path: string, label = "Export CSV") => (
    <Button variant="secondary" icon={Download} disabled={busy} onClick={() => void exportCsv(path)}>
      {label}
    </Button>
  );

  const departmentField = (
    <FormField id="report-department" label="Department">
      <SelectInput
        id="report-department"
        value={departmentId}
        onChange={(event) => setDepartmentId(event.target.value)}
      >
        <option value="">All departments</option>
        {departments.map((department) => (
          <option key={department.id} value={department.id}>{department.name}</option>
        ))}
      </SelectInput>
    </FormField>
  );

  const dateFields = (
    <>
      <FormField id="report-from" label="From" hint="Defaults to the start of this month.">
        <TextInput
          id="report-from" type="date" value={from}
          onChange={(event) => setFrom(event.target.value)}
        />
      </FormField>
      <FormField id="report-to" label="To">
        <TextInput
          id="report-to" type="date" value={to}
          onChange={(event) => setTo(event.target.value)}
        />
      </FormField>
    </>
  );

  return (
    <section className="mx-auto max-w-7xl space-y-6">
      <PageHeader
        title="Reports"
        description="Company-wide workforce, attendance, leave and payroll reporting."
      />

      {error && <Alert tone="danger">{error}</Alert>}

      <Tabs tabs={tabs} active={active} onChange={(id) => setActive(id as TabId)} />

      <div role="tabpanel" id={`panel-${active}`} aria-labelledby={`tab-${active}`} className="space-y-6">
        {/* ------------------------------------------------------ workforce */}
        {active === "workforce" && (
          <>
            <div className="grid gap-4 sm:grid-cols-3">
              <StatCard
                label="Employees" icon={Users} isLoading={loading}
                value={workforce?.totals.employees ?? 0}
              />
              <StatCard
                label="Active" icon={Users} tone="success" isLoading={loading}
                value={workforce?.totals.active ?? 0}
              />
              <StatCard
                label="Departments" icon={BarChart3} isLoading={loading}
                value={workforce?.totals.departments ?? 0}
              />
            </div>

            <SectionCard
              title="Headcount by department"
              padded={false}
              actions={exportButton("/reports/workforce/export")}
            >
              <DataTable
                headers={["Department", "Headcount", "Active", "Probation", "Inactive", "Resigned", "Terminated"]}
                isLoading={loading}
                isEmpty={!loading && (workforce?.byDepartment.length ?? 0) === 0}
                caption="Headcount for each department by employment status"
                emptyState={
                  <EmptyState
                    icon={Users}
                    title="No departments yet"
                    description="Create a department and assign employees to see headcount here."
                  />
                }
              >
                {workforce?.byDepartment.map((row) => (
                  <tr key={row.department_id ?? "unassigned"} className="border-t border-line">
                    <td className="px-4 py-3 text-sm font-medium text-fg">{row.department_name}</td>
                    <td className="px-4 py-3 text-sm tabular-nums text-fg">{row.headcount}</td>
                    <td className="px-4 py-3 text-sm tabular-nums text-fg-muted">{row.active}</td>
                    <td className="px-4 py-3 text-sm tabular-nums text-fg-muted">{row.probation}</td>
                    <td className="px-4 py-3 text-sm tabular-nums text-fg-muted">{row.inactive}</td>
                    <td className="px-4 py-3 text-sm tabular-nums text-fg-muted">{row.resigned}</td>
                    <td className="px-4 py-3 text-sm tabular-nums text-fg-muted">{row.terminated}</td>
                  </tr>
                ))}
              </DataTable>
            </SectionCard>
          </>
        )}

        {/* ----------------------------------------------------- attendance */}
        {active === "attendance" && (
          <>
            <FilterPanel columns={3} onApply={applyFilters} isBusy={loading}>
              {dateFields}
              {departmentField}
            </FilterPanel>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard label="Days recorded" icon={Clock3} isLoading={loading}
                value={attendance?.totals.days_recorded ?? 0} />
              <StatCard label="Late arrivals" icon={Clock3} tone="warning" isLoading={loading}
                value={attendance?.totals.late ?? 0}
                hint={attendance ? formatMinutes(attendance.totals.late_minutes) + " total" : undefined} />
              <StatCard label="Absent" icon={Clock3} tone="danger" isLoading={loading}
                value={attendance?.totals.absent ?? 0} />
              <StatCard label="Missing checkout" icon={Clock3} tone="info" isLoading={loading}
                value={attendance?.totals.missing_checkout ?? 0} />
            </div>

            <SectionCard
              title="Attendance by employee"
              description={
                attendance ? `${attendance.range.from} to ${attendance.range.to}` : undefined
              }
              padded={false}
              actions={exportButton("/reports/attendance/export")}
            >
              <DataTable
                headers={["Employee", "Department", "Recorded", "Present", "Late", "Absent", "On leave", "Late time", "No checkout"]}
                isLoading={loading}
                isEmpty={!loading && (attendance?.rows.length ?? 0) === 0}
                caption="Attendance totals for each employee over the selected range"
                minWidthClass="min-w-200"
                emptyState={
                  <EmptyState
                    icon={Clock3}
                    {...emptyFor(
                      "No employees match this filter",
                      "Widen the date range or choose a different department.",
                    )}
                  />
                }
              >
                {attendance?.rows.map((row) => (
                  <tr key={row.employee_id} className="border-t border-line">
                    <td className="px-4 py-3 text-sm">
                      <span className="font-medium text-fg">{row.full_name}</span>
                      <span className="block text-xs text-fg-subtle">{row.employee_number}</span>
                    </td>
                    <td className="px-4 py-3 text-sm text-fg-muted">{row.department_name}</td>
                    <td className="px-4 py-3 text-sm tabular-nums text-fg">{row.days_recorded}</td>
                    <td className="px-4 py-3 text-sm tabular-nums text-fg-muted">{row.present}</td>
                    <td className="px-4 py-3 text-sm tabular-nums text-fg-muted">{row.late}</td>
                    <td className="px-4 py-3 text-sm tabular-nums text-fg-muted">{row.absent}</td>
                    <td className="px-4 py-3 text-sm tabular-nums text-fg-muted">{row.on_leave}</td>
                    <td className="px-4 py-3 text-sm tabular-nums text-fg-muted">
                      {formatMinutes(row.late_minutes)}
                    </td>
                    <td className="px-4 py-3 text-sm tabular-nums text-fg-muted">{row.missing_checkout}</td>
                  </tr>
                ))}
              </DataTable>
            </SectionCard>
          </>
        )}

        {/* ---------------------------------------------------------- leave */}
        {active === "leave" && (
          <>
            <FilterPanel columns={4} onApply={applyFilters} isBusy={loading}>
              {dateFields}
              {departmentField}
              <FormField id="report-leave-type" label="Leave type">
                <SelectInput
                  id="report-leave-type" value={leaveType}
                  onChange={(event) => setLeaveType(event.target.value)}
                >
                  <option value="">All types</option>
                  <option value="annual">Annual</option>
                  <option value="medical">Medical</option>
                  <option value="emergency">Emergency</option>
                  <option value="unpaid">Unpaid</option>
                </SelectInput>
              </FormField>
              <FormField id="report-leave-status" label="Status">
                <SelectInput
                  id="report-leave-status" value={leaveStatus}
                  onChange={(event) => setLeaveStatus(event.target.value)}
                >
                  <option value="">All statuses</option>
                  <option value="pending">Pending</option>
                  <option value="approved">Approved</option>
                  <option value="rejected">Rejected</option>
                  <option value="cancelled">Cancelled</option>
                </SelectInput>
              </FormField>
            </FilterPanel>

            <div className="grid gap-4 sm:grid-cols-3">
              <StatCard label="Requests" icon={CalendarDays} isLoading={loading}
                value={leave?.totals.requests ?? 0} />
              <StatCard label="Approved days" icon={CalendarDays} tone="success" isLoading={loading}
                value={leave?.totals.approved_days ?? 0} />
              <StatCard label="Pending days" icon={CalendarDays} tone="warning" isLoading={loading}
                value={leave?.totals.pending_days ?? 0} />
            </div>

            <SectionCard
              title="Leave requests"
              description={
                leave
                  ? `${leave.range.from} to ${leave.range.to}. A request overlapping the range is counted in full, not split at the boundary.`
                  : undefined
              }
              padded={false}
              actions={exportButton("/reports/leave/export")}
            >
              <DataTable
                headers={["Employee", "Department", "Type", "Status", "Dates", "Working days"]}
                isLoading={loading}
                isEmpty={!loading && (leave?.rows.length ?? 0) === 0}
                caption="Leave requests overlapping the selected range"
                emptyState={
                  <EmptyState
                    icon={CalendarDays}
                    {...emptyFor(
                      "No leave in this range",
                      "No request overlaps the selected dates and filters.",
                    )}
                  />
                }
              >
                {leave?.rows.map((row) => (
                  <tr key={row.id} className="border-t border-line">
                    <td className="px-4 py-3 text-sm">
                      <span className="font-medium text-fg">{row.full_name}</span>
                      <span className="block text-xs text-fg-subtle">{row.employee_number}</span>
                    </td>
                    <td className="px-4 py-3 text-sm text-fg-muted">{row.department_name}</td>
                    <td className="px-4 py-3 text-sm capitalize text-fg-muted">{row.leave_type}</td>
                    <td className="px-4 py-3 text-sm">
                      <StatusBadge {...leaveStatusMeta(row.status)} />
                    </td>
                    <td className="px-4 py-3 text-sm text-fg-muted">
                      {row.start_date} to {row.end_date}
                    </td>
                    <td className="px-4 py-3 text-sm tabular-nums text-fg">{row.working_days}</td>
                  </tr>
                ))}
              </DataTable>
            </SectionCard>

            <SectionCard
              title={leave ? `Leave balances for ${leave.leaveYear}` : "Leave balances"}
              description="Balances are a position for the leave year, not a total for the date range above."
              padded={false}
              actions={exportButton("/reports/leave/balances/export", "Export balances")}
            >
              <DataTable
                headers={["Employee", "Department", "Type", "Entitled", "Used", "Pending", "Remaining", "Available"]}
                isLoading={loading}
                isEmpty={!loading && (leave?.balances.length ?? 0) === 0}
                caption="Leave balance for each employee and leave type"
                minWidthClass="min-w-200"
                emptyState={
                  <EmptyState
                    icon={CalendarDays}
                    {...emptyFor(
                      "No balances to show",
                      "No active employee matches this department filter.",
                    )}
                  />
                }
              >
                {leave?.balances.flatMap((employee) =>
                  employee.balances.map((balance) => (
                    <tr key={`${employee.employee_id}-${balance.leaveType}`} className="border-t border-line">
                      <td className="px-4 py-3 text-sm">
                        <span className="font-medium text-fg">{employee.full_name}</span>
                        <span className="block text-xs text-fg-subtle">{employee.employee_number}</span>
                      </td>
                      <td className="px-4 py-3 text-sm text-fg-muted">{employee.department_name}</td>
                      <td className="px-4 py-3 text-sm capitalize text-fg-muted">{balance.leaveType}</td>
                      <td className="px-4 py-3 text-sm tabular-nums text-fg">{balance.entitledDays}</td>
                      <td className="px-4 py-3 text-sm tabular-nums text-fg-muted">{balance.usedDays}</td>
                      <td className="px-4 py-3 text-sm tabular-nums text-fg-muted">{balance.pendingDays}</td>
                      <td className="px-4 py-3 text-sm tabular-nums text-fg">{balance.remainingDays}</td>
                      <td className="px-4 py-3 text-sm tabular-nums text-fg">{balance.availableDays}</td>
                    </tr>
                  )),
                )}
              </DataTable>
            </SectionCard>
          </>
        )}

        {/* -------------------------------------------------------- payroll */}
        {active === "payroll" && (
          <>
            <FilterPanel columns={2} onApply={applyFilters} isBusy={loading}>
              <FormField id="report-period" label="Payroll period">
                <SelectInput
                  id="report-period" value={periodId}
                  onChange={(event) => setPeriodId(event.target.value)}
                >
                  {periods.length === 0 && <option value="">No periods yet</option>}
                  {periods.map((period) => (
                    <option key={period.id} value={period.id}>
                      {formatPeriod(period.period_year, period.period_month)}
                    </option>
                  ))}
                </SelectInput>
              </FormField>
              {departmentField}
            </FilterPanel>

            {periods.length === 0 ? (
              <SectionCard>
                <EmptyState
                  icon={Wallet}
                  title="No payroll periods yet"
                  description="Open and calculate a payroll period before running a payroll report."
                />
              </SectionCard>
            ) : (
              <>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <StatCard label="Employees paid" icon={Users} isLoading={loading}
                    value={payroll?.totals.employees ?? 0} />
                  <StatCard label="Gross" icon={Wallet} isLoading={loading}
                    value={formatSen(payroll?.totals.gross_sen ?? 0)} />
                  <StatCard label="Deductions" icon={Wallet} tone="warning" isLoading={loading}
                    value={formatSen(payroll?.totals.deductions_sen ?? 0)} />
                  <StatCard label="Net payroll" icon={Wallet} tone="success" isLoading={loading}
                    value={formatSen(payroll?.totals.net_sen ?? 0)} />
                </div>

                {payroll?.period && (
                  <p className="text-sm text-fg-muted">
                    {formatPeriod(payroll.period.period_year, payroll.period.period_month)} is{" "}
                    <StatusBadge
                      label={
                        payroll.period.status.charAt(0).toUpperCase() +
                        payroll.period.status.slice(1)
                      }
                      tone={payrollStatusTone[payroll.period.status] ?? "neutral"}
                    />{" "}
                    with {payroll.period.working_days} working days.
                  </p>
                )}

                <SectionCard title="Earnings and deductions" padded={false}>
                  <DataTable
                    headers={["Type", "Line", "Employees", "Total"]}
                    isLoading={loading}
                    isEmpty={!loading && (payroll?.byItem.length ?? 0) === 0}
                    caption="Every earning and deduction line across the period"
                    emptyState={
                      <EmptyState
                        icon={Wallet}
                        title="Nothing calculated yet"
                        description="Calculate this payroll period to see its earnings and deductions."
                      />
                    }
                  >
                    {payroll?.byItem.map((item) => (
                      <tr key={`${item.item_type}-${item.code}-${item.label}`} className="border-t border-line">
                        <td className="px-4 py-3 text-sm capitalize text-fg-muted">{item.item_type}</td>
                        <td className="px-4 py-3 text-sm font-medium text-fg">
                          {item.label}
                          {item.is_statutory && (
                            <span className="ml-2 text-xs text-fg-subtle">(entered manually)</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm tabular-nums text-fg-muted">{item.lines}</td>
                        <td className="px-4 py-3 text-right font-mono text-sm tabular-nums text-fg">
                          {formatSen(item.amount_sen)}
                        </td>
                      </tr>
                    ))}
                  </DataTable>
                </SectionCard>

                <SectionCard
                  title="Payroll by employee"
                  padded={false}
                  actions={exportButton(`/reports/payroll/${periodId}/export`)}
                >
                  <DataTable
                    headers={["Employee", "Department", "Basic", "Allowances", "Gross", "Deductions", "Net"]}
                    isLoading={loading}
                    isEmpty={!loading && (payroll?.rows.length ?? 0) === 0}
                    caption="Gross, deductions and net pay for each employee in the period"
                    minWidthClass="min-w-200"
                    emptyState={
                      <EmptyState
                        icon={Wallet}
                        title="No payroll records"
                        description="Calculate this period, or choose a different department."
                      />
                    }
                  >
                    {payroll?.rows.map((row) => (
                      <tr key={row.record_id} className="border-t border-line">
                        <td className="px-4 py-3 text-sm">
                          <span className="font-medium text-fg">{row.full_name}</span>
                          <span className="block text-xs text-fg-subtle">{row.employee_number}</span>
                        </td>
                        <td className="px-4 py-3 text-sm text-fg-muted">{row.department_name}</td>
                        <td className="px-4 py-3 text-right font-mono text-sm tabular-nums text-fg-muted">
                          {formatSen(row.basic_salary_sen)}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-sm tabular-nums text-fg-muted">
                          {formatSen(row.allowance_sen)}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-sm tabular-nums text-fg">
                          {formatSen(row.gross_sen)}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-sm tabular-nums text-fg-muted">
                          {formatSen(row.deductions_sen)}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-sm font-semibold tabular-nums text-fg">
                          {formatSen(row.net_sen)}
                        </td>
                      </tr>
                    ))}
                  </DataTable>
                </SectionCard>
              </>
            )}
          </>
        )}
      </div>

      <p className="text-xs text-fg-subtle">
        Reports read existing records only. Lateness uses the minutes recorded when each
        employee clocked in, and leave days use the working days recorded when each request
        was submitted, so a report always agrees with the record it came from. HR Nexus does
        not compute EPF, SOCSO, EIS or PCB, and makes no statutory compliance claim.
      </p>
    </section>
  );
}
