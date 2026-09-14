/**
 * Analytics: counts that answer questions people in the product actually ask,
 * computed from the same tables the destination pages read.
 *
 *   company  HR: are onboarding and offboarding on track, how far along is each
 *            review cycle, how are goals going, is recognition reaching people
 *   team     a manager: the same questions for their current direct reports,
 *            plus the leave their team has taken this year
 *
 * Every figure is a count or sum of stored records. Nothing is estimated and
 * there are no period-over-period percentages: at a small company a month's
 * change is noise, and master §22 forbids decorative deltas. Company-wide
 * attendance, leave and payroll figures stay on the V2 reports, which already
 * answer those questions.
 *
 * Scope is the caller's. Team figures are computed from the manager's current
 * reports on every request, count only company-visible recognition (a manager
 * cannot read private thanks), and carry no pay, no review content or ratings,
 * and no names at all. Figures count working employees (active or probation)
 * unless a cycle or plan is being described as a whole.
 */
import type { Pool, PoolClient } from "pg";
import pool from "../config/db.js";
import { addDays, companyToday } from "../utils/companyClock.js";

type Db = Pick<PoolClient, "query"> | Pool;

/** Recognition and completions are counted over the last 90 company days, today included. */
export const WINDOW_DAYS = 90;

const WORKING = "e.employment_status IN ('active', 'probation')";
/** Timestamps are compared as company dates, so a window edge falls where the company's day does. */
const COMPANY_TZ = "COALESCE((SELECT timezone FROM public.company_settings WHERE id = 1), 'UTC')";

export interface GoalCounts {
  active: number;
  completed: number;
  cancelled: number;
  /** Active goals whose due date has passed. */
  overdue: number;
}

export interface LifecycleSummary {
  active: number;
  /** Pending tasks past their due date, on active plans. */
  overdueTasks: number;
  completedInWindow: number;
}

export interface CycleProgress {
  id: number;
  name: string;
  status: "open" | "closed";
  selfDueOn: string;
  managerDueOn: string;
  participants: number;
  pendingSelf: number;
  pendingManager: number;
  completed: number;
}

export interface CategoryCount {
  category: string;
  count: number;
}

export interface ActivePlan {
  id: number;
  kind: "onboarding" | "offboarding";
  title: string;
  employeeName: string;
  targetDate: string;
  /** Done or skipped. */
  tasksFinished: number;
  tasksTotal: number;
  overdueTasks: number;
}

export interface CompanyAnalytics {
  today: string;
  windowStart: string;
  windowDays: number;
  lifecycle: { onboarding: LifecycleSummary; offboarding: LifecycleSummary; plans: ActivePlan[] };
  performance: { goals: GoalCounts; cycles: CycleProgress[] };
  recognition: { total: number; employeesRecognised: number; workingEmployees: number; byCategory: CategoryCount[] };
}

export interface TeamAnalytics {
  today: string;
  windowStart: string;
  windowDays: number;
  teamSize: number;
  goals: GoalCounts;
  reviews: CycleProgress[];
  leave: { year: number; approvedDays: Array<{ leaveType: string; days: number }> };
  recognition: { total: number; byCategory: CategoryCount[] };
  lifecycle: { onboarding: number; offboarding: number };
}

async function goalCounts(db: Db, today: string, managerId: number | null): Promise<GoalCounts> {
  const result = await db.query<GoalCounts>(
    `SELECT count(*) FILTER (WHERE g.status = 'active')::int AS active,
            count(*) FILTER (WHERE g.status = 'completed')::int AS completed,
            count(*) FILTER (WHERE g.status = 'cancelled')::int AS cancelled,
            count(*) FILTER (WHERE g.status = 'active' AND g.due_on < $1::date)::int AS overdue
     FROM public.goals g
     JOIN public.employees e ON e.id = g.owner_employee_id
     WHERE ${WORKING} AND ($2::int IS NULL OR e.manager_id = $2::int)`,
    [today, managerId],
  );
  return result.rows[0]!;
}

/**
 * Company: every cycle that has been opened, open ones first, counting everyone
 * who took part. Team: open cycles only, counting the manager's current reports.
 */
