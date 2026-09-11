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
import Avatar from "../../components/ui/Avatar";
import BarList from "../../components/ui/BarList";
import Button from "../../components/ui/Button";
import DataTable from "../../components/ui/DataTable";
import EmptyState from "../../components/ui/EmptyState";
import FilterPanel from "../../components/ui/FilterPanel";
import FormField from "../../components/ui/FormField";
import MetricTile from "../../components/ui/MetricTile";
import PageHeader from "../../components/ui/PageHeader";
import RecordCard from "../../components/ui/RecordCard";
import SectionCard from "../../components/ui/SectionCard";
import SegmentedBar, { type BarSegment } from "../../components/ui/SegmentedBar";
import SelectInput from "../../components/ui/SelectInput";
import { SkeletonText } from "../../components/ui/Skeleton";
import StatusBadge from "../../components/ui/StatusBadge";
import Tabs from "../../components/ui/Tabs";
import TextInput from "../../components/ui/TextInput";
import { formatPeriod, formatSen, type PayrollPeriod } from "../../types/payroll";
import { formatDateRange } from "../../utils/datetime";
import {
  attendanceStatusMeta,
  employmentStatusMeta,
  leaveStatusMeta,
  leaveTypeMeta,
} from "../../utils/status";
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

  // Relative magnitudes only: a bar's length needs a number, and at these
  // sizes Number(bigint) is exact enough to draw. Every figure that is PRINTED
  // still goes through formatSen on the original value.
  const senToNumber = (value: string | number) => Number(String(value).trim()) || 0;

  const cell = "px-4 py-3 text-sm";
  const num = `${cell} text-right tabular-nums`;
  const right = (label: string) => <span className="block text-right">{label}</span>;

  const workforceStatus: BarSegment[] = (workforce?.byStatus ?? []).map((entry) => {
    const meta = employmentStatusMeta(entry.employment_status);
    return { key: entry.employment_status, label: meta.label, value: entry.count, tone: meta.tone, icon: meta.icon };
  });

  const attendanceSegments: BarSegment[] = attendance
    ? [
        { key: "present", value: attendance.totals.present, ...attendanceStatusMeta("present") },
        { key: "late", value: attendance.totals.late, ...attendanceStatusMeta("late") },
        { key: "on_leave", value: attendance.totals.on_leave, ...attendanceStatusMeta("on_leave") },
        { key: "absent", value: attendance.totals.absent, ...attendanceStatusMeta("absent") },
      ]
    : [];

  // Approved days per leave type, from the report's own by_type breakdown.
  const approvedByType = (["annual", "medical", "emergency", "unpaid"] as const).map((type) => {
    const days = (leave?.totals.by_type ?? [])
      .filter((entry) => entry.leave_type === type && entry.status === "approved")
      .reduce((sum, entry) => sum + Number(entry.days), 0);
    const meta = leaveTypeMeta(type);
    return { key: type, label: meta.label, value: days, display: `${days} days`, tone: meta.tone };
  });

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
            <div className="grid gap-6 lg:grid-cols-5">
              <SectionCard className="lg:col-span-2" title="Workforce" icon={Users}>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-1">
                  <MetricTile label="Employees" value={loading ? "—" : workforce?.totals.employees ?? 0} icon={Users} tone="primary" />
                  <MetricTile label="Active" value={loading ? "—" : workforce?.totals.active ?? 0} icon={Users} tone="success" />
                  <MetricTile label="Departments" value={loading ? "—" : workforce?.totals.departments ?? 0} icon={BarChart3} tone="info" />
                </div>
              </SectionCard>

              <SectionCard className="lg:col-span-3" title="Employees by department" icon={BarChart3}>
                {loading ? (
                  <SkeletonText lines={6} />
                ) : (workforce?.byDepartment.length ?? 0) === 0 ? (
                  <EmptyState icon={Users} title="No departments yet" description="Assign employees to departments to see headcount here." />
                ) : (
                  <BarList
                    title="Headcount for each department"
                    items={workforce!.byDepartment.map((row) => ({
                      key: String(row.department_id ?? "unassigned"),
                      label: row.department_name,
                      hint: `${row.active} active`,
                      value: row.headcount,
                    }))}
                  />
                )}
              </SectionCard>
            </div>

            {workforceStatus.length > 0 && !loading && (
              <SectionCard title="By employment status" icon={Users}>
                <SegmentedBar title="Employees by employment status" unit="employees" segments={workforceStatus} />
              </SectionCard>
            )}

            <SectionCard
              title="Headcount by department"
              padded={false}
              actions={exportButton("/reports/workforce/export")}
            >
              <DataTable
                plain
                headers={["Department", right("Headcount"), right("Active"), right("Probation"), right("Inactive"), right("Resigned"), right("Terminated")]}
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
                mobileCards={workforce?.byDepartment.map((row) => (
                  <RecordCard
                    key={row.department_id ?? "unassigned"}
                    title={row.department_name}
                    badge={<span className="text-sm font-semibold tabular-nums text-fg">{row.headcount}</span>}
                    meta={[
                      { label: "Active", value: row.active },
                      { label: "Probation", value: row.probation },
                      { label: "Inactive", value: row.inactive },
                      { label: "Left", value: row.resigned + row.terminated },
                    ]}
                  />
                ))}
              >
                {workforce?.byDepartment.map((row) => (
                  <tr key={row.department_id ?? "unassigned"}>
                    <td className={`${cell} font-medium text-fg`}>{row.department_name}</td>
                    <td className={`${num} font-semibold text-fg`}>{row.headcount}</td>
                    <td className={`${num} text-fg-muted`}>{row.active}</td>
                    <td className={`${num} text-fg-muted`}>{row.probation}</td>
                    <td className={`${num} text-fg-muted`}>{row.inactive}</td>
                    <td className={`${num} text-fg-muted`}>{row.resigned}</td>
                    <td className={`${num} text-fg-muted`}>{row.terminated}</td>
                  </tr>
                ))}
              </DataTable>
            </SectionCard>
          </>
        )}

        {/* ----------------------------------------------------- attendance */}
        {active === "attendance" && (
          <>
            <FilterPanel title="Report filters" columns={3} onApply={applyFilters} isBusy={loading}>
              {dateFields}
              {departmentField}
            </FilterPanel>

            <SectionCard
              title="Summary"
              description={attendance ? formatDateRange(attendance.range.from, attendance.range.to) : undefined}
              icon={Clock3}
            >
              <div className="grid gap-6 lg:grid-cols-2">
                <div className="grid grid-cols-2 gap-3">
                  <MetricTile label="Days recorded" value={loading ? "—" : attendance?.totals.days_recorded ?? 0} icon={Clock3} tone="primary" />
                  <MetricTile
                    label="Late arrivals" value={loading ? "—" : attendance?.totals.late ?? 0} icon={Clock3} tone="warning"
                    hint={attendance && !loading ? `${formatMinutes(attendance.totals.late_minutes)} late in total` : undefined}
                  />
                  <MetricTile label="Absent" value={loading ? "—" : attendance?.totals.absent ?? 0} icon={Clock3} tone="danger" />
                  <MetricTile label="No checkout" value={loading ? "—" : attendance?.totals.missing_checkout ?? 0} icon={Clock3} tone="info" />
                </div>
                {loading ? (
                  <SkeletonText lines={5} />
                ) : attendance && attendance.totals.days_recorded > 0 ? (
                  <SegmentedBar title="Recorded days by status" unit="days recorded" segments={attendanceSegments} />
                ) : (
                  <EmptyState
                    icon={Clock3}
                    {...emptyFor("No attendance in this range", "Widen the date range or choose a different department.")}
                    className="py-6"
                  />
                )}
              </div>
            </SectionCard>

            <SectionCard
              title="Attendance by employee"
              padded={false}
              actions={exportButton("/reports/attendance/export")}
            >
              <DataTable
                plain
                headers={["Employee", "Department", right("Recorded"), right("Present"), right("Late"), right("Absent"), right("On leave"), right("Late time"), right("No checkout")]}
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
                mobileCards={attendance?.rows.map((row) => (
                  <RecordCard
                    key={row.employee_id}
                    leading={<Avatar name={row.full_name} size="md" />}
                    title={row.full_name}
                    subtitle={`${row.employee_number} · ${row.department_name}`}
                    badge={<span className="text-sm font-semibold tabular-nums text-fg">{row.days_recorded} days</span>}
                    meta={[
                      { label: "Present", value: row.present },
                      { label: "Late", value: `${row.late} · ${formatMinutes(row.late_minutes)}` },
                      { label: "Absent", value: row.absent },
                      { label: "No checkout", value: row.missing_checkout },
                    ]}
                  />
                ))}
              >
                {attendance?.rows.map((row) => (
                  <tr key={row.employee_id}>
                    <td className={cell}>
                      <span className="font-medium text-fg">{row.full_name}</span>
                      <span className="block text-xs text-fg-subtle">{row.employee_number}</span>
                    </td>
                    <td className={`${cell} text-fg-muted`}>{row.department_name}</td>
                    <td className={`${num} font-semibold text-fg`}>{row.days_recorded}</td>
                    <td className={`${num} text-fg-muted`}>{row.present}</td>
                    <td className={`${num} text-fg-muted`}>{row.late}</td>
                    <td className={`${num} text-fg-muted`}>{row.absent}</td>
                    <td className={`${num} text-fg-muted`}>{row.on_leave}</td>
                    <td className={`${num} text-fg-muted`}>{formatMinutes(row.late_minutes)}</td>
                    <td className={`${num} text-fg-muted`}>{row.missing_checkout}</td>
                  </tr>
                ))}
              </DataTable>
            </SectionCard>
          </>
        )}

        {/* ---------------------------------------------------------- leave */}
        {active === "leave" && (
          <>
            <FilterPanel title="Report filters" columns={4} onApply={applyFilters} isBusy={loading}>
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

            <div className="grid gap-6 lg:grid-cols-5">
              <SectionCard
                className="lg:col-span-2"
                title="Summary"
                description={leave ? formatDateRange(leave.range.from, leave.range.to) : undefined}
                icon={CalendarDays}
              >
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-1">
                  <MetricTile label="Requests" value={loading ? "—" : leave?.totals.requests ?? 0} icon={CalendarDays} tone="primary" />
                  <MetricTile label="Approved days" value={loading ? "—" : leave?.totals.approved_days ?? 0} icon={CalendarDays} tone="success" />
                  <MetricTile label="Pending days" value={loading ? "—" : leave?.totals.pending_days ?? 0} icon={CalendarDays} tone="warning" />
                </div>
              </SectionCard>

              <SectionCard className="lg:col-span-3" title="Approved days by type" icon={BarChart3}>
                {loading ? (
                  <SkeletonText lines={6} />
                ) : approvedByType.every((item) => item.value === 0) ? (
                  <EmptyState
                    icon={CalendarDays}
                    {...emptyFor("No approved leave in this range", "Approved requests overlapping the range are counted here.")}
                    className="py-6"
                  />
                ) : (
                  <BarList title="Approved working days by leave type" items={approvedByType} />
                )}
              </SectionCard>
            </div>

            <SectionCard
              title="Leave requests"
              description="A request overlapping the range is counted in full, not split at the boundary."
              padded={false}
              actions={exportButton("/reports/leave/export")}
            >
              <DataTable
                plain
                headers={["Employee", "Department", "Type", "Status", "Dates", right("Working days")]}
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
                mobileCards={leave?.rows.map((row) => (
                  <RecordCard
                    key={row.id}
                    leading={<Avatar name={row.full_name} size="md" />}
                    title={row.full_name}
                    subtitle={formatDateRange(row.start_date, row.end_date)}
                    badge={<StatusBadge {...leaveStatusMeta(row.status)} />}
                    meta={[
                      { label: "Type", value: leaveTypeMeta(row.leave_type).label },
                      { label: "Working days", value: row.working_days },
                    ]}
                  />
                ))}
              >
                {leave?.rows.map((row) => (
                  <tr key={row.id}>
                    <td className={cell}>
                      <span className="font-medium text-fg">{row.full_name}</span>
                      <span className="block text-xs text-fg-subtle">{row.employee_number}</span>
                    </td>
                    <td className={`${cell} text-fg-muted`}>{row.department_name}</td>
                    <td className={cell}>
                      <StatusBadge {...leaveTypeMeta(row.leave_type)} />
                    </td>
                    <td className={cell}>
                      <StatusBadge {...leaveStatusMeta(row.status)} />
                    </td>
                    <td className={`${cell} whitespace-nowrap text-fg-muted`}>
                      {formatDateRange(row.start_date, row.end_date)}
                    </td>
                    <td className={`${num} font-semibold text-fg`}>{row.working_days}</td>
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
                plain
                headers={["Employee", "Department", "Type", right("Entitled"), right("Used"), right("Pending"), right("Remaining"), right("Available")]}
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
                // One card per employee, with a line per leave type. A card per
                // employee-and-type pair would be four near-identical cards for
                // every person.
                mobileCards={leave?.balances.map((employee) => (
                  <RecordCard
                    key={employee.employee_id}
                    leading={<Avatar name={employee.full_name} size="md" />}
                    title={employee.full_name}
                    subtitle={`${employee.employee_number} · ${employee.department_name}`}
                    meta={employee.balances.map((balance) => ({
                      label: leaveTypeMeta(balance.leaveType).label,
                      value: `${balance.availableDays} of ${balance.entitledDays} available`,
                    }))}
                  />
                ))}
              >
                {leave?.balances.flatMap((employee) =>
                  employee.balances.map((balance) => (
                    <tr key={`${employee.employee_id}-${balance.leaveType}`}>
                      <td className={cell}>
                        <span className="font-medium text-fg">{employee.full_name}</span>
                        <span className="block text-xs text-fg-subtle">{employee.employee_number}</span>
                      </td>
                      <td className={`${cell} text-fg-muted`}>{employee.department_name}</td>
                      <td className={`${cell} text-fg-muted`}>{leaveTypeMeta(balance.leaveType).label}</td>
                      <td className={`${num} text-fg`}>{balance.entitledDays}</td>
                      <td className={`${num} text-fg-muted`}>{balance.usedDays}</td>
                      <td className={`${num} text-fg-muted`}>{balance.pendingDays}</td>
                      <td className={`${num} text-fg`}>{balance.remainingDays}</td>
                      <td className={`${num} font-semibold text-fg`}>{balance.availableDays}</td>
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
            <FilterPanel title="Report filters" columns={2} onApply={applyFilters} isBusy={loading}>
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
                {/* Equal halves, not the 2-of-5 split the other tabs use: four
                    money tiles need the width. At 2/5 the net figure ran out of
                    its tile and every label truncated, and a money figure must
                    never be clipped or overlap. */}
                <div className="grid gap-6 lg:grid-cols-2">
                  <SectionCard
                    title={payroll?.period ? formatPeriod(payroll.period.period_year, payroll.period.period_month) : "Period"}
                    icon={Wallet}
                    actions={
                      payroll?.period ? (
                        <StatusBadge
                          label={payroll.period.status.charAt(0).toUpperCase() + payroll.period.status.slice(1)}
                          tone={payrollStatusTone[payroll.period.status] ?? "neutral"}
                        />
                      ) : undefined
                    }
                    description={payroll?.period ? `${payroll.period.working_days} working days · amounts in MYR` : undefined}
                  >
                    <div className="grid grid-cols-2 gap-3">
                      <MetricTile label="Employees paid" value={loading ? "—" : payroll?.totals.employees ?? 0} icon={Users} tone="primary" />
                      <MetricTile label="Gross" value={loading ? "—" : formatSen(payroll?.totals.gross_sen ?? 0)} icon={Wallet} tone="info" />
                      <MetricTile label="Deductions" value={loading ? "—" : formatSen(payroll?.totals.deductions_sen ?? 0)} icon={Wallet} tone="warning" />
                      <MetricTile label="Net payroll" value={loading ? "—" : formatSen(payroll?.totals.net_sen ?? 0)} icon={Wallet} tone="success" />
                    </div>
                  </SectionCard>

                  <SectionCard title="Net pay by department" icon={BarChart3}>
                    {loading ? (
                      <SkeletonText lines={6} />
                    ) : (payroll?.byDepartment.length ?? 0) === 0 ? (
                      <EmptyState icon={Wallet} title="Nothing calculated yet" description="Calculate this period to see pay by department." className="py-6" />
                    ) : (
                      <BarList
                        title="Net pay for each department, in ringgit"
                        items={payroll!.byDepartment.map((row) => ({
                          key: row.department_name,
                          label: row.department_name,
                          hint: `${row.employees} employee${row.employees === 1 ? "" : "s"}`,
                          value: senToNumber(row.net_sen),
                          display: `RM ${formatSen(row.net_sen)}`,
                          tone: "success" as const,
                        }))}
                      />
                    )}
                  </SectionCard>
                </div>

                <SectionCard title="Earnings and deductions" padded={false}>
                  <DataTable
                    plain
                    headers={["Type", "Line", right("Employees"), right("Total, RM")]}
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
                    mobileCards={payroll?.byItem.map((item) => (
                      <RecordCard
                        key={`${item.item_type}-${item.code}-${item.label}`}
                        title={item.label}
                        subtitle={`${item.item_type === "earning" ? "Earning" : "Deduction"}${item.is_statutory ? " · entered manually" : ""}`}
                        badge={<span className="text-sm font-semibold tabular-nums text-fg">{formatSen(item.amount_sen)}</span>}
                        meta={[{ label: "Employees", value: item.lines }]}
                      />
                    ))}
                  >
                    {payroll?.byItem.map((item) => (
                      <tr key={`${item.item_type}-${item.code}-${item.label}`}>
                        <td className={`${cell} text-fg-muted`}>
                          {item.item_type === "earning" ? "Earning" : "Deduction"}
                        </td>
                        <td className={`${cell} font-medium text-fg`}>
                          {item.label}
                          {item.is_statutory && (
                            <span className="ml-2 text-xs font-normal text-fg-subtle">(entered manually)</span>
                          )}
                        </td>
                        <td className={`${num} text-fg-muted`}>{item.lines}</td>
                        <td className={`${num} font-semibold text-fg`}>{formatSen(item.amount_sen)}</td>
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
                    plain
                    headers={["Employee", "Department", right("Basic"), right("Allowances"), right("Gross"), right("Deductions"), right("Net")]}
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
                    mobileCards={payroll?.rows.map((row) => (
                      <RecordCard
                        key={row.record_id}
                        leading={<Avatar name={row.full_name} size="md" />}
                        title={row.full_name}
                        subtitle={`${row.employee_number} · ${row.department_name}`}
                        badge={<span className="text-sm font-semibold tabular-nums text-fg">RM {formatSen(row.net_sen)}</span>}
                        meta={[
                          { label: "Gross", value: formatSen(row.gross_sen) },
                          { label: "Deductions", value: formatSen(row.deductions_sen) },
                        ]}
                      />
                    ))}
                  >
                    {payroll?.rows.map((row) => (
                      <tr key={row.record_id}>
                        <td className={cell}>
                          <span className="font-medium text-fg">{row.full_name}</span>
                          <span className="block text-xs text-fg-subtle">{row.employee_number}</span>
                        </td>
                        <td className={`${cell} text-fg-muted`}>{row.department_name}</td>
                        <td className={`${num} text-fg-muted`}>{formatSen(row.basic_salary_sen)}</td>
                        <td className={`${num} text-fg-muted`}>{formatSen(row.allowance_sen)}</td>
                        <td className={`${num} text-fg`}>{formatSen(row.gross_sen)}</td>
                        <td className={`${num} text-fg-muted`}>{formatSen(row.deductions_sen)}</td>
                        <td className={`${num} font-semibold text-fg`}>{formatSen(row.net_sen)}</td>
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
