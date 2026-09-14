/**
 * The Action Center: work waiting for the current account, computed from the
 * same tables the destination pages read. Nothing is stored, so resolving the
 * underlying record is what clears an item - there is no second list to
 * drift out of date.
 *
 *   requiresAction  something only you (or your role) can move forward
 *   waiting         something of yours that someone else must act on
 *   upcoming        the next 14 days: your leave, your team's, holidays, events
 *   recent          your newest notifications
 *
 * Every query is scoped the way its destination is: a manager's items come
 * from their current direct reports, HR's from the company, an employee's from
 * their own record. Later milestones add lifecycle tasks, goals and reviews to
 * the same shape.
 */
import type { Pool, PoolClient } from "pg";
import pool from "../config/db.js";
import type { AuthenticatedUser } from "../types/auth.js";
import { readerFor, unreadImportant } from "./announcementService.js";
import { calendarConfig, eventsBetween, holidaysBetween } from "./calendarService.js";
import { overdueGoals } from "./goalService.js";
import { myWork, offboardingReadyToComplete } from "./lifecycleService.js";
import { reviewActions } from "./reviewService.js";
import { listFor } from "./notificationService.js";
import { addDays } from "../utils/companyClock.js";
import { formatDateRange, formatMonth, leaveTypeLabel, plural } from "../utils/dateText.js";

type Db = Pick<PoolClient, "query"> | Pool;

export interface ActionItem {
  /** Stable across requests: kind and record, e.g. "leave:12". */
  id: string;
  kind:
    | "leave_decision" | "payroll_step" | "announcement" | "leave_waiting" | "leave_upcoming"
    | "team_out" | "holiday" | "event" | "lifecycle_task" | "offboarding_ready" | "review" | "goal_overdue";
  title: string;
  detail: string | null;
  /** The company date it concerns, when it has one. */
  date: string | null;
  link: string;
  important?: boolean;
}

const UPCOMING_DAYS = 14;

interface PendingLeaveRow {
  id: string;
  employee_id: string;
  full_name: string;
  leave_type: string;
  start_date: string;
  end_date: string;
  working_days: string | null;
}

function leaveDetail(row: PendingLeaveRow): string {
  return `${leaveTypeLabel(row.leave_type)} · ${formatDateRange(row.start_date, row.end_date)} · ${plural(Number(row.working_days ?? 0), "working day")}`;
}

const pendingLeaveSelect = `SELECT lr.id, lr.employee_id, e.full_name, lr.leave_type,
  lr.start_date::text AS start_date, lr.end_date::text AS end_date, lr.working_days
  FROM public.leave_requests lr
  JOIN public.employees e ON e.id = lr.employee_id`;

/** Pending leave for the manager's current direct reports. */
async function teamDecisions(user: AuthenticatedUser, db: Db): Promise<ActionItem[]> {
  if (!user.isManager || user.employeeId === null) return [];
  const result = await db.query<PendingLeaveRow>(
    `${pendingLeaveSelect}
     WHERE lr.status = 'pending' AND e.manager_id = $1 AND e.employment_status IN ('active', 'probation')
     ORDER BY lr.start_date, lr.id
     LIMIT 50`,
    [user.employeeId],
  );
  return result.rows.map((row) => ({
    id: `leave:${row.id}`,
    kind: "leave_decision",
    title: `Decide ${row.full_name}'s leave`,
    detail: leaveDetail(row),
    date: row.start_date,
    link: "/team/leave?status=pending",
  }));
}

/**
 * Pending leave HR must decide: requests with no manager able to decide them
 * (none recorded, the manager has left, or the manager has no usable account).
 * Requests a manager can decide stay with the manager. Never HR's own request.
 */
async function hrDecisions(user: AuthenticatedUser, db: Db): Promise<ActionItem[]> {
  if (user.role !== "admin") return [];
  const result = await db.query<PendingLeaveRow>(
    `${pendingLeaveSelect}
     WHERE lr.status = 'pending'
       AND e.employment_status IN ('active', 'probation')
       AND ($1::int IS NULL OR lr.employee_id <> $1::int)
       AND NOT EXISTS (
         SELECT 1 FROM public.employees m
         JOIN public.users u ON u.employee_id = m.id
         WHERE m.id = e.manager_id
           AND m.employment_status IN ('active', 'probation')
           AND u.is_active = TRUE
       )
     ORDER BY lr.start_date, lr.id
     LIMIT 50`,
    [user.employeeId],
  );
  return result.rows.map((row) => ({
    id: `leave:${row.id}`,
    kind: "leave_decision",
    title: `Decide ${row.full_name}'s leave`,
    detail: `${leaveDetail(row)} · no manager to decide it`,
    date: row.start_date,
    link: "/admin/leave?status=pending",
  }));
}