async function cycleProgress(db: Db, managerId: number | null): Promise<CycleProgress[]> {
  const result = await db.query<{
    id: string; name: string; status: "open" | "closed"; self_due_on: string; manager_due_on: string;
    participants: number; pending_self: number; pending_manager: number; completed: number;
  }>(
    `SELECT c.id, c.name, c.status, c.self_due_on::text AS self_due_on, c.manager_due_on::text AS manager_due_on,
            count(p.id)::int AS participants,
            count(p.id) FILTER (WHERE p.status = 'pending_self')::int AS pending_self,
            count(p.id) FILTER (WHERE p.status = 'pending_manager')::int AS pending_manager,
            count(p.id) FILTER (WHERE p.status = 'completed')::int AS completed
     FROM public.review_cycles c
     JOIN public.review_participants p ON p.cycle_id = c.id
     JOIN public.employees e ON e.id = p.employee_id
     WHERE c.status <> 'draft'
       AND ($1::int IS NULL OR (c.status = 'open' AND e.manager_id = $1::int AND ${WORKING}))
     GROUP BY c.id
     ORDER BY (c.status = 'open') DESC, c.period_end DESC, c.id DESC
     LIMIT 6`,
    [managerId],
  );
  return result.rows.map((row) => ({
    id: Number(row.id), name: row.name, status: row.status, selfDueOn: row.self_due_on, managerDueOn: row.manager_due_on,
    participants: row.participants, pendingSelf: row.pending_self, pendingManager: row.pending_manager, completed: row.completed,
  }));
}

/** Visible recognition in the window. For a team, only company-visible thanks to current reports. */
async function recognitionByCategory(db: Db, windowStart: string, managerId: number | null): Promise<CategoryCount[]> {
  const result = await db.query<CategoryCount>(
    `SELECT r.category, count(*)::int AS count
     FROM public.recognitions r
     JOIN public.employees e ON e.id = r.receiver_employee_id
     WHERE r.hidden_at IS NULL AND r.given_on >= $1::date
       AND ($2::int IS NULL OR (e.manager_id = $2::int AND ${WORKING} AND r.visibility = 'company'))
     GROUP BY r.category
     ORDER BY count(*) DESC, r.category`,
    [windowStart, managerId],
  );
  return result.rows;
}

