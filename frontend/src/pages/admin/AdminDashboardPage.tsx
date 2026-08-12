import {
  Building2,
  CalendarDays,
  CalendarOff,
  Clock3,
  UserPlus,
  Users,
  UsersRound,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { getApiErrorMessage } from "../../api/axios";
import { getAdminDashboard } from "../../api/dashboardApi";
import { getAllLeaveRequests } from "../../api/leaveApi";
import Alert from "../../components/ui/Alert";
import DonutChart, {
  type DonutSegment,
} from "../../components/ui/DonutChart";
import EmptyState from "../../components/ui/EmptyState";
import LinkButton from "../../components/ui/LinkButton";
import PageHeader from "../../components/ui/PageHeader";
import SectionCard from "../../components/ui/SectionCard";
import StatCard from "../../components/ui/StatCard";
import StatusBadge from "../../components/ui/StatusBadge";
import type { AdminDashboardData } from "../../types/dashboard";
import type { LeaveType } from "../../types/leave";
import { formatDate } from "../../utils/datetime";
import {
  attendanceStatusMeta,
  leaveStatusMeta,
  leaveTypeMeta,
  type StatusTone,
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

/** Solid fills for the proportion bars, matching StatusBadge's tone roles. */
const barToneStyles: Record<StatusTone, string> = {
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
  info: "bg-info",
  primary: "bg-primary",
  neutral: "bg-fg-subtle",
};

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

  if (isLoading) {
    return <p className="text-sm text-fg-muted">Loading dashboard...</p>;
  }

  if (error) {
    return <Alert tone="danger">{error}</Alert>;
  }

  if (!dashboard) {
    return null;
  }

  const { attendanceToday, recentEmployees, recentAttendance, recentLeaves } =
    dashboard;

  // Ordered so green and red are never adjacent on the ring, which is what
  // makes the segments distinguishable with red-green colour blindness.
  const attendanceSegments: DonutSegment[] = [
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
          <DonutChart
            title="Today's attendance by status"
            centerCaption="records"
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
                    <div
                      className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-surface-muted"
                      aria-hidden="true"
                    >
                      <div
                        className={`h-full rounded-full ${barToneStyles[meta.tone]}`}
                        style={{ width: `${share}%` }}
                      />
                    </div>
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
                  className="border-b border-line pb-3 last:border-0 last:pb-0"
                >
                  <p className="truncate text-sm font-medium text-fg">
                    {employee.fullName}
                  </p>

                  <p className="mt-0.5 truncate text-xs text-fg-subtle">
                    {employee.employeeNumber}
                    {employee.jobTitle ? ` · ${employee.jobTitle}` : ""}
                  </p>
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
