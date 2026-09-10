import {
  Building2,
  CalendarDays,
  CalendarOff,
  Clock3,
  UserPlus,
  Users,
  UsersRound,
  Wallet,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { getApiErrorMessage } from "../../api/axios";
import { getAdminDashboard } from "../../api/dashboardApi";
import { getAllLeaveRequests } from "../../api/leaveApi";
import Alert from "../../components/ui/Alert";
import Avatar from "../../components/ui/Avatar";
import ErrorState from "../../components/ui/ErrorState";
import EmptyState from "../../components/ui/EmptyState";
import LinkButton from "../../components/ui/LinkButton";
import PageHeader from "../../components/ui/PageHeader";
import ProgressBar from "../../components/ui/ProgressBar";
import SegmentedBar, {
  type BarSegment,
} from "../../components/ui/SegmentedBar";
import SectionCard from "../../components/ui/SectionCard";
import Skeleton, { SkeletonText } from "../../components/ui/Skeleton";
import StatCard from "../../components/ui/StatCard";
import StatusBadge from "../../components/ui/StatusBadge";
import type { AdminDashboardData } from "../../types/dashboard";
import { formatPeriod, formatSen } from "../../types/payroll";
import type { LeaveType } from "../../types/leave";
import { formatDate } from "../../utils/datetime";
import {
  attendanceStatusMeta,
  leaveStatusMeta,
  leaveTypeMeta,
} from "../../utils/status";

type LeaveSummaryState = "loading" | "ready" | "failed";

type LeaveTypeCounts = Record<LeaveType, number>;

const emptyLeaveCounts: LeaveTypeCounts = {
  annual: 0,
  medical: 0,
  emergency: 0,
  unpaid: 0,
};

const leaveTypeOrder: LeaveType[] = [
  "annual",
  "medical",
  "emergency",
  "unpaid",
];

/** Same tones the payroll page uses, so a period reads consistently. */
function payrollTone(status: string | undefined) {
  if (status === "paid") return "primary" as const;
  if (status === "approved") return "success" as const;
  if (status === "reviewed") return "warning" as const;
  if (status === "calculated") return "info" as const;
  return "neutral" as const;
}

export default function AdminDashboardPage() {
  const [dashboard, setDashboard] = useState<AdminDashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  const [leaveCounts, setLeaveCounts] =
    useState<LeaveTypeCounts>(emptyLeaveCounts);
  const [leaveSummaryState, setLeaveSummaryState] =
    useState<LeaveSummaryState>("loading");

  useEffect(() => {
    async function loadDashboard() {
      try {
        const data = await getAdminDashboard();
        setDashboard(data);
      } catch (requestError) {
        setError(
          getApiErrorMessage(requestError, "Unable to load admin dashboard."),
        );
      } finally {
        setIsLoading(false);
      }
    }

    void loadDashboard();
  }, []);

  /**
   * Second, independent request against the existing /leaves endpoint. It owns
   * its own state and never writes to `error` or `isLoading`, so a failure
   * degrades exactly one card rather than blanking a dashboard whose primary
   * payload arrived fine.
   */
  const loadLeaveSummary = useCallback(async () => {
    setLeaveSummaryState("loading");

    try {
      const leaves = await getAllLeaveRequests();

      const counts = leaves.reduce<LeaveTypeCounts>(
        (totals, leave) => {
          totals[leave.leaveType] += 1;
          return totals;
        },
        { ...emptyLeaveCounts },
      );

      setLeaveCounts(counts);
      setLeaveSummaryState("ready");
    } catch {
      setLeaveSummaryState("failed");
    }
  }, []);

  useEffect(() => {
    void loadLeaveSummary();
  }, [loadLeaveSummary]);

  // The page keeps its header and its grid while loading. Blanking to a line
  // of text made every visit flash an empty screen before the tiles appeared.
  if (isLoading) {
    return (
      <section className="mx-auto max-w-7xl space-y-6">
        <PageHeader
          title="Admin dashboard"
          description="Overview of employees, attendance, and leave activity."
        />
        <div
          className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4"
          aria-busy="true"
        >
          {/* One live message for the whole region. The skeletons themselves
              are aria-hidden, so this is what a screen reader hears. */}
          <p className="sr-only" aria-live="polite">
            Loading dashboard
          </p>
          {Array.from({ length: 4 }, (_, index) => (
            <div
              key={index}
              className="rounded-card border border-line bg-surface p-5 shadow-card"
            >
              <Skeleton className="h-4 w-28" />
              <Skeleton className="mt-4 h-8 w-16" />
            </div>
          ))}
        </div>
        <div className="grid gap-5 lg:grid-cols-2">
          {Array.from({ length: 2 }, (_, index) => (
            <div
              key={index}
              className="rounded-card border border-line bg-surface p-5 shadow-card"
            >
              <Skeleton className="h-4 w-40" />
              <SkeletonText lines={4} className="mt-5" />
            </div>
          ))}
        </div>
      </section>
    );
  }

  if (error || !dashboard) {
    return (
      <section className="mx-auto max-w-7xl space-y-6">
        <PageHeader
          title="Admin dashboard"
          description="Overview of employees, attendance, and leave activity."
        />
        <SectionCard>
          <ErrorState
            title="The dashboard could not be loaded"
            description={error || "No dashboard data was returned."}
          />
        </SectionCard>
      </section>
    );
  }

  const { attendanceToday, recentEmployees, recentAttendance, recentLeaves } =
    dashboard;

  // Ordered so green and red are never adjacent on the ring, which is what
  // makes the segments distinguishable with red-green colour blindness.
  const attendanceSegments: BarSegment[] = [
    {
      key: "present",
      value: attendanceToday.present,
      ...attendanceStatusMeta("present"),
    },
    { key: "late", value: attendanceToday.late, ...attendanceStatusMeta("late") },
    {
      key: "on_leave",
      value: attendanceToday.onLeave,
      ...attendanceStatusMeta("on_leave"),
    },
    {
      key: "absent",
      value: attendanceToday.absent,
      ...attendanceStatusMeta("absent"),
    },
  ];

  const totalLeaves = leaveTypeOrder.reduce(
    (sum, leaveType) => sum + leaveCounts[leaveType],
    0,
  );

  return (
    <section className="mx-auto max-w-7xl space-y-6">
      <PageHeader
        title="Admin dashboard"
        description="Overview of employees, attendance, and leave activity."
      />

      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Total employees"
          value={dashboard.totalEmployees}
          icon={Users}
          tone="primary"
          to="/admin/employees"
        />

        <StatCard
          label="Active employees"
          value={dashboard.activeEmployees}
          icon={UsersRound}
          tone="success"
          hint={
            dashboard.totalEmployees > 0
              ? `${Math.round((dashboard.activeEmployees / dashboard.totalEmployees) * 100)}% of ${dashboard.totalEmployees}`
              : undefined
          }
          // Both figures come from the payload, so this is a measured share
          // rather than a trend - the references show deltas against last
          // month, which nothing here reports.
          footer={
            dashboard.totalEmployees > 0 ? (
              <ProgressBar
                size="sm"
                tone="success"
                value={dashboard.activeEmployees}
                max={dashboard.totalEmployees}
                label={`${dashboard.activeEmployees} of ${dashboard.totalEmployees} employees active`}
                isDecorative
              />
            ) : undefined
          }
          to="/admin/employees"
        />

        <StatCard
          label="Departments"
          value={dashboard.departments}
          icon={Building2}
          tone="info"
          to="/admin/departments"
        />

        <StatCard
          label="Pending leaves"
          value={dashboard.pendingLeaves}
          icon={Clock3}
          tone={dashboard.pendingLeaves > 0 ? "warning" : "neutral"}
          hint={
            dashboard.pendingLeaves > 0
              ? "Awaiting your decision"
              : "Nothing awaiting a decision"
          }
          to="/admin/leave"
        />
      </div>

      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard
          label="On leave today"
          value={dashboard.onLeaveToday}
          icon={CalendarDays}
          tone={dashboard.onLeaveToday > 0 ? "info" : "neutral"}
          hint={`Approved leave covering ${dashboard.today}`}
          to="/admin/leave"
        />

        <StatCard
          label="Not clocked in"
          value={dashboard.notClockedIn}
          icon={Clock3}
          tone={dashboard.notClockedIn > 0 ? "warning" : "success"}
          hint="Employed, no record today, not on approved leave"
          to="/admin/attendance"
        />

        <StatCard
          label="Current payroll"
          value={
            dashboard.payrollStatus
              ? formatPeriod(
                  dashboard.payrollStatus.periodYear,
                  dashboard.payrollStatus.periodMonth,
                )
              : "No period"
          }
          icon={Wallet}
          tone={payrollTone(dashboard.payrollStatus?.status)}
          hint={
            dashboard.payrollStatus
              ? `${dashboard.payrollStatus.status} · ${dashboard.payrollStatus.records} employees · net ${formatSen(dashboard.payrollStatus.netSen)}`
              : "Open a payroll period to begin"
          }
          to="/admin/payroll"
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <SectionCard
          title="Today's attendance"
          icon={Clock3}
          actions={
            <LinkButton to="/admin/attendance" variant="secondary" size="sm">
              View attendance
            </LinkButton>
          }
        >
          <SegmentedBar
            title="Today's attendance by status"
            unit="records recorded today"
            segments={attendanceSegments}
          />
        </SectionCard>

        <SectionCard
          title="Leave by type"
          description="All time, all statuses."
          icon={CalendarDays}
          actions={
            <LinkButton to="/admin/leave" variant="secondary" size="sm">
              View leave
            </LinkButton>
          }
        >
          {leaveSummaryState === "loading" ? (
            <p className="text-sm text-fg-muted">Loading leave summary...</p>
          ) : leaveSummaryState === "failed" ? (
            <Alert tone="warning">
              The leave type summary could not be loaded. The rest of this
              dashboard is unaffected.
            </Alert>
          ) : totalLeaves === 0 ? (
            <EmptyState
              icon={CalendarOff}
              title="No leave requests yet"
              description="Counts will appear here once employees start applying."
            />
          ) : (
            <ul className="space-y-4">
              {leaveTypeOrder.map((leaveType) => {
                const meta = leaveTypeMeta(leaveType);
                const count = leaveCounts[leaveType];
                const share = Math.round((count / totalLeaves) * 100);

                return (
                  <li key={leaveType}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <StatusBadge {...meta} />

                      <p className="text-sm text-fg-muted">
                        <span className="font-semibold text-fg">{count}</span>{" "}
                        <span className="text-xs tabular-nums text-fg-subtle">
                          ({share}%)
                        </span>
                      </p>
                    </div>

                    {/* Decoration only - the count and percentage above are
                        the actual figures, so this carries no unique meaning. */}
                    <ProgressBar
                      className="mt-2"
                      size="sm"
                      tone={meta.tone}
                      value={count}
                      max={totalLeaves}
                      label={`${count} ${meta.label} requests of ${totalLeaves}`}
                      isDecorative
                    />
                  </li>
                );
              })}

              <li className="border-t border-line pt-3 text-sm text-fg-muted">
                <span className="font-semibold text-fg">{totalLeaves}</span>{" "}
                leave requests in total
              </li>
            </ul>
          )}
        </SectionCard>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <SectionCard
          title="Recent employees"
          icon={UserPlus}
          padded={recentEmployees.length > 0}
        >
          {recentEmployees.length === 0 ? (
            <EmptyState icon={Users} title="No employees found" />
          ) : (
            <ul className="space-y-3">
              {recentEmployees.map((employee) => (
                <li
                  key={employee.id}
                  className="flex items-center gap-3 border-b border-line pb-3 last:border-0 last:pb-0"
                >
                  {/* The dashboard payload carries no profile image, so this
                      is always initials - real data rather than a stand-in. */}
                  <Avatar name={employee.fullName} size="sm" />

                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-fg">
                      {employee.fullName}
                    </p>

                    <p className="mt-0.5 truncate text-xs text-fg-subtle">
                      {employee.employeeNumber}
                      {employee.jobTitle ? ` · ${employee.jobTitle}` : ""}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        <SectionCard
          title="Recent attendance"
          icon={Clock3}
          padded={recentAttendance.length > 0}
        >
          {recentAttendance.length === 0 ? (
            <EmptyState icon={Clock3} title="No attendance records found" />
          ) : (
            <ul className="space-y-3">
              {recentAttendance.map((attendance) => (
                <li
                  key={attendance.id}
                  className="border-b border-line pb-3 last:border-0 last:pb-0"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="min-w-0 truncate text-sm font-medium text-fg">
                      {attendance.employeeName}
                    </p>

                    <StatusBadge {...attendanceStatusMeta(attendance.status)} />
                  </div>

                  <p className="mt-1 text-xs text-fg-subtle">
                    {formatDate(attendance.attendanceDate)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        <SectionCard
          title="Recent leave requests"
          icon={CalendarDays}
          padded={recentLeaves.length > 0}
        >
          {recentLeaves.length === 0 ? (
            <EmptyState icon={CalendarOff} title="No leave requests found" />
          ) : (
            <ul className="space-y-3">
              {recentLeaves.map((leave) => (
                <li
                  key={leave.id}
                  className="border-b border-line pb-3 last:border-0 last:pb-0"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="min-w-0 truncate text-sm font-medium text-fg">
                      {leave.employeeName ?? "—"}
                    </p>

                    <StatusBadge {...leaveStatusMeta(leave.status)} />
                  </div>

                  <p className="mt-1 text-xs text-fg-subtle">
                    {leaveTypeMeta(leave.leaveType).label} ·{" "}
                    {formatDate(leave.startDate)} &rarr;{" "}
                    {formatDate(leave.endDate)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>
    </section>
  );
}