export async function companyAnalytics(db: Db = pool): Promise<CompanyAnalytics> {
  const today = await companyToday(db);
  const windowStart = addDays(today, -(WINDOW_DAYS - 1));

  const lifecycle = await db.query<{ kind: "onboarding" | "offboarding"; active: number; overdue_tasks: number; completed_in_window: number }>(
    `SELECT k.kind,
       (SELECT count(*)::int FROM public.lifecycle_plans p WHERE p.kind = k.kind AND p.status = 'active') AS active,
       (SELECT count(*)::int FROM public.lifecycle_tasks t JOIN public.lifecycle_plans p ON p.id = t.plan_id
          WHERE p.kind = k.kind AND p.status = 'active' AND t.status = 'pending' AND t.due_on < $1::date) AS overdue_tasks,
       (SELECT count(*)::int FROM public.lifecycle_plans p
          WHERE p.kind = k.kind AND p.status = 'completed'
            AND (p.completed_at AT TIME ZONE ${COMPANY_TZ})::date >= $2::date) AS completed_in_window
     FROM (VALUES ('onboarding'), ('offboarding')) AS k(kind)`,
    [today, windowStart],
  );
  const summary = (kind: "onboarding" | "offboarding"): LifecycleSummary => {
    const row = lifecycle.rows.find((entry) => entry.kind === kind)!;
    return { active: row.active, overdueTasks: row.overdue_tasks, completedInWindow: row.completed_in_window };
  };

  const plans = await db.query<{
    id: string; kind: "onboarding" | "offboarding"; title: string; full_name: string; target_date: string;
    finished: number; total: number; overdue: number;
  }>(
    `SELECT p.id, p.kind, p.title, e.full_name, p.target_date::text AS target_date,
            count(t.id) FILTER (WHERE t.status <> 'pending')::int AS finished,
            count(t.id)::int AS total,
            count(t.id) FILTER (WHERE t.status = 'pending' AND t.due_on < $1::date)::int AS overdue
     FROM public.lifecycle_plans p
     JOIN public.employees e ON e.id = p.employee_id
     LEFT JOIN public.lifecycle_tasks t ON t.plan_id = p.id
     WHERE p.status = 'active'
     GROUP BY p.id, e.full_name
     ORDER BY p.target_date, p.id
     LIMIT 20`,
    [today],
  );

  const recognised = await db.query<{ recognised: number; working: number }>(
    `SELECT (SELECT count(DISTINCT r.receiver_employee_id)::int
               FROM public.recognitions r JOIN public.employees e ON e.id = r.receiver_employee_id
               WHERE r.hidden_at IS NULL AND r.given_on >= $1::date AND ${WORKING}) AS recognised,
            (SELECT count(*)::int FROM public.employees e WHERE ${WORKING}) AS working`,
    [windowStart],
  );
  const byCategory = await recognitionByCategory(db, windowStart, null);

  return {
    today,
    windowStart,
    windowDays: WINDOW_DAYS,
    lifecycle: {
      onboarding: summary("onboarding"),
      offboarding: summary("offboarding"),
      plans: plans.rows.map((row) => ({
        id: Number(row.id), kind: row.kind, title: row.title, employeeName: row.full_name, targetDate: row.target_date,
        tasksFinished: row.finished, tasksTotal: row.total, overdueTasks: row.overdue,
      })),
    },
    performance: { goals: await goalCounts(db, today, null), cycles: await cycleProgress(db, null) },
    recognition: {
      total: byCategory.reduce((sum, entry) => sum + entry.count, 0),
      employeesRecognised: recognised.rows[0]!.recognised,
      workingEmployees: recognised.rows[0]!.working,
      byCategory,
    },
  };
}

export async function teamAnalytics(managerEmployeeId: number, db: Db = pool): Promise<TeamAnalytics> {
  const today = await companyToday(db);
  const windowStart = addDays(today, -(WINDOW_DAYS - 1));
  const year = Number(today.slice(0, 4));

  const size = await db.query<{ size: number; onboarding: number; offboarding: number }>(
    `SELECT (SELECT count(*)::int FROM public.employees e WHERE e.manager_id = $1 AND ${WORKING}) AS size,
            count(p.id) FILTER (WHERE p.kind = 'onboarding')::int AS onboarding,
            count(p.id) FILTER (WHERE p.kind = 'offboarding')::int AS offboarding
     FROM public.lifecycle_plans p
     JOIN public.employees e ON e.id = p.employee_id
     WHERE p.status = 'active' AND e.manager_id = $1 AND ${WORKING}`,
    [managerEmployeeId],
  );
  const leave = await db.query<{ leave_type: string; days: string }>(
    `SELECT lr.leave_type, COALESCE(sum(lr.working_days), 0)::text AS days
     FROM public.leave_requests lr
     JOIN public.employees e ON e.id = lr.employee_id
     WHERE lr.status = 'approved' AND lr.leave_year = $2 AND e.manager_id = $1 AND ${WORKING}
     GROUP BY lr.leave_type
     ORDER BY lr.leave_type`,
    [managerEmployeeId, year],
  );
  const byCategory = await recognitionByCategory(db, windowStart, managerEmployeeId);

  return {
    today,
    windowStart,
    windowDays: WINDOW_DAYS,
    teamSize: size.rows[0]!.size,
    goals: await goalCounts(db, today, managerEmployeeId),
    reviews: await cycleProgress(db, managerEmployeeId),
    leave: { year, approvedDays: leave.rows.map((row) => ({ leaveType: row.leave_type, days: Number(row.days) })) },
    recognition: { total: byCategory.reduce((sum, entry) => sum + entry.count, 0), byCategory },
    lifecycle: { onboarding: size.rows[0]!.onboarding, offboarding: size.rows[0]!.offboarding },
  };
}
