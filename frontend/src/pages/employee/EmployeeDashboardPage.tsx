import {
  BadgeCheck,
  CalendarDays,
  CalendarOff,
  CalendarPlus,
  Clock3,
  LogIn,
  LogOut,
  Receipt,
  ShieldAlert,
  UserRound,
  Wallet,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { getApiErrorMessage } from "../../api/axios";
import { getEmployeeDashboard } from "../../api/dashboardApi";
import VerifiedClockPanel from "../../components/attendance/VerifiedClockPanel";
import Alert from "../../components/ui/Alert";
import Button from "../../components/ui/Button";
import EmptyState from "../../components/ui/EmptyState";
import LinkButton from "../../components/ui/LinkButton";
import PageHeader from "../../components/ui/PageHeader";
import SectionCard from "../../components/ui/SectionCard";
import StatCard from "../../components/ui/StatCard";
import StatusBadge from "../../components/ui/StatusBadge";
import type {
  EmployeeAttendanceEntry,
  EmployeeDashboardData,
  EmployeeLeaveEntry,
} from "../../types/dashboard";
import { formatPeriod, formatSen } from "../../types/payroll";
import { formatDate, formatTime } from "../../utils/datetime";
import {
  attendanceStatusMeta,
  leaveStatusMeta,
  leaveTypeMeta,
  type StatusMeta,
} from "../../utils/status";

const notRecordedMeta: StatusMeta = {
  label: "Not recorded",
  tone: "neutral",
  icon: Clock3,
};

/** Inclusive whole days, computed on plain YYYY-MM-DD text. */
function inclusiveDays(start: string, end: string): number {
  const from = Date.parse(`${start}T00:00:00Z`);
  const to = Date.parse(`${end}T00:00:00Z`);
  if (!Number.isFinite(from) || !Number.isFinite(to) || to < from) return 0;
  return Math.round((to - from) / 86_400_000) + 1;
}

export default function EmployeeDashboardPage() {
  const [dashboard, setDashboard] = useState<EmployeeDashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [clockMode, setClockMode] = useState<"check-in" | "check-out" | null>(null);

  const load = useCallback(async () => {
    setError("");
    try {
      setDashboard(await getEmployeeDashboard());
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, "Unable to load your dashboard."));
      // The stale payload is dropped: a failed reload must never be read as
      // current information.
      setDashboard(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (isLoading) {
    return <p className="text-sm text-fg-muted">Loading dashboard...</p>;
  }

  if (error) {
    return (
      <section className="mx-auto max-w-7xl space-y-4">
        <Alert tone="danger">{error}</Alert>
        <Button onClick={() => { setIsLoading(true); void load(); }}>Try again</Button>
      </section>
    );
  }

  if (!dashboard) return null;

  const {
    employee, todayAttendance, recentAttendance, leaveBalances, leaveYear,
    pendingLeaveCount, upcomingLeave, recentLeaves, latestPayslip, unavailable,
  } = dashboard;

  const balancesUnavailable = unavailable.includes("leaveBalances");
  const payslipUnavailable = unavailable.includes("payslip");

  const todayMeta = todayAttendance
    ? attendanceStatusMeta(todayAttendance.status)
    : notRecordedMeta;

  const hasCheckedIn = Boolean(todayAttendance?.checkInTime);
  const hasCheckedOut = Boolean(todayAttendance?.checkOutTime);

  // Annual leave is the balance an employee asks about first; the rest are
  // listed in full below. Absent rather than zero when it could not be read.
  const annual = leaveBalances?.find((balance) => balance.leaveType === "annual") ?? null;

  return (
    <section className="mx-auto max-w-7xl space-y-6">
      <PageHeader
        title={`Welcome, ${employee.fullName}`}
        description={`${employee.jobTitle ?? "Employee"} · ${employee.departmentName ?? "No department"} · ${employee.employeeNumber}`}
      />

      {message && <Alert tone="success">{message}</Alert>}

      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Today's attendance"
          value={todayMeta.label}
          icon={todayMeta.icon}
          tone={todayMeta.tone}
          hint={
            todayAttendance
              ? `In ${formatTime(todayAttendance.checkInTime)} · Out ${formatTime(todayAttendance.checkOutTime)}`
              : `Nothing recorded for ${formatDate(dashboard.today)}`
          }
          to="/employee/attendance"
        />

        <StatCard
          label="Annual leave remaining"
          value={
            balancesUnavailable ? "Unavailable" : annual ? `${annual.remainingDays} days` : "—"
          }
          icon={balancesUnavailable ? ShieldAlert : CalendarDays}
          tone={balancesUnavailable ? "neutral" : annual && annual.remainingDays > 0 ? "success" : "neutral"}
          hint={
            balancesUnavailable
              ? "Could not be loaded. Open Leave to check."
              : annual
                ? `${annual.availableDays} available after pending · ${leaveYear}`
                : "No annual leave policy is active"
          }
          to="/employee/leave"
        />

        <StatCard
          label="Pending leave requests"
          value={pendingLeaveCount}
          icon={Clock3}
          tone={pendingLeaveCount > 0 ? "warning" : "neutral"}
          hint={pendingLeaveCount > 0 ? "Awaiting a decision" : "Nothing awaiting a decision"}
          to="/employee/leave"
        />

        <StatCard
          label="Latest payslip"
          value={
            payslipUnavailable
              ? "Unavailable"
              : latestPayslip
                ? formatSen(latestPayslip.netSen)
                : "None yet"
          }
          icon={payslipUnavailable ? ShieldAlert : Wallet}
          tone={payslipUnavailable ? "neutral" : latestPayslip ? "info" : "neutral"}
          hint={
            payslipUnavailable
              ? "Could not be loaded. Open Payslips to check."
              : latestPayslip
                ? `Net pay · ${formatPeriod(latestPayslip.periodYear, latestPayslip.periodMonth)}`
                : "A payslip appears once payroll is approved"
          }
          to="/employee/payroll"
        />
      </div>

      {/* ------------------------------------------------- clock in and out */}
      <SectionCard
        title="Record today's attendance"
        description="Scan the office QR code to record verified attendance. The official time is set by the server."
        icon={Clock3}
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
          <Button
            icon={LogIn}
            onClick={() => { setClockMode("check-in"); setMessage(""); }}
            disabled={hasCheckedIn || clockMode !== null}
          >
            Check in
          </Button>

          <Button
            icon={LogOut}
            onClick={() => { setClockMode("check-out"); setMessage(""); }}
            disabled={!hasCheckedIn || hasCheckedOut || clockMode !== null}
          >
            Check out
          </Button>

          {todayAttendance?.verificationStatus && (
            <span className="inline-flex items-center gap-2 self-center text-xs text-fg-subtle">
              <BadgeCheck className="size-4" aria-hidden="true" />
              {verificationLabel(todayAttendance.verificationStatus)}
            </span>
          )}
        </div>
      </SectionCard>

      {clockMode && (
        <VerifiedClockPanel
          mode={clockMode}
          onRecorded={() => {
            setClockMode(null);
            setMessage(
              clockMode === "check-in" ? "Checked in successfully." : "Checked out successfully.",
            );
            // Re-read from the server rather than patching local state, so the
            // dashboard shows what was actually recorded.
            void load();
          }}
          onCancel={() => setClockMode(null)}
        />
      )}

      <SectionCard title="Quick links">
        <div className="flex flex-wrap gap-3">
          <LinkButton to="/employee/attendance" variant="secondary" icon={Clock3}>
            Attendance
          </LinkButton>

          <LinkButton to="/employee/leave" variant="secondary" icon={CalendarPlus}>
            Apply leave
          </LinkButton>

          <LinkButton to="/employee/payroll" variant="secondary" icon={Receipt}>
            Payslips
          </LinkButton>

          <LinkButton to="/employee/profile" variant="secondary" icon={UserRound}>
            My profile
          </LinkButton>
        </div>
      </SectionCard>

      {/* ------------------------------------------------------- leave */}
      <div className="grid gap-5 lg:grid-cols-2">
        <SectionCard
          title="Leave balance"
          description={leaveYear ? `Leave year ${leaveYear}` : undefined}
          icon={CalendarDays}
          padded={!balancesUnavailable && (leaveBalances?.length ?? 0) > 0}
        >
          {balancesUnavailable ? (
            <EmptyState
              icon={ShieldAlert}
              title="Your leave balance could not be loaded"
              description="This is a temporary problem reading the balance, not a balance of zero. Open the Leave page to check."
              action={<LinkButton to="/employee/leave" variant="secondary">Open Leave</LinkButton>}
            />
          ) : (leaveBalances?.length ?? 0) === 0 ? (
            <EmptyState
              icon={CalendarOff}
              title="No leave types are active"
              description="Once a leave policy is active your entitlement appears here."
            />
          ) : (
            <ul className="space-y-3">
              {leaveBalances!.map((balance) => (
                <li
                  key={balance.leaveType}
                  className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-3 last:border-0 last:pb-0"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-fg">
                      {leaveTypeMeta(balance.leaveType).label}
                      {!balance.isPaid && (
                        <span className="ml-2 text-xs font-normal text-fg-subtle">unpaid</span>
                      )}
                    </p>
                    <p className="mt-0.5 text-xs text-fg-subtle">
                      {balance.deductsBalance
                        ? `${balance.usedDays} used · ${balance.pendingDays} pending of ${balance.entitledDays}`
                        : "Does not deduct from a balance"}
                    </p>
                  </div>

                  {balance.deductsBalance ? (
                    <p className="text-sm font-semibold text-fg">
                      {balance.remainingDays}
                      <span className="ml-1 text-xs font-normal text-fg-subtle">left</span>
                    </p>
                  ) : (
                    <p className="text-sm text-fg-muted">{balance.usedDays} taken</p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        <SectionCard
          title="Leave"
          icon={CalendarDays}
          padded={recentLeaves.length > 0 || upcomingLeave !== null}
        >
          {upcomingLeave ? (
            <div className="mb-4 rounded-lg bg-info-soft px-4 py-3">
              <p className="text-xs font-medium uppercase tracking-wide text-info-fg">
                Next approved leave
              </p>
              <p className="mt-1 text-sm font-medium text-fg">
                {leaveTypeMeta(upcomingLeave.leaveType).label} ·{" "}
                {upcomingLeave.workingDays ?? inclusiveDays(upcomingLeave.startDate, upcomingLeave.endDate)}{" "}
                {(upcomingLeave.workingDays ?? 0) === 1 ? "day" : "days"}
              </p>
              <p className="mt-0.5 text-xs text-fg-muted">
                {formatDate(upcomingLeave.startDate)} &rarr; {formatDate(upcomingLeave.endDate)}
              </p>
            </div>
          ) : (
            <p className="mb-4 text-xs text-fg-subtle">No approved leave is scheduled.</p>
          )}

          {recentLeaves.length === 0 ? (
            <EmptyState
              icon={CalendarOff}
              title="No leave requests found"
              description="Requests you submit will be listed here with their status."
              action={<LinkButton to="/employee/leave" variant="secondary">Apply for leave</LinkButton>}
            />
          ) : (
            <ul className="space-y-3">
              {recentLeaves.map((leave) => (
                <LeaveRow key={leave.id} leave={leave} />
              ))}
            </ul>
          )}
        </SectionCard>
      </div>

      {/* --------------------------------------------- attendance and pay */}
      <div className="grid gap-5 lg:grid-cols-2">
        <SectionCard
          title="Recent attendance"
          icon={Clock3}
          padded={recentAttendance.length > 0}
        >
          {recentAttendance.length === 0 ? (
            <EmptyState
              icon={Clock3}
              title="No attendance records found"
              description="Your check-ins will appear here once you start recording them."
            />
          ) : (
            <ul className="space-y-3">
              {recentAttendance.map((entry) => (
                <AttendanceRow key={entry.id} entry={entry} />
              ))}
            </ul>
          )}
        </SectionCard>

        <SectionCard title="Employment" icon={UserRound}>
          <dl className="grid gap-3 sm:grid-cols-2">
            <Fact label="Employee number" value={employee.employeeNumber} />
            <Fact label="Job title" value={employee.jobTitle ?? "Not recorded"} />
            <Fact label="Department" value={employee.departmentName ?? "Not assigned"} />
            <Fact
              label="Employment status"
              value={employee.employmentStatus.replaceAll("_", " ")}
            />
            <Fact
              label="Joined"
              value={employee.employmentDate ? formatDate(employee.employmentDate) : "Not recorded"}
            />
            <Fact label="Company date" value={formatDate(dashboard.today)} />
          </dl>

          {payslipUnavailable ? (
            <p className="mt-4 border-t border-line pt-4 text-xs text-fg-subtle">
              Your latest payslip could not be loaded. This is a temporary problem, not
              an absence of pay records.
            </p>
          ) : latestPayslip ? (
            <div className="mt-4 border-t border-line pt-4">
              <p className="text-xs font-medium uppercase tracking-wide text-fg-subtle">
                Latest payslip · {formatPeriod(latestPayslip.periodYear, latestPayslip.periodMonth)}
              </p>
              <dl className="mt-2 grid gap-2 sm:grid-cols-3">
                <Fact label="Gross" value={formatSen(latestPayslip.grossSen)} />
                <Fact label="Deductions" value={formatSen(latestPayslip.deductionsSen)} />
                <Fact label="Net pay" value={formatSen(latestPayslip.netSen)} />
              </dl>
              <div className="mt-3">
                <LinkButton to="/employee/payroll" variant="secondary" icon={Receipt}>
                  View payslips
                </LinkButton>
              </div>
            </div>
          ) : (
            <p className="mt-4 border-t border-line pt-4 text-xs text-fg-subtle">
              No payslip is available yet. A payslip appears here once a payroll period
              has been approved.
            </p>
          )}
        </SectionCard>
      </div>
    </section>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-fg-subtle">{label}</dt>
      <dd className="mt-0.5 truncate text-sm font-medium capitalize text-fg">{value}</dd>
    </div>
  );
}

/**
 * The coarse verification state only. The dashboard is never sent coordinates,
 * accuracy or distance from the office, so none can be rendered here.
 */
function verificationLabel(status: "verified" | "manual" | "exception"): string {
  if (status === "verified") return "Today's record is verified";
  if (status === "manual") return "Today's record was entered by an administrator";
  return "Today's record is marked as an exception";
}

function AttendanceRow({ entry }: { entry: EmployeeAttendanceEntry }) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-3 last:border-0 last:pb-0">
      <div className="min-w-0">
        <p className="text-sm font-medium text-fg">{formatDate(entry.attendanceDate)}</p>
        <p className="mt-0.5 text-xs text-fg-subtle">
          {formatTime(entry.checkInTime)} &rarr; {formatTime(entry.checkOutTime)}
          {entry.lateMinutes !== null && entry.lateMinutes > 0 && (
            <span className="ml-2 text-warning-fg">{entry.lateMinutes} min late</span>
          )}
        </p>
      </div>

      <StatusBadge {...attendanceStatusMeta(entry.status)} />
    </li>
  );
}

function LeaveRow({ leave }: { leave: EmployeeLeaveEntry }) {
  return (
    <li className="border-b border-line pb-3 last:border-0 last:pb-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium text-fg">
          {leaveTypeMeta(leave.leaveType).label} leave
        </p>
        <StatusBadge {...leaveStatusMeta(leave.status)} />
      </div>

      <p className="mt-1 text-xs text-fg-subtle">
        {formatDate(leave.startDate)} &rarr; {formatDate(leave.endDate)}
        {leave.workingDays !== null && ` · ${leave.workingDays} working days`}
      </p>

      {leave.adminComment && (
        <p className="mt-1 text-xs text-fg-muted">Admin: {leave.adminComment}</p>
      )}
    </li>
  );
}
