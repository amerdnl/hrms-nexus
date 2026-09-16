import {
  ArrowUp,
  CalendarDays,
  CalendarPlus,
  ClipboardCheck,
  Clock3,
  FileText,
  Megaphone,
  TrendingUp,
  UserMinus,
  UserPlus,
  Users,
} from "lucide-react";
import { lazy, Suspense, useEffect, useState } from "react";
import { getAuditLog } from "../../api/auditApi";
import { getAdminDashboard } from "../../api/dashboardApi";
import { getEmployees } from "../../api/employeeApi";
import DashboardSkeleton from "../../components/dashboard/DashboardSkeleton";
import EditDashboardButton from "../../components/dashboard/EditDashboardButton";
import { useDashboardLayout } from "../../components/dashboard/useDashboardLayout";
import ActivityCard from "../../components/home/ActivityCard";
import { QUIET_ACTIONS, toActivity } from "../../components/home/adminActivity";
import BrandCard from "../../components/home/BrandCard";
import HomeGreeting from "../../components/home/HomeGreeting";
import HomeMountain from "../../components/home/HomeMountain";
import InsightsCard from "../../components/home/InsightsCard";
import KpiCard from "../../components/home/KpiCard";
import Sparkline from "../../components/home/Sparkline";
import SplitAction from "../../components/home/SplitAction";
import TasksCard from "../../components/home/TasksCard";
import TodayCard from "../../components/home/TodayCard";
import WhosOutCard from "../../components/home/WhosOutCard";
import { givenName } from "../../components/home/homeTime";
import { useCompanyCalendar } from "../../components/home/useCompanyCalendar";
import { useAuth } from "../../context/useAuth";
import type { AdminDashboardData } from "../../types/dashboard";
import type { AuditEvent } from "../../types/audit";

const DashboardCanvas = lazy(() => import("../../components/dashboard/DashboardCanvas"));

const percentOf = (part: number, whole: number) => (whole > 0 ? `${Math.round((part / whole) * 100)}%` : "0%");

/**
 * HR's Home: the company command center, in the approved reference's
 * composition. Every figure, name and entry on it comes from a V3 endpoint
 * HR is already authorised for; each card loads and fails on its own, so one
 * slow source never blanks the page.
 *
 * Below the greeting, an account that has saved a personalised layout sees its
 * widgets instead; every other account sees the approved default, unchanged.
 */
export default function AdminDashboardPage() {
  const { user } = useAuth();
  const home = useDashboardLayout();

  return (
    <div className="relative mx-auto w-full max-w-[89rem]">
      {/* The mountain: beside the greeting as the reference places it from
          80rem; to the right of it from md; a quiet band above it on a phone,
          where it would otherwise sit behind the text. */}
      <HomeMountain wide className="absolute -top-10 left-[29.1%] hidden w-[46.9%] min-[80rem]:block" />
      <HomeMountain className="absolute -top-4 right-0 hidden w-[46%] md:block min-[80rem]:hidden" />
      <HomeMountain className="-mt-2 mb-1 w-full max-w-md opacity-90 md:hidden" />

      <div className="relative pb-8 pt-2 md:pt-8 min-[80rem]:pb-6 min-[80rem]:pt-7">
        <HomeGreeting
          name={user?.employee ? givenName(user.employee.fullName) : null}
          lines={["People build great workplaces.", "Let’s keep things moving."]}
          action={
            <>
              <SplitAction
                primary={{ label: "Add employee", to: "/admin/employees/new", icon: UserPlus }}
                more={[
                  { label: "New announcement", to: "/admin/announcements/new", icon: Megaphone },
                  { label: "Start onboarding", to: "/admin/onboarding", icon: ClipboardCheck },
                  { label: "Start offboarding", to: "/admin/offboarding", icon: UserMinus },
                  { label: "Review cycles", to: "/admin/performance", icon: TrendingUp },
                  { label: "Company calendar", to: "/calendar", icon: CalendarPlus },
                ]}
              />
              {home.canEdit && !home.editing && <EditDashboardButton onClick={home.startEditing} />}
            </>
          }
        />
      </div>

      {home.showCustom ? (
        <Suspense fallback={<DashboardSkeleton />}>
          <DashboardCanvas home={home} />
        </Suspense>
      ) : (
        <AdminDefaultHome />
      )}
    </div>
  );
}

