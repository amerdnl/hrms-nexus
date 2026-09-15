import { Award, Clock3, Inbox, LogIn, LogOut, Target, Users, Wallet, CalendarDays } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { getApiErrorMessage } from "../../api/axios";
import { getEmployeeDashboard } from "../../api/dashboardApi";
import { getActionCenter } from "../../api/workplaceApi";
import VerifiedClockPanel from "../../components/attendance/VerifiedClockPanel";
import ActionsCard from "../../components/home/ActionsCard";
import GoalsCard from "../../components/home/GoalsCard";
import HomeGreeting from "../../components/home/HomeGreeting";
import HomeMountain from "../../components/home/HomeMountain";
import KpiCard from "../../components/home/KpiCard";
import LeaveCard from "../../components/home/LeaveCard";
import RecognitionCard from "../../components/home/RecognitionCard";
import SplitAction from "../../components/home/SplitAction";
import TeamCard from "../../components/home/TeamCard";
import TodayCard from "../../components/home/TodayCard";
import UpdatesCard from "../../components/home/UpdatesCard";
import { formatClock, givenName } from "../../components/home/homeTime";
import { useCompanyCalendar } from "../../components/home/useCompanyCalendar";
import Alert from "../../components/ui/Alert";
import { useAuth } from "../../context/useAuth";
import { useMediaQuery } from "../../hooks/useMediaQuery";
import type { EmployeeDashboardData } from "../../types/dashboard";
import { formatSen } from "../../types/payroll";
import type { ActionCenter } from "../../types/workplace";
import { calcWorkMinutes, formatWorkHours } from "../../utils/attendance";
import { attendanceStatusMeta } from "../../utils/status";

type ClockMode = "check-in" | "check-out";

const shortPeriod = (year: number, month: number) =>
  new Intl.DateTimeFormat("en-US", { month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(year, month - 1, 1)));

/**
 * The employee's Home: the same design language as HR's, arranged around one
 * person's day rather than the company's - am I checked in, what needs me,
 * what is on today, my leave, my goals, what the company is saying, and who
 * thanked me. A manager additionally sees their team today; nothing here is an
 * administration surface, and every card is the account's own data.
 */