const payrollNextStep: Record<string, string> = {
  draft: "calculate it",
  calculated: "review it",
  reviewed: "approve it",
  approved: "record the payment",
};

async function payrollSteps(user: AuthenticatedUser, db: Db): Promise<ActionItem[]> {
  if (user.role !== "admin") return [];
  const result = await db.query<{ id: string; period_year: number; period_month: number; status: string }>(
    `SELECT id, period_year, period_month, status FROM public.payroll_periods
     WHERE status IN ('draft', 'calculated', 'reviewed', 'approved')
     ORDER BY period_year, period_month
     LIMIT 12`,
  );
  return result.rows.map((row) => ({
    id: `payroll:${row.id}`,
    kind: "payroll_step",
    title: `Payroll ${formatMonth(Number(row.period_year), Number(row.period_month))}: ${payrollNextStep[row.status]}`,
    detail: `Currently ${row.status}`,
    date: null,
    link: "/admin/payroll",
  }));
}

/**
 * Onboarding and offboarding tasks the caller's roles hold right now, and, for
 * HR, offboarding plans whose last day has come with every task finished.
 */
async function lifecycleActions(user: AuthenticatedUser, db: Db): Promise<ActionItem[]> {
  const work = await myWork(user, db);
  const items: ActionItem[] = work.assigned.map((task) => ({
    id: `lifecycle-task:${task.id}`,
    kind: "lifecycle_task",
    title: task.title,
    detail: `${task.isOwnPlan ? `Your ${task.kind}` : `${task.employeeName}'s ${task.kind}`}${task.overdue ? " · overdue" : ""}`,
    date: task.dueOn,
    link: "/tasks",
    important: task.overdue,
  }));
  if (user.role === "admin") {
    for (const ready of await offboardingReadyToComplete(db)) {
      items.push({
        id: `offboarding:${ready.planId}`,
        kind: "offboarding_ready",
        title: `Complete ${ready.employeeName}'s offboarding`,
        detail: "Every task is finished and the last working day has come",
        date: ready.targetDate,
        link: `/admin/lifecycle/plans/${ready.planId}`,
      });
    }
  }
  return items;
}

/** Reviews to write, reports to review, cycles running late, and your own overdue goals. */
async function performanceActions(user: AuthenticatedUser, db: Db): Promise<ActionItem[]> {
  const reviews: ActionItem[] = (await reviewActions(user, db)).map((item) => ({
    id: item.id, kind: "review", title: item.title, detail: item.detail, date: item.date, link: item.link, important: item.overdue,
  }));
  const goals: ActionItem[] = (await overdueGoals(user, db)).map((goal) => ({
    id: `goal:${goal.id}`, kind: "goal_overdue", title: `Goal past due: ${goal.title}`,
    detail: `${goal.progress}% done`, date: goal.dueOn, link: `/goals/${goal.id}`,
  }));
  return [...reviews, ...goals];
}

async function ownPendingLeave(user: AuthenticatedUser, db: Db): Promise<ActionItem[]> {
  if (user.employeeId === null) return [];
  const result = await db.query<PendingLeaveRow & { manager_name: string | null }>(
    `SELECT lr.id, lr.employee_id, e.full_name, lr.leave_type,
            lr.start_date::text AS start_date, lr.end_date::text AS end_date, lr.working_days,
            m.full_name AS manager_name
     FROM public.leave_requests lr
     JOIN public.employees e ON e.id = lr.employee_id
     LEFT JOIN public.employees m ON m.id = e.manager_id AND m.employment_status IN ('active', 'probation')
     WHERE lr.status = 'pending' AND lr.employee_id = $1
     ORDER BY lr.start_date, lr.id
     LIMIT 20`,
    [user.employeeId],
  );
  return result.rows.map((row) => ({
    id: `leave:${row.id}`,
    kind: "leave_waiting",
    title: `Leave request waiting for ${row.manager_name ?? "HR"}`,
    detail: leaveDetail(row),
    date: row.start_date,
    link: user.role === "employee" ? "/employee/leave" : "/calendar",
  }));
}