/** The approved default below the greeting, exactly as reviewed. */
function AdminDefaultHome() {
  const [dashboard, setDashboard] = useState<AdminDashboardData | null>(null);
  const [dashboardFailed, setDashboardFailed] = useState(false);
  const [joiners, setJoiners] = useState<number[] | null>(null);
  const [activity, setActivity] = useState<{ state: "loading" | "ready" | "failed"; events: AuditEvent[] }>({ state: "loading", events: [] });
  const [names, setNames] = useState<Map<number, string>>(new Map());
  const { state: calendarState, calendar } = useCompanyCalendar(14);

  useEffect(() => {
    getAdminDashboard().then(setDashboard).catch(() => setDashboardFailed(true));
    // The newest 100 (the API's page limit): sign-ins vastly outnumber company
    // changes, and they are filtered out here rather than by the server.
    getAuditLog({ pageSize: 100 })
      .then((page) => setActivity({ state: "ready", events: page.events.filter((event) => !QUIET_ACTIONS.has(event.action)).slice(0, 3) }))
      .catch(() => setActivity({ state: "failed", events: [] }));
  }, []);

  // Joiners per month for the last six months, from each record's employment
  // date - the real count behind "+n this month". The sparkline draws their
  // running total, which reads as the trend it is rather than as spikes.
  const today = dashboard?.today ?? calendar?.config.today ?? null;
  useEffect(() => {
    if (!today) return;
    getEmployees()
      .then((page) => {
        const months = Array.from({ length: 6 }, (_, index) => {
          const date = new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 1 - (5 - index), 1));
          return date.toISOString().slice(0, 7);
        });
        setJoiners(months.map((month) => page.employees.filter((employee) => employee.employmentDate?.startsWith(month)).length));
        setNames(new Map(page.employees.map((employee) => [employee.id, employee.fullName])));
      })
      .catch(() => setJoiners(null));
  }, [today]);

  const total = dashboard?.totalEmployees ?? 0;
  const joinedThisMonth = joiners?.[joiners.length - 1] ?? null;

  return (
    <>
      <div className="grid gap-4 [&>*]:min-w-0 min-[80rem]:grid-cols-[minmax(0,1fr)_21.07%] min-[80rem]:gap-x-3.5 min-[80rem]:gap-y-3">
        <div className="min-w-0 space-y-4 min-[80rem]:space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:gap-4 [&>*]:min-w-0 lg:grid-cols-4 min-[90rem]:mr-4 min-[80rem]:grid-cols-[1.19fr_1fr_0.945fr_1fr] min-[80rem]:gap-3">
            <KpiCard
              icon={Users}
              tint="teal"
              label="Total employees"
              value={dashboard?.totalEmployees ?? "—"}
              isLoading={!dashboard && !dashboardFailed}
              to="/people"
              detail={
                joinedThisMonth && joinedThisMonth > 0 ? (
                  <span className="inline-flex items-center gap-1 text-success-fg">
                    <ArrowUp size={13} aria-hidden="true" />+{joinedThisMonth} this month
                  </span>
                ) : dashboard ? `${dashboard.activeEmployees} active` : undefined
              }
              aside={joiners ? (
                <>
                  <span className="sr-only">Joined per month over six months: {joiners.join(", ")}</span>
                  <Sparkline values={joiners.map((_, index) => joiners.slice(0, index + 1).reduce((sum, count) => sum + count, 0))} />
                </>
              ) : undefined}
            />
            <KpiCard
              icon={CalendarDays}
              tint="blue"
              label="On leave today"
              value={dashboard?.onLeaveToday ?? "—"}
              isLoading={!dashboard && !dashboardFailed}
              detail={dashboard ? `${percentOf(dashboard.onLeaveToday, total)} of total` : undefined}
              to={dashboard ? `/calendar?date=${dashboard.today}` : "/calendar"}
              showArrow
            />
            <KpiCard
              icon={Clock3}
              tint="amber"
              label="Late today"
              value={dashboard?.attendanceToday.late ?? "—"}
              isLoading={!dashboard && !dashboardFailed}
              detail={dashboard ? `${percentOf(dashboard.attendanceToday.late, total)} of total` : undefined}
              to="/admin/attendance"
              showArrow
            />
            <KpiCard
              icon={FileText}
              tint="rose"
              label="Pending requests"
              value={dashboard?.pendingLeaves ?? "—"}
              isLoading={!dashboard && !dashboardFailed}
              detail={dashboard ? (dashboard.pendingLeaves > 0 ? "Requires attention" : "Nothing waiting") : undefined}
              to="/admin/leave?status=pending"
            />
          </div>
          {dashboardFailed && (
            <p role="alert" className="text-sm text-danger-fg">The company figures could not be loaded. Refresh to try again.</p>
          )}

          <div className="grid gap-4 [&>*]:min-w-0 lg:grid-cols-[minmax(0,2.174fr)_minmax(0,1fr)] min-[80rem]:gap-3.5">
            <TodayCard state={calendarState} calendar={calendar} />
            <TasksCard />
          </div>
        </div>

        <div className="hidden min-[80rem]:flex min-[80rem]:flex-col min-[80rem]:justify-end">
          {/* 328px, bottom-aligned with the Today row, as the reference. */}
          <BrandCard className="h-[20.5rem]" />
        </div>
      </div>

      <div className="mt-4 grid gap-4 [&>*]:min-w-0 md:grid-cols-2 min-[80rem]:mt-3 min-[80rem]:grid-cols-[469fr_450fr_481fr] min-[80rem]:gap-3">
        <WhosOutCard state={calendarState} calendar={calendar} />
        <ActivityCard state={activity.state} entries={activity.events.map((event) => toActivity(event, names))} viewAllTo="/admin/audit" emptyText="No company activity recorded yet." />
        {today ? (
          <InsightsCard today={today} workingDays={calendar?.config.workingDays ?? [1, 2, 3, 4, 5]} className="md:col-span-2 min-[80rem]:col-span-1" />
        ) : (
          <section aria-label="Insights" className="rounded-card border border-line bg-surface p-6 shadow-card md:col-span-2 min-[80rem]:col-span-1">
            <h2 className="text-[1.0625rem] font-semibold text-fg">Insights</h2>
            <p className="mt-4 text-sm text-fg-muted">{dashboardFailed ? "Insights could not be loaded." : "Loading…"}</p>
          </section>
        )}
      </div>
    </>
  );
}
