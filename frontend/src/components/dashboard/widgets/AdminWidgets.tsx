import { CalendarDays, CircleCheck, Clock3, FileText, UserPlus, Users, Wallet } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getAuditLog } from "../../../api/auditApi";
import { getEmployees } from "../../../api/employeeApi";
import type { AuditEvent } from "../../../types/audit";
import { employmentStatusMeta } from "../../../utils/status";
import ActivityCard from "../../home/ActivityCard";
import InsightsCard from "../../home/InsightsCard";
import KpiCard from "../../home/KpiCard";
import { QUIET_ACTIONS, toActivity } from "../../home/adminActivity";
import { formatShortDay } from "../../home/homeTime";
import StatusBadge from "../../ui/StatusBadge";
import { sources, useSource } from "../dashboardData";
import type { WidgetProps } from "../widgetRegistry";
import WidgetShell, { WidgetEmpty, WidgetFailed, WidgetLoading } from "./WidgetShell";

/**
 * HR's widgets, from the admin endpoints HR's default Home already reads.
 * Company figures only as the default cards show them; no widget reaches a
 * record the admin dashboard, audit log or lifecycle plans do not already give HR.
 */

const percentOf = (part: number, whole: number) => (whole > 0 ? `${Math.round((part / whole) * 100)}%` : "0%");
const shortPeriod = (year: number, month: number) =>
  new Intl.DateTimeFormat("en-US", { month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(year, month - 1, 1)));
const capitalize = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);

export function HeadcountWidget() {
  const { data, failed } = useSource(sources.adminDashboard);
  return (
    <KpiCard icon={Users} tint="teal" label="Total employees" isLoading={!data && !failed}
      value={failed ? "—" : data?.totalEmployees ?? "—"}
      detail={failed ? "Could not be loaded" : data ? `${data.activeEmployees} active` : undefined}
      to="/people" className="h-full" />
  );
}

export function OnLeaveTodayWidget() {
  const { data, failed } = useSource(sources.adminDashboard);
  return (
    <KpiCard icon={CalendarDays} tint="blue" label="On leave today" isLoading={!data && !failed}
      value={failed ? "—" : data?.onLeaveToday ?? "—"}
      detail={failed ? "Could not be loaded" : data ? `${percentOf(data.onLeaveToday, data.totalEmployees)} of total` : undefined}
      to={data ? `/calendar?date=${data.today}` : "/calendar"} showArrow className="h-full" />
  );
}

export function LateTodayWidget() {
  const { data, failed } = useSource(sources.adminDashboard);
  return (
    <KpiCard icon={Clock3} tint="amber" label="Late today" isLoading={!data && !failed}
      value={failed ? "—" : data?.attendanceToday.late ?? "—"}
      detail={failed ? "Could not be loaded" : data ? `${percentOf(data.attendanceToday.late, data.totalEmployees)} of total` : undefined}
      to="/admin/attendance" showArrow className="h-full" />
  );
}

export function PendingLeaveWidget() {
  const { data, failed } = useSource(sources.adminDashboard);
  return (
    <KpiCard icon={FileText} tint="rose" label="Pending requests" isLoading={!data && !failed}
      value={failed ? "—" : data?.pendingLeaves ?? "—"}
      detail={failed ? "Could not be loaded" : data ? (data.pendingLeaves > 0 ? "Requires attention" : "Nothing waiting") : undefined}
      to="/admin/leave?status=pending" className="h-full" />
  );
}

export function AttendanceTodayWidget() {
  const { data, failed } = useSource(sources.adminDashboard);
  const figures = data ? [
    ["Present", data.attendanceToday.present],
    ["Late", data.attendanceToday.late],
    ["Absent", data.attendanceToday.absent],
    ["On leave", data.onLeaveToday],
    ["Not clocked in", data.notClockedIn],
  ] as const : [];
  return (
    <WidgetShell title="Attendance today" aside={data ? formatShortDay(data.today) : undefined} footer={{ label: "Attendance", to: "/admin/attendance" }}>
      {failed ? <WidgetFailed what="Today's attendance" /> : !data ? <WidgetLoading rows={2} /> : (
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
          {figures.map(([label, value]) => (
            <div key={label} className="min-w-0">
              <dt className="text-xs text-fg-subtle">{label}</dt>
              <dd className="mt-0.5 text-xl font-semibold tabular-nums text-fg">{value}</dd>
            </div>
          ))}
        </dl>
      )}
    </WidgetShell>
  );
}

