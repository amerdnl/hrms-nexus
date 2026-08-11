import {
  CalendarDays,
  CalendarOff,
  CalendarPlus,
  Clock3,
  UserRound,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { getApiErrorMessage } from "../../api/axios";
import { getEmployeeDashboard } from "../../api/dashboardApi";
import { getMyLeaveRequests } from "../../api/leaveApi";
import Alert from "../../components/ui/Alert";
import EmptyState from "../../components/ui/EmptyState";
import LinkButton from "../../components/ui/LinkButton";
import PageHeader from "../../components/ui/PageHeader";
import SectionCard from "../../components/ui/SectionCard";
import StatCard from "../../components/ui/StatCard";
import StatusBadge from "../../components/ui/StatusBadge";
import type { EmployeeDashboardData } from "../../types/dashboard";
import type { LeaveRequest } from "../../types/leave";
import { formatDate, formatTime, getMalaysiaDate } from "../../utils/datetime";
import { formatLeaveDaysBetween, findUpcomingLeave } from "../../utils/leave";
import {
  attendanceStatusMeta,
  leaveStatusMeta,
  leaveTypeMeta,
  type StatusMeta,
} from "../../utils/status";

/** Tracked separately from the dashboard request so one cannot mask the other. */
type UpcomingState = "loading" | "ready" | "failed";

const notRecordedMeta: StatusMeta = {
  label: "Not recorded",
  tone: "neutral",
  icon: Clock3,
};

export default function EmployeeDashboardPage() {
  const [dashboard, setDashboard] = useState<EmployeeDashboardData | null>(
    null,
  );
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  const [upcomingLeave, setUpcomingLeave] = useState<LeaveRequest | null>(null);
  const [upcomingState, setUpcomingState] = useState<UpcomingState>("loading");

  useEffect(() => {
    async function loadDashboard() {
      try {
        const data = await getEmployeeDashboard();
        setDashboard(data);
      } catch (requestError) {
        setError(
          getApiErrorMessage(requestError, "Unable to load employee dashboard."),
        );
      } finally {
        setIsLoading(false);
      }
    }

    void loadDashboard();
  }, []);

  /**
   * Upcoming Leave is a second, independent request against the existing
   * /leaves/me endpoint. It deliberately owns its own state and never writes
   * to `error` or `isLoading`, so a failure here degrades exactly one card
   * instead of blanking a dashboard whose primary payload arrived fine.
   */
  const loadUpcomingLeave = useCallback(async () => {
    setUpcomingState("loading");

    try {
      const leaves = await getMyLeaveRequests();

      // Malaysia's date, not the browser's: this must agree with how
      // attendance stamps "today" for a user travelling or on a laptop set
      // to another zone.
      setUpcomingLeave(findUpcomingLeave(leaves, getMalaysiaDate()));
      setUpcomingState("ready");
    } catch {
      setUpcomingState("failed");
    }
  }, []);

  useEffect(() => {
    void loadUpcomingLeave();
  }, [loadUpcomingLeave]);

  if (isLoading) {
    return <p className="text-sm text-fg-muted">Loading dashboard...</p>;
  }

  if (error) {
    return <Alert tone="danger">{error}</Alert>;
  }

  if (!dashboard) {
    return null;
  }

  const { employee, todayAttendance, recentAttendance, recentLeaves } =
    dashboard;

  const todayMeta = todayAttendance
    ? attendanceStatusMeta(todayAttendance.status)
    : notRecordedMeta;

  const todayHint = todayAttendance
    ? `In ${formatTime(todayAttendance.checkInTime)} · Out ${formatTime(todayAttendance.checkOutTime)}`
    : "No check-in recorded yet";

  const upcomingCard = buildUpcomingCard(upcomingState, upcomingLeave);

  return (
    <section className="mx-auto max-w-7xl space-y-6">
      <PageHeader
        title={`Welcome, ${employee.fullName}`}
        description={`${employee.jobTitle ?? "Employee"} · ${employee.departmentName ?? "No department"}`}
      />

      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard
          label="Today's attendance"
          value={todayMeta.label}
          icon={todayMeta.icon}
          tone={todayMeta.tone}
          hint={todayHint}
          to="/employee/attendance"
        />

        <StatCard
          label="Pending leave requests"
          value={dashboard.pendingLeaves}
          icon={Clock3}
          tone={dashboard.pendingLeaves > 0 ? "warning" : "neutral"}
          hint={
            dashboard.pendingLeaves > 0
              ? "Awaiting a decision"
              : "Nothing awaiting a decision"
          }
          to="/employee/leave"
        />

        <StatCard
          label="Upcoming leave"
          value={upcomingCard.value}
          icon={upcomingCard.icon}
          tone={upcomingCard.tone}
          hint={upcomingCard.hint}
          isLoading={upcomingState === "loading"}
          to="/employee/leave"
        />
      </div>

      <SectionCard title="Quick links">
        <div className="flex flex-wrap gap-3">
          <LinkButton to="/employee/attendance" variant="secondary" icon={Clock3}>
            Attendance
          </LinkButton>

          <LinkButton to="/employee/leave" variant="secondary" icon={CalendarPlus}>
            Apply leave
          </LinkButton>

          <LinkButton to="/employee/profile" variant="secondary" icon={UserRound}>
            My profile
          </LinkButton>
        </div>
      </SectionCard>

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
              {recentAttendance.map((attendance) => (
                <li
                  key={attendance.id}
                  className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-3 last:border-0 last:pb-0"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-fg">
                      {formatDate(attendance.attendanceDate)}
                    </p>

                    <p className="mt-0.5 text-xs text-fg-subtle">
                      {formatTime(attendance.checkInTime)} &rarr;{" "}
                      {formatTime(attendance.checkOutTime)}
                    </p>
                  </div>

                  <StatusBadge {...attendanceStatusMeta(attendance.status)} />
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
            <EmptyState
              icon={CalendarOff}
              title="No leave requests found"
              description="Requests you submit will be listed here with their status."
            />
          ) : (
            <ul className="space-y-3">
              {recentLeaves.map((leave) => (
                <li
                  key={leave.id}
                  className="border-b border-line pb-3 last:border-0 last:pb-0"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-medium text-fg">
                      {leaveTypeMeta(leave.leaveType).label} leave
                    </p>

                    <StatusBadge {...leaveStatusMeta(leave.status)} />
                  </div>

                  <p className="mt-1 text-xs text-fg-subtle">
                    {formatDate(leave.startDate)} &rarr;{" "}
                    {formatDate(leave.endDate)}
                  </p>

                  {leave.adminComment && (
                    <p className="mt-1 text-xs text-fg-muted">
                      Admin: {leave.adminComment}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>
    </section>
  );
}

interface UpcomingCard {
  value: string;
  hint: string;
  tone: StatusMeta["tone"];
  icon: StatusMeta["icon"];
}

/**
 * The three non-success states are distinguished in text, never by colour or
 * by an empty card: "unavailable" must not be mistaken for "you have no
 * upcoming leave". The card still links to /employee/leave in every state, so
 * a failed request leaves a route to the real data rather than a dead tile.
 */
function buildUpcomingCard(
  state: UpcomingState,
  leave: LeaveRequest | null,
): UpcomingCard {
  if (state === "failed") {
    return {
      value: "Unavailable",
      hint: "Could not be loaded. Open Leave to check.",
      tone: "neutral",
      icon: CalendarOff,
    };
  }

  if (!leave) {
    return {
      value: "None",
      hint: "No approved leave scheduled",
      tone: "neutral",
      icon: CalendarOff,
    };
  }

  const typeMeta = leaveTypeMeta(leave.leaveType);

  return {
    // Inclusive day count, shown for information only - this project has no
    // leave balance, so nothing is deducted from anything.
    value: formatLeaveDaysBetween(leave.startDate, leave.endDate),
    hint: `${typeMeta.label} · ${formatDate(leave.startDate)} – ${formatDate(leave.endDate)}`,
    tone: "info",
    icon: CalendarDays,
  };
}