export default function EmployeeDashboardPage() {
  const { user } = useAuth();
  const [dashboard, setDashboard] = useState<EmployeeDashboardData | null>(null);
  const [dashboardError, setDashboardError] = useState("");
  const [actions, setActions] = useState<ActionCenter | null>(null);
  const [actionsFailed, setActionsFailed] = useState(false);
  const [clockMode, setClockMode] = useState<ClockMode | null>(null);
  const [message, setMessage] = useState("");
  const { state: calendarState, calendar } = useCompanyCalendar(14);
  // From 80rem the leave card is the right-hand column, as HR's brand card is;
  // narrower, it joins the bottom grid so it never stretches into a page-wide strip.
  const isWide = useMediaQuery("(min-width: 80rem)");

  const load = useCallback(async () => {
    setDashboardError("");
    try {
      setDashboard(await getEmployeeDashboard());
    } catch (error) {
      // A failed reload is never shown as current information.
      setDashboard(null);
      setDashboardError(getApiErrorMessage(error, "Your day could not be loaded."));
    }
  }, []);

  useEffect(() => {
    void load();
    getActionCenter().then(setActions).catch(() => setActionsFailed(true));
  }, [load]);

  const attendance = dashboard?.todayAttendance ?? null;
  const checkedIn = Boolean(attendance?.checkInTime);
  const checkedOut = Boolean(attendance?.checkOutTime);
  const next: ClockMode | null = !dashboard ? null : !checkedIn ? "check-in" : !checkedOut ? "check-out" : null;
  const annual = dashboard?.leaveBalances?.find((balance) => balance.leaveType === "annual") ?? null;
  const balancesUnavailable = dashboard?.unavailable.includes("leaveBalances") ?? false;
  const payslipUnavailable = dashboard?.unavailable.includes("payslip") ?? false;
  const payslip = dashboard?.latestPayslip ?? null;
  const actionCount = actions?.requiresAction.length ?? 0;
  const loading = !dashboard && !dashboardError;

  const attendanceAside = dashboard ? (
    <div className="text-left sm:text-right">
      <p className="text-[0.9375rem] font-medium text-feature-fg">
        {!checkedIn ? "Not checked in" : !checkedOut ? `Checked in ${formatClock(attendance!.checkInTime!)}` : "Done for today"}
      </p>
      <p className="mt-1 text-[0.8125rem] text-feature-muted">
        {!checkedIn
          ? "Verified with the office QR code"
          : !checkedOut
            ? attendance?.verificationStatus === "verified" ? "Verified check-in" : attendanceStatusMeta(attendance!.status).label
            : `${formatWorkHours(calcWorkMinutes(attendance?.checkInTime, attendance?.checkOutTime))} worked`}
      </p>
      {next && (
        <button
          type="button"
          onClick={() => { setClockMode(next); setMessage(""); }}
          disabled={clockMode !== null}
          className="mt-3 inline-flex h-9 items-center gap-2 rounded-full bg-white px-4 text-sm font-medium text-[#0b1b2e] transition-colors hover:bg-white/90 disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7fd3bf]"
        >
          {next === "check-in" ? <LogIn size={15} aria-hidden="true" /> : <LogOut size={15} aria-hidden="true" />}
          {next === "check-in" ? "Check in" : "Check out"}
        </button>
      )}
    </div>
  ) : undefined;

  // Below 80rem the tall leave card spans two rows beside the next two cards,
  // and the last card takes the full width, so no card ends in an empty gap.
  const bottomCards = [
    ...(isWide ? [] : [<LeaveCard key="leave" dashboard={dashboard} className="md:row-span-2" />]),
    ...(user?.isManager
      ? [<TeamCard key="team" />, <GoalsCard key="goals" />, <UpdatesCard key="updates" className={isWide ? undefined : "md:col-span-2"} />]
      : [<GoalsCard key="goals" />, <UpdatesCard key="updates" />, <RecognitionCard key="recognition" className={isWide ? undefined : "md:col-span-2"} />]),
  ];

  const name = dashboard?.employee.fullName ?? user?.employee?.fullName ?? null;

  return (
    <div className="relative mx-auto w-full max-w-[89rem]">
      <HomeMountain wide className="absolute -top-10 left-[29.1%] hidden w-[46.9%] min-[80rem]:block" />
      <HomeMountain className="absolute -top-4 right-0 hidden w-[46%] md:block min-[80rem]:hidden" />
      <HomeMountain className="-mt-2 mb-1 w-full max-w-md opacity-90 md:hidden" />

      <div className="relative pb-8 pt-2 md:pt-8 min-[80rem]:pb-6 min-[80rem]:pt-7">
        <HomeGreeting
          name={name ? givenName(name) : null}
          lines={["Here’s your day at a glance.", "Let’s keep things moving."]}
          action={
            <SplitAction
              primary={{ label: "Request leave", to: "/employee/leave", icon: CalendarDays }}
              more={[
                { label: "Recognise someone", to: "/recognition", icon: Award },
                { label: "My goals", to: "/goals", icon: Target },
                { label: "My payslips", to: "/employee/payroll", icon: Wallet },
                { label: "Find a colleague", to: "/people", icon: Users },
              ]}
            />
          }
        />
      </div>

      {dashboardError && (
        <Alert tone="danger" className="mb-4">
          {dashboardError}{" "}
          <button type="button" onClick={() => void load()} className="font-semibold underline">Try again</button>
        </Alert>
      )}
      {message && <Alert tone="success" className="mb-4" onDismiss={() => setMessage("")}>{message}</Alert>}

      <div className="grid gap-4 [&>*]:min-w-0 min-[80rem]:grid-cols-[minmax(0,1fr)_21.07%] min-[80rem]:gap-x-3.5 min-[80rem]:gap-y-3">
        <div className="min-w-0 space-y-4 min-[80rem]:space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:gap-4 [&>*]:min-w-0 lg:grid-cols-4 min-[90rem]:mr-4 min-[80rem]:grid-cols-[1.19fr_1fr_0.945fr_1fr] min-[80rem]:gap-3">
            <KpiCard
              icon={Clock3}
              tint="teal"
              label="Checked in"
              isLoading={loading}
              value={attendance?.checkInTime ? formatClock(attendance.checkInTime) : "Not yet"}
              detail={
                !dashboard ? undefined
                  : attendance?.checkOutTime ? `Out at ${formatClock(attendance.checkOutTime)}`
                    : attendance ? `${attendanceStatusMeta(attendance.status).label}${attendance.verificationStatus === "verified" ? " · verified" : ""}`
                      : "Check in from Today"
              }
              to="/employee/attendance"
              showArrow
            />
            <KpiCard
              icon={CalendarDays}
              tint="blue"
              label="Annual leave left"
              isLoading={loading}
              value={balancesUnavailable ? "—" : annual ? annual.remainingDays : "—"}
              detail={!dashboard ? undefined : balancesUnavailable ? "Could not be loaded" : annual ? `of ${annual.entitledDays} days` : "No annual leave policy"}
              to="/employee/leave"
              showArrow
            />
            <KpiCard
              icon={Inbox}
              tint="amber"
              label="Needs you"
              isLoading={!actions && !actionsFailed}
              value={actionsFailed ? "—" : actionCount}
              detail={actionsFailed ? "Could not be loaded" : actionCount === 0 ? "All caught up" : actions?.requiresAction[0]?.title}
              to="/actions"
            />
            <KpiCard
              icon={Wallet}
              tint="green"
              label="Latest payslip"
              isLoading={loading}
              value={payslipUnavailable ? "—" : payslip ? shortPeriod(payslip.periodYear, payslip.periodMonth) : "None yet"}
              detail={!dashboard ? undefined : payslipUnavailable ? "Could not be loaded" : payslip ? `Net RM ${formatSen(payslip.netSen)}` : "Appears once payroll is approved"}
              to="/employee/payroll"
            />
          </div>

          <div className="grid gap-4 [&>*]:min-w-0 lg:grid-cols-[minmax(0,2.174fr)_minmax(0,1fr)] min-[80rem]:gap-3.5">
            <TodayCard state={calendarState} calendar={calendar} aside={attendanceAside} />
            <ActionsCard data={actions} failed={actionsFailed} />
          </div>

        </div>

        {isWide && (
          <div className="flex flex-col">
            <LeaveCard dashboard={dashboard} className="h-full" />
          </div>
        )}
      </div>

      {/* Below the top grid and full width, so opening it never stretches the
          leave column beside Today. */}
      {clockMode && (
        <div className="mt-4">
          <VerifiedClockPanel
            mode={clockMode}
            onRecorded={() => {
              setMessage(clockMode === "check-in" ? "Checked in successfully." : "Checked out successfully.");
              setClockMode(null);
              // Re-read from the server rather than patching local state, so
              // Home shows what was actually recorded.
              void load();
            }}
            onCancel={() => setClockMode(null)}
          />
        </div>
      )}

      <div className="mt-4 grid gap-4 [&>*]:min-w-0 md:grid-cols-2 min-[80rem]:mt-3 min-[80rem]:grid-cols-[469fr_450fr_481fr] min-[80rem]:gap-3">
        {bottomCards}
      </div>
    </div>
  );
}