export function PayrollStatusWidget({ size }: WidgetProps) {
  const { data, failed } = useSource(sources.adminDashboard);
  const period = data?.payrollStatus ?? null;
  if (size === "small") {
    return (
      <KpiCard icon={Wallet} tint="green" label="Payroll" isLoading={!data && !failed}
        value={failed ? "—" : period ? shortPeriod(period.periodYear, period.periodMonth) : "No period"}
        detail={failed ? "Could not be loaded" : !data ? undefined : period ? capitalize(period.status) : "Open a period to start"}
        to="/admin/payroll" className="h-full" />
    );
  }
  return (
    <WidgetShell title="Payroll" footer={{ label: "Open payroll", to: "/admin/payroll" }}>
      {failed ? <WidgetFailed what="Payroll" /> : !data ? <WidgetLoading rows={2} /> : !period ? (
        <WidgetEmpty icon={Wallet} title="No payroll period yet" description="Periods appear here once HR opens one." />
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-2xl font-semibold tracking-tight text-fg">{shortPeriod(period.periodYear, period.periodMonth)}</p>
            <StatusBadge label={capitalize(period.status)} tone={period.status === "paid" ? "success" : period.status === "draft" ? "neutral" : "info"} />
          </div>
          <p className="text-sm text-fg-muted">{period.records} {period.records === 1 ? "payslip" : "payslips"} in this period</p>
        </div>
      )}
    </WidgetShell>
  );
}

export function LifecycleWidget({ size }: WidgetProps) {
  const { data, failed } = useSource(sources.activePlans);
  const plans = data?.plans ?? [];
  const joining = plans.filter((plan) => plan.kind === "onboarding").length;
  const leaving = plans.length - joining;
  if (size === "small") {
    return (
      <KpiCard icon={UserPlus} tint="rose" label="Plans in progress" isLoading={!data && !failed}
        value={failed ? "—" : plans.length}
        detail={failed ? "Could not be loaded" : !data ? undefined : `${joining} joining · ${leaving} leaving`}
        to="/admin/onboarding" className="h-full" />
    );
  }
  const next = [...plans].sort((a, b) => a.targetDate.localeCompare(b.targetDate)).slice(0, 3);
  return (
    <WidgetShell title="Onboarding & offboarding" aside={data ? `${joining} joining · ${leaving} leaving` : undefined} footer={{ label: "Onboarding", to: "/admin/onboarding" }}>
      {failed ? <WidgetFailed what="Plans" /> : !data ? <WidgetLoading /> : next.length === 0 ? (
        <WidgetEmpty icon={CircleCheck} title="No plans in progress" description="Start onboarding or offboarding from Workflows." />
      ) : (
        <ul className="space-y-0.5">
          {next.map((plan) => (
            <li key={plan.id}>
              <Link to={`/admin/lifecycle/plans/${plan.id}`} className="-mx-2 flex items-start justify-between gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-surface-muted focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring">
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-fg">{plan.employeeName}</span>
                  <span className="block text-xs text-fg-subtle">{plan.kind === "onboarding" ? "Onboarding" : "Offboarding"}</span>
                </span>
                <span className="shrink-0 text-xs text-fg-subtle">Target {formatShortDay(plan.targetDate)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </WidgetShell>
  );
}

export function RecentActivityWidget() {
  const [activity, setActivity] = useState<{ state: "loading" | "ready" | "failed"; events: AuditEvent[] }>({ state: "loading", events: [] });
  const [names, setNames] = useState<Map<number, string>>(new Map());
  useEffect(() => {
    getAuditLog({ pageSize: 100 })
      .then((page) => setActivity({ state: "ready", events: page.events.filter((event) => !QUIET_ACTIONS.has(event.action)).slice(0, 3) }))
      .catch(() => setActivity({ state: "failed", events: [] }));
    getEmployees()
      .then((page) => setNames(new Map(page.employees.map((employee) => [employee.id, employee.fullName]))))
      .catch(() => undefined);
  }, []);
  return (
    <ActivityCard state={activity.state} entries={activity.events.map((event) => toActivity(event, names))} viewAllTo="/admin/audit" emptyText="No company activity recorded yet." className="h-full" />
  );
}

export function RecentEmployeesWidget() {
  const { data, failed } = useSource(sources.adminDashboard);
  const employees = data?.recentEmployees.slice(0, 4) ?? [];
  return (
    <WidgetShell title="Recently added employees" footer={{ label: "People", to: "/people?view=list" }}>
      {failed ? <WidgetFailed what="Employees" /> : !data ? <WidgetLoading /> : employees.length === 0 ? (
        <WidgetEmpty icon={Users} title="No employees yet" description="New employee records appear here." />
      ) : (
        <ul className="space-y-0.5">
          {employees.map((employee) => (
            <li key={employee.id}>
              <Link to={`/people/${employee.id}`} className="-mx-2 flex items-center justify-between gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-surface-muted focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring">
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-fg">{employee.fullName}</span>
                  <span className="block truncate text-xs text-fg-subtle">{employee.jobTitle ?? employee.employeeNumber}</span>
                </span>
                <StatusBadge {...employmentStatusMeta(employee.employmentStatus)} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </WidgetShell>
  );
}

export function InsightsWidget() {
  const { data, failed } = useSource(sources.calendar);
  if (!data) {
    return (
      <WidgetShell title="Insights">
        {failed ? <WidgetFailed what="Insights" /> : <WidgetLoading rows={4} />}
      </WidgetShell>
    );
  }
  return <InsightsCard today={data.config.today} workingDays={data.config.workingDays ?? [1, 2, 3, 4, 5]} className="h-full" />;
}
