import { CalendarDays, Clock3, Target, Wallet } from "lucide-react";
import { formatSen } from "../../../types/payroll";
import { calcWorkMinutes, formatWorkHours } from "../../../utils/attendance";
import { attendanceStatusMeta } from "../../../utils/status";
import GoalsCard from "../../home/GoalsCard";
import KpiCard from "../../home/KpiCard";
import LeaveCard from "../../home/LeaveCard";
import RecognitionCard from "../../home/RecognitionCard";
import { formatClock, formatShortDay } from "../../home/homeTime";
import { sources, useSource } from "../dashboardData";
import type { WidgetProps } from "../widgetRegistry";
import WidgetShell, { WidgetFailed, WidgetLoading } from "./WidgetShell";

/**
 * An employee's own widgets. Every figure is the account's own record, read
 * from the employee endpoints the default Home already uses. Nothing here
 * records attendance: checking in stays on the verified Attendance page.
 */

const shortPeriod = (year: number, month: number) =>
  new Intl.DateTimeFormat("en-US", { month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(year, month - 1, 1)));

export function MyAttendanceWidget({ size }: WidgetProps) {
  const { data: dashboard, failed } = useSource(sources.employeeDashboard);
  const attendance = dashboard?.todayAttendance ?? null;
  const checkedIn = Boolean(attendance?.checkInTime);
  const checkedOut = Boolean(attendance?.checkOutTime);

  if (size === "small") {
    return (
      <KpiCard
        icon={Clock3}
        tint="teal"
        label="Checked in"
        isLoading={!dashboard && !failed}
        value={failed ? "—" : attendance?.checkInTime ? formatClock(attendance.checkInTime) : "Not yet"}
        detail={failed ? "Could not be loaded"
          : !dashboard ? undefined
            : attendance?.checkOutTime ? `Out at ${formatClock(attendance.checkOutTime)}`
              : attendance ? `${attendanceStatusMeta(attendance.status).label}${attendance.verificationStatus === "verified" ? " · verified" : ""}`
                : "Check in on Attendance"}
        to="/employee/attendance"
        showArrow
        className="h-full"
      />
    );
  }

  // Only the coarse state the dashboard is given; a manual record may have been
  // entered or corrected by HR, so it is described as either.
  const verification = !attendance ? "Nothing recorded yet today"
    : attendance.verificationStatus === "verified" ? "Verified with the office QR code"
      : attendance.verificationStatus === "manual" ? "Recorded or corrected by HR"
        : attendance.verificationStatus === "exception" ? "Marked as an exception"
          : attendanceStatusMeta(attendance.status).label;

  return (
    <WidgetShell
      title="My attendance"
      aside={dashboard ? formatShortDay(dashboard.today) : undefined}
      footer={{ label: !checkedIn ? "Check in on Attendance" : !checkedOut ? "Check out on Attendance" : "Attendance history", to: "/employee/attendance" }}
    >
      {failed ? <WidgetFailed what="Your attendance" /> : !dashboard ? <WidgetLoading rows={2} /> : (
        <>
          <dl className="grid grid-cols-3 gap-3">
            {[
              ["Check-in", attendance?.checkInTime ? formatClock(attendance.checkInTime) : "—"],
              ["Check-out", attendance?.checkOutTime ? formatClock(attendance.checkOutTime) : "—"],
              ["Worked", formatWorkHours(calcWorkMinutes(attendance?.checkInTime, attendance?.checkOutTime))],
            ].map(([label, value]) => (
              <div key={label} className="min-w-0">
                <dt className="text-xs text-fg-subtle">{label}</dt>
                <dd className="mt-0.5 text-lg font-semibold tabular-nums text-fg">{value}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-3 text-[0.8125rem] text-fg-subtle">
            {verification}
            {attendance?.lateMinutes ? <span className="text-warning-fg"> · {attendance.lateMinutes} minutes late</span> : null}
          </p>
        </>
      )}
    </WidgetShell>
  );
}

export function LeaveBalanceWidget({ size }: WidgetProps) {
  const { data: dashboard, failed } = useSource(sources.employeeDashboard);
  const unavailable = dashboard?.unavailable.includes("leaveBalances") ?? false;
  const annual = dashboard?.leaveBalances?.find((balance) => balance.leaveType === "annual") ?? null;

  if (size === "small") {
    return (
      <KpiCard
        icon={CalendarDays}
        tint="blue"
        label="Annual leave left"
        isLoading={!dashboard && !failed}
        value={failed || unavailable ? "—" : annual ? annual.remainingDays : "—"}
        detail={failed || unavailable ? "Could not be loaded" : !dashboard ? undefined : annual ? `of ${annual.entitledDays} days` : "No annual leave policy"}
        to="/employee/leave"
        showArrow
        className="h-full"
      />
    );
  }
  if (failed) {
    return <WidgetShell title="Your leave" footer={{ label: "Leave", to: "/employee/leave" }}><WidgetFailed what="Your leave" /></WidgetShell>;
  }
  return <LeaveCard dashboard={dashboard} className="h-full" />;
}

export function MyPayslipWidget() {
  const { data: dashboard, failed } = useSource(sources.employeeDashboard);
  const unavailable = dashboard?.unavailable.includes("payslip") ?? false;
  const payslip = dashboard?.latestPayslip ?? null;
  return (
    <KpiCard
      icon={Wallet}
      tint="green"
      label="Latest payslip"
      isLoading={!dashboard && !failed}
      value={failed || unavailable ? "—" : payslip ? shortPeriod(payslip.periodYear, payslip.periodMonth) : "None yet"}
      detail={failed || unavailable ? "Could not be loaded" : !dashboard ? undefined : payslip ? `Net RM ${formatSen(payslip.netSen)}` : "Appears once payroll is approved"}
      to="/employee/payroll"
      className="h-full"
    />
  );
}

export function MyGoalsWidget({ size }: WidgetProps) {
  const { data, failed } = useSource(sources.myGoals);
  if (size !== "small") return <GoalsCard className="h-full" />;

  const active = data?.goals.filter((goal) => goal.status === "active") ?? [];
  const pastDue = active.filter((goal) => goal.dueOn < (data?.today ?? "")).length;
  const nextDue = [...active].sort((a, b) => a.dueOn.localeCompare(b.dueOn))[0];
  return (
    <KpiCard
      icon={Target}
      tint="rose"
      label="Active goals"
      isLoading={!data && !failed}
      value={failed ? "—" : active.length}
      detail={failed ? "Could not be loaded" : !data ? undefined : pastDue > 0 ? `${pastDue} past due` : nextDue ? `Next due ${formatShortDay(nextDue.dueOn)}` : "None active"}
      to="/goals"
      className="h-full"
    />
  );
}

export function RecognitionWidget() {
  return <RecognitionCard className="h-full" />;
}
