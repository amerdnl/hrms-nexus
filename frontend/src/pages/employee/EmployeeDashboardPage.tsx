import {
  ArrowRight,
  CalendarDays,
  CalendarOff,
  CalendarPlus,
  Clock3,
  ShieldAlert,
  UserRound,
  Wallet,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { getApiErrorMessage } from "../../api/axios";
import { getEmployeeDashboard } from "../../api/dashboardApi";
import TodayAttendanceCard from "../../components/attendance/TodayAttendanceCard";
import VerifiedClockPanel from "../../components/attendance/VerifiedClockPanel";
import Alert from "../../components/ui/Alert";
import EmptyState from "../../components/ui/EmptyState";
import ErrorState from "../../components/ui/ErrorState";
import LinkButton from "../../components/ui/LinkButton";
import ProgressBar from "../../components/ui/ProgressBar";
import SectionCard from "../../components/ui/SectionCard";
import Skeleton, { SkeletonText } from "../../components/ui/Skeleton";
import StatusBadge from "../../components/ui/StatusBadge";
import type {
  EmployeeAttendanceEntry,
  EmployeeDashboardData,
  EmployeeLeaveEntry,
} from "../../types/dashboard";
import { formatPeriod, formatSen } from "../../types/payroll";
import { formatDate, formatDateRange, formatTime } from "../../utils/datetime";
import { formatLeaveDuration } from "../../utils/leave";
import {
  attendanceStatusMeta,
  leaveStatusMeta,
  leaveTypeMeta,
} from "../../utils/status";

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
    return (
      <section className="mx-auto max-w-7xl space-y-6" aria-busy="true">
        <p className="sr-only" aria-live="polite">Loading your dashboard</p>
        <div className="space-y-2">
          <Skeleton className="h-8 w-72" />
          <Skeleton className="h-4 w-56" />
        </div>
        <div className="grid items-start gap-6 lg:grid-cols-3">
          <SectionCard className="lg:col-span-2">
            <Skeleton className="h-6 w-40" />
            <Skeleton className="mt-4 h-10 w-56" />
            <SkeletonText lines={2} className="mt-6" />
          </SectionCard>
          <SectionCard><SkeletonText lines={5} /></SectionCard>
        </div>
      </section>
    );
  }

  if (error || !dashboard) {
    return (
      <section className="mx-auto max-w-3xl">
        <SectionCard>
          <ErrorState
            title="Your dashboard could not be loaded"
            description={error || "No dashboard data was returned."}
            onRetry={() => { setIsLoading(true); void load(); }}
          />
        </SectionCard>
      </section>
    );
  }

  const {
    employee, todayAttendance, recentAttendance, leaveBalances, leaveYear,
    pendingLeaveCount, upcomingLeave, recentLeaves, latestPayslip, unavailable,
  } = dashboard;

  const balancesUnavailable = unavailable.includes("leaveBalances");
  const payslipUnavailable = unavailable.includes("payslip");

  // Annual leave is the balance an employee asks about first; the rest are
  // listed in full below. Absent rather than zero when it could not be read.
  const annual = leaveBalances?.find((balance) => balance.leaveType === "annual") ?? null;

  return (
    <section className="mx-auto max-w-7xl space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight text-fg sm:text-3xl">
          {greeting()}, {givenName(employee.fullName)}
        </h1>
        <p className="mt-1 text-sm text-fg-muted">
          {formatDate(dashboard.today)} · {employee.jobTitle ?? "Employee"}
          {employee.departmentName ? `, ${employee.departmentName}` : ""}
        </p>
      </header>

      {message && <Alert tone="success" onDismiss={() => setMessage("")}>{message}</Alert>}

      {/*
        Three regions on one grid. Today leads; the side column (leave, pay,
        recent attendance) spans both rows; the lists and employment sit under
        Today. The first row is sized by Today alone (auto) and the second
        takes the rest (1fr), so the side column's extra height lands at the
        very bottom instead of opening a gap under Today. DOM order is Today,
        side, lists - which is also the phone order, so checking in is the
        first thing on a small screen.
      */}
      <div className="grid items-start gap-6 lg:grid-cols-3 lg:grid-rows-[auto_1fr]">
        <div className="space-y-6 lg:col-span-2">
          <TodayAttendanceCard
            dateLabel={formatDate(dashboard.today)}
            status={todayAttendance?.status ?? null}
            checkInTime={todayAttendance?.checkInTime}
            checkOutTime={todayAttendance?.checkOutTime}
            verificationStatus={todayAttendance?.verificationStatus ?? null}
            lateMinutes={todayAttendance?.lateMinutes ?? null}
            actionsDisabled={clockMode !== null}
            onStart={(mode) => { setClockMode(mode); setMessage(""); }}
          />

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

        </div>

        <div className="space-y-6 lg:col-start-3 lg:row-span-2 lg:row-start-1">
          <SectionCard title="Annual leave" icon={CalendarDays} actions={<LinkButton to="/employee/leave" variant="ghost" size="sm">Leave</LinkButton>}>
            {balancesUnavailable ? (
              <p className="text-sm text-fg-muted">
                Your balance could not be loaded. This is a temporary problem, not a balance of zero.
              </p>
            ) : annual ? (
              <>
                <p className="text-3xl font-bold tracking-tight text-fg">
                  {annual.remainingDays}
                  <span className="ml-1.5 text-sm font-medium text-fg-muted">
                    of {annual.entitledDays} days left
                  </span>
                </p>
                <ProgressBar
                  className="mt-3"
                  tone="primary"
                  value={annual.remainingDays}
                  max={annual.entitledDays}
                  label={`${annual.remainingDays} of ${annual.entitledDays} annual leave days remaining`}
                  isDecorative
                />
                <p className="mt-2 text-xs text-fg-subtle">
                  {annual.availableDays} available after pending
                  {pendingLeaveCount > 0 ? ` · ${pendingLeaveCount} request${pendingLeaveCount === 1 ? "" : "s"} pending` : ""}
                  {leaveYear ? ` · ${leaveYear}` : ""}
                </p>
              </>
            ) : (
              <p className="text-sm text-fg-muted">No annual leave policy is active.</p>
            )}
          </SectionCard>

          <SectionCard title="Latest payslip" icon={Wallet} actions={<LinkButton to="/employee/payroll" variant="ghost" size="sm">Payslips</LinkButton>}>
            {payslipUnavailable ? (
              <p className="text-sm text-fg-muted">
                Could not be loaded. This is a temporary problem, not an absence of pay records.
              </p>
            ) : latestPayslip ? (
              <>
                <p className="text-xs font-medium text-fg-muted">
                  {formatPeriod(latestPayslip.periodYear, latestPayslip.periodMonth)} · net pay
                </p>
                <p className="mt-1 text-3xl font-bold tracking-tight tabular-nums text-fg">
                  <span className="mr-1 text-base font-semibold text-fg-muted">RM</span>
                  {formatSen(latestPayslip.netSen)}
                </p>
                <p className="mt-2 text-xs text-fg-subtle">
                  Gross {formatSen(latestPayslip.grossSen)} · deductions {formatSen(latestPayslip.deductionsSen)}
                </p>
              </>
            ) : (
              <p className="text-sm text-fg-muted">
                No payslip yet. One appears once a payroll period has been approved.
              </p>
            )}
          </SectionCard>

          <SectionCard
            title="Recent attendance"
            icon={Clock3}
            actions={
                <LinkButton
                  to="/employee/attendance"
                  variant="ghost"
                  size="sm"
                  icon={ArrowRight}
                  aria-label="Attendance history"
                  title="Attendance history"
                />
              }
          >
            {recentAttendance.length === 0 ? (
              <EmptyState
                icon={Clock3}
                title="No attendance recorded yet"
                description="Your check-ins appear here once you start recording them."
                className="py-6"
              />
            ) : (
              <ul className="divide-y divide-line">
                {recentAttendance.map((entry) => (
                  <AttendanceRow key={entry.id} entry={entry} />
                ))}
              </ul>
            )}
          </SectionCard>
        </div>

        <div className="space-y-6 lg:col-span-2 lg:row-start-2">
          <div className="grid items-start gap-6 md:grid-cols-2">
            <SectionCard
              title="Leave balances"
              description={leaveYear ? `Leave year ${leaveYear}` : undefined}
              icon={CalendarDays}
            >
              {balancesUnavailable ? (
                <EmptyState
                  icon={ShieldAlert}
                  title="Your leave balance could not be loaded"
                  description="This is a temporary problem reading the balance, not a balance of zero."
                  action={<LinkButton to="/employee/leave" variant="secondary">Open Leave</LinkButton>}
                  className="py-6"
                />
              ) : (leaveBalances?.length ?? 0) === 0 ? (
                <EmptyState
                  icon={CalendarOff}
                  title="No leave types are active"
                  description="Once a leave policy is active your entitlement appears here."
                  className="py-6"
                />
              ) : (
                <ul className="space-y-4">
                  {leaveBalances!.map((balance) => {
                    const meta = leaveTypeMeta(balance.leaveType);
                    return (
                      <li key={balance.leaveType}>
                        <div className="flex items-baseline justify-between gap-3 text-sm">
                          <span className="font-medium text-fg">
                            {meta.label}
                            {!balance.isPaid && <span className="ml-2 text-xs font-normal text-fg-subtle">unpaid</span>}
                          </span>
                          {balance.deductsBalance ? (
                            <span className="tabular-nums text-fg">
                              <span className="font-semibold">{balance.remainingDays}</span>
                              <span className="text-fg-subtle"> / {balance.entitledDays}</span>
                            </span>
                          ) : (
                            <span className="text-xs text-fg-muted">{balance.usedDays} taken</span>
                          )}
                        </div>
                        {balance.deductsBalance ? (
                          <ProgressBar
                            className="mt-2"
                            size="sm"
                            tone={meta.tone}
                            value={balance.remainingDays}
                            max={balance.entitledDays}
                            label={`${meta.label}: ${balance.remainingDays} of ${balance.entitledDays} days remaining`}
                            isDecorative
                          />
                        ) : (
                          <p className="mt-1 text-xs text-fg-subtle">Does not deduct from a balance</p>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </SectionCard>

            <SectionCard
              title="Leave"
              icon={CalendarDays}
              actions={<LinkButton to="/employee/leave" variant="ghost" size="sm" icon={CalendarPlus}>Apply</LinkButton>}
            >
              {upcomingLeave && (
                <div className="mb-4 rounded-xl bg-info-soft p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-info-fg">Next approved leave</p>
                  <p className="mt-1 text-sm font-semibold text-fg">
                    {formatDateRange(upcomingLeave.startDate, upcomingLeave.endDate)}
                  </p>
                  <p className="mt-0.5 text-xs text-fg-muted">
                    {leaveTypeMeta(upcomingLeave.leaveType).label} · {formatLeaveDuration(upcomingLeave)}
                  </p>
                </div>
              )}

              {recentLeaves.length === 0 ? (
                <EmptyState
                  icon={CalendarOff}
                  title="No leave requests yet"
                  description="Requests you submit are listed here with their status."
                  className="py-6"
                />
              ) : (
                <ul className="divide-y divide-line">
                  {recentLeaves.map((leave) => (
                    <LeaveRow key={leave.id} leave={leave} />
                  ))}
                </ul>
              )}
            </SectionCard>

          </div>
        <SectionCard title="Employment" icon={UserRound} actions={<LinkButton to="/employee/profile" variant="ghost" size="sm">Profile</LinkButton>}>
          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <Fact label="Employee number" value={employee.employeeNumber} />
            <Fact label="Job title" value={employee.jobTitle ?? "Not recorded"} />
            <Fact label="Department" value={employee.departmentName ?? "Not assigned"} />
            <Fact label="Employment status" value={employee.employmentStatus.replaceAll("_", " ")} capitalize />
            <Fact label="Joined" value={employee.employmentDate ? formatDate(employee.employmentDate) : "Not recorded"} />
          </dl>
        </SectionCard>
        </div>
      </div>
    </section>
  );
}

/**
 * Greeting word from the viewer's clock. Cosmetic only - nothing here decides
 * a date; the company-local date shown beside it comes from the server.
 */
function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

/**
 * The name to greet someone by. For a patronymic name the given name is
 * everything before "bin", "binti", "a/l" or "a/p" - "Nurul Aisyah binti
 * Kamal" is greeted as "Nurul Aisyah", not "Nurul". Otherwise the first word.
 */
function givenName(fullName: string): string {
  const match = fullName.match(/^(.+?)\s+(?:bin|binti|bte|a\/l|a\/p)\s/i);
  if (match) return match[1];
  return fullName.split(/\s+/)[0] || fullName;
}

/**
 * `capitalize` is opt-in. Applied to everything it title-cases each word, which
 * turns a real job title such as "Head of People" into "Head Of People"; it is
 * only correct for the lowercase enum values stored for employment status.
 */
function Fact(
  { label, value, capitalize = false }:
  { label: string; value: string; capitalize?: boolean },
) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-fg-subtle">{label}</dt>
      <dd className={`mt-0.5 break-words text-sm font-medium text-fg${capitalize ? " capitalize" : ""}`}>
        {value}
      </dd>
    </div>
  );
}

function AttendanceRow({ entry }: { entry: EmployeeAttendanceEntry }) {
  return (
    <li className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
      <div className="min-w-0">
        <p className="text-sm font-medium text-fg">{formatDate(entry.attendanceDate)}</p>
        <p className="mt-0.5 text-xs tabular-nums text-fg-subtle">
          {formatTime(entry.checkInTime)} – {formatTime(entry.checkOutTime)}
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
    <li className="py-3 first:pt-0 last:pb-0">
      <div className="flex items-center justify-between gap-2">
        <p className="min-w-0 truncate text-sm font-medium text-fg">
          {leaveTypeMeta(leave.leaveType).label} leave
        </p>
        <StatusBadge {...leaveStatusMeta(leave.status)} />
      </div>

      <p className="mt-0.5 text-xs text-fg-subtle">
        {formatDateRange(leave.startDate, leave.endDate)} · {formatLeaveDuration(leave)}
      </p>

      {leave.adminComment && (
        <p className="mt-1 text-xs text-fg-muted">Admin: {leave.adminComment}</p>
      )}
    </li>
  );
}