async function upcoming(user: AuthenticatedUser, today: string, db: Db): Promise<ActionItem[]> {
  const until = addDays(today, UPCOMING_DAYS);
  const items: ActionItem[] = [];

  if (user.employeeId !== null) {
    const own = await db.query<PendingLeaveRow>(
      `${pendingLeaveSelect}
       WHERE lr.status = 'approved' AND lr.employee_id = $1 AND lr.end_date >= $2::date AND lr.start_date <= $3::date
       ORDER BY lr.start_date LIMIT 10`,
      [user.employeeId, today, until],
    );
    for (const row of own.rows) {
      items.push({
        id: `leave:${row.id}`,
        kind: "leave_upcoming",
        title: row.start_date <= today ? "You are on leave" : "Your leave is coming up",
        detail: leaveDetail(row),
        date: row.start_date < today ? today : row.start_date,
        link: user.role === "employee" ? "/employee/leave" : "/calendar",
      });
    }
  }

  if (user.isManager && user.employeeId !== null) {
    const team = await db.query<PendingLeaveRow>(
      `${pendingLeaveSelect}
       WHERE lr.status = 'approved' AND e.manager_id = $1 AND e.employment_status IN ('active', 'probation')
         AND lr.end_date >= $2::date AND lr.start_date <= $3::date
       ORDER BY lr.start_date, e.full_name LIMIT 20`,
      [user.employeeId, today, until],
    );
    for (const row of team.rows) {
      items.push({
        id: `team-out:${row.id}`,
        kind: "team_out",
        title: `${row.full_name} ${row.start_date <= today ? "is out" : "will be out"}`,
        detail: formatDateRange(row.start_date, row.end_date),
        date: row.start_date < today ? today : row.start_date,
        link: "/calendar?team=1",
      });
    }
  }

  for (const holiday of await holidaysBetween(today, until, db)) {
    items.push({
      id: `holiday:${holiday.id}`,
      kind: "holiday",
      title: holiday.name,
      detail: "Company holiday",
      date: holiday.date,
      link: `/calendar?date=${holiday.date}`,
    });
  }
  for (const event of await eventsBetween(today, until, db)) {
    items.push({
      id: `event:${event.id}`,
      kind: "event",
      title: event.title,
      detail: [event.startTime ? `${event.startTime}${event.endTime ? `–${event.endTime}` : ""}` : null, event.location]
        .filter(Boolean).join(" · ") || "Company event",
      date: event.startsOn < today ? today : event.startsOn,
      link: `/calendar?date=${event.startsOn < today ? today : event.startsOn}`,
    });
  }

  return items.sort((a, b) => (a.date ?? "").localeCompare(b.date ?? "") || a.title.localeCompare(b.title)).slice(0, 20);
}

export async function actionCenterFor(user: AuthenticatedUser, db: Db = pool) {
  const { today } = await calendarConfig(db);
  const reader = await readerFor(user, db);

  const decisions = [...await teamDecisions(user, db), ...await hrDecisions(user, db)];
  // A request can reach a manager who is also HR through both routes; show it once.
  const seen = new Set<string>();
  const uniqueDecisions = decisions.filter((item) => !seen.has(item.id) && Boolean(seen.add(item.id)));

  const announcements: ActionItem[] = (await unreadImportant(reader, db)).map((announcement) => ({
    id: `announcement:${announcement.id}`,
    kind: "announcement",
    title: `Read: ${announcement.title}`,
    detail: "Important announcement",
    date: null,
    link: `/announcements/${announcement.id}`,
    important: true,
  }));

  const requiresAction = [
    ...announcements, ...uniqueDecisions, ...await lifecycleActions(user, db), ...await performanceActions(user, db),
    ...await payrollSteps(user, db),
  ];
  const recent = await listFor(user.id, { unreadOnly: false, beforeId: null, limit: 5 }, db);

  return {
    today,
    requiresAction,
    waiting: await ownPendingLeave(user, db),
    upcoming: await upcoming(user, today, db),
    recent: recent.items,
    counts: { requiresAction: requiresAction.length },
  };
}
