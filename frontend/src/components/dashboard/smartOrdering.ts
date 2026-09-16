import { addDays, formatShortDay, isoWeekday } from "../home/homeTime";
import { sources } from "./dashboardData";

/*
 * Smart ordering for widget stacks.
 *
 * Deterministic and explainable: each rule looks only at data the widget itself
 * shows this account - its own attendance, tasks, leave and payslips, the
 * company calendar, and what a manager already decides - and at the company's
 * clock from Company Settings, never the browser's. A rule either says why its
 * widget matters now, with a reason the stack displays, or says nothing.
 *
 * Nothing is invented: no rule creates urgency the data does not contain, and
 * no rule reads anything to infer something unrelated about a person. Ordering
 * changes presentation only. The account can switch it off per stack, and
 * without a relevant signal the manual order is used unchanged.
 */

export interface Relevance {
  /** 50-100. Only scores at or above the threshold move a widget forward. */
  score: number;
  reason: string;
}

export const SMART_THRESHOLD = 50;

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

const shortPeriod = (year: number, month: number) =>
  new Intl.DateTimeFormat("en-US", { month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(year, month - 1, 1)));

/** Minutes past midnight on a given time zone's clock. */
export function minutesInZone(timeZone: string, now: Date = new Date()): number {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now);
  const value = (type: "hour" | "minute") => Number(parts.find((part) => part.type === type)?.value ?? 0);
  return value("hour") * 60 + value("minute");
}

const toMinutes = (time: string) => {
  const [hours, minutes] = time.split(":");
  return Number(hours) * 60 + Number(minutes);
};

type Rule = (now: Date) => Promise<Relevance | null>;

/** The rules, by widget id. A widget without a rule keeps its manual place. */
export const relevanceRules: Record<string, Rule> = {
  // Around the company's start of day, on a working day that is not a
  // holiday, before this account has checked in.
  "my-attendance": async (now) => {
    const [dashboard, settings, calendar] = await Promise.all([
      sources.employeeDashboard(), sources.attendanceSettings(), sources.calendar(),
    ]);
    if (dashboard.todayAttendance?.checkInTime) return null;
    const today = calendar.config.today;
    const working = (calendar.config.workingDays ?? [1, 2, 3, 4, 5]).includes(isoWeekday(today));
    if (!working || calendar.holidays.some((holiday) => holiday.date === today)) return null;
    if (!settings.work_start_time || !settings.timezone) return null;
    const start = toMinutes(settings.work_start_time);
    const minutes = minutesInZone(settings.timezone, now);
    if (minutes < start - 60 || minutes > start + (settings.grace_period_minutes ?? 0) + 120) return null;
    return { score: 90, reason: "The working day is starting and you have not checked in" };
  },

  "action-center": async () => {
    const data = await sources.actionCenter();
    const important = data.requiresAction.filter((item) => item.important).length;
    if (important > 0) return { score: 80, reason: `${plural(important, "important item needs", "important items need")} you` };
    const count = data.requiresAction.length;
    return count > 0 ? { score: 60, reason: `${plural(count, "thing needs", "things need")} you` } : null;
  },

  "my-tasks": async () => {
    const work = await sources.myWork();
    const due = work.assigned.filter((task) => task.overdue || task.dueOn <= work.today).length;
    if (due > 0) return { score: 75, reason: `${plural(due, "task is", "tasks are")} due` };
    return work.assigned.length > 0 ? { score: 55, reason: `${plural(work.assigned.length, "task is", "tasks are")} assigned to you` } : null;
  },

  // A payslip paid in the last seven company days.
  "my-payslip": async () => {
    const dashboard = await sources.employeeDashboard();
    const payslip = dashboard.latestPayslip;
    if (!payslip?.paidAt) return null;
    const paidOn = payslip.paidAt.slice(0, 10);
    if (paidOn > dashboard.today || paidOn < addDays(dashboard.today, -7)) return null;
    return { score: 65, reason: `Your ${shortPeriod(payslip.periodYear, payslip.periodMonth)} payslip was paid` };
  },

  // Approved leave that has started or starts within a week.
  "leave-balance": async () => {
    const dashboard = await sources.employeeDashboard();
    const next = dashboard.upcomingLeave;
    if (!next || next.status !== "approved" || next.startDate > addDays(dashboard.today, 7)) return null;
    return {
      score: 60,
      reason: next.startDate <= dashboard.today ? "You are on approved leave" : `Your leave starts ${formatShortDay(next.startDate)}`,
    };
  },

  // A company holiday or event on the calendar today.
  today: async () => {
    const calendar = await sources.calendar();
    const today = calendar.config.today;
    const holiday = calendar.holidays.find((entry) => entry.date === today);
    if (holiday) return { score: 50, reason: `${holiday.name} is today` };
    const event = calendar.events.find((entry) => entry.startsOn <= today && entry.endsOn >= today);
    return event ? { score: 50, reason: `${event.title} is today` } : null;
  },

  "team-leave": async () => {
    const overview = await sources.teamOverview();
    const count = overview.counts.pendingDecisions;
    return count > 0 ? { score: 72, reason: `${plural(count, "leave request", "leave requests")} to decide` } : null;
  },

  "team-reviews": async () => {
    const data = await sources.teamReviews();
    const waiting = data.reviews.filter((review) => review.status === "pending_manager" && review.cycle.status === "open");
    const overdue = waiting.filter((review) => review.overdue).length;
    if (overdue > 0) return { score: 78, reason: `${plural(overdue, "review is", "reviews are")} overdue` };
    return waiting.length > 0 ? { score: 62, reason: `${plural(waiting.length, "review", "reviews")} to write` } : null;
  },

  "pending-leave": async () => {
    const dashboard = await sources.adminDashboard();
    return dashboard.pendingLeaves > 0
      ? { score: 65, reason: `${plural(dashboard.pendingLeaves, "request is", "requests are")} waiting for a decision` }
      : null;
  },

  // A period that is calculated or approved has a next step waiting.
  "payroll-status": async () => {
    const dashboard = await sources.adminDashboard();
    const period = dashboard.payrollStatus;
    if (!period || (period.status !== "calculated" && period.status !== "approved")) return null;
    return { score: 60, reason: `${shortPeriod(period.periodYear, period.periodMonth)} payroll is ${period.status}` };
  },
};

export interface StackOrdering {
  /** The stack's widgets, most relevant first; the manual order breaks ties. */
  order: string[];
  /** Why each relevant widget was brought forward. */
  reasons: Record<string, string>;
}

/** Pure: orders widgets given each one's relevance. Unscored widgets keep their manual order after scored ones. */
export function orderByRelevance(widgets: string[], relevances: Record<string, Relevance | null>): StackOrdering {
  const ranked = widgets
    .map((id, index) => ({ id, index, relevance: relevances[id] ?? null }))
    .filter((entry) => entry.relevance !== null && entry.relevance.score >= SMART_THRESHOLD)
    .sort((a, b) => b.relevance!.score - a.relevance!.score || a.index - b.index);
  const rankedIds = new Set(ranked.map((entry) => entry.id));
  return {
    order: [...ranked.map((entry) => entry.id), ...widgets.filter((id) => !rankedIds.has(id))],
    reasons: Object.fromEntries(ranked.map((entry) => [entry.id, entry.relevance!.reason])),
  };
}

/** Evaluates every rule for a stack. A rule that cannot read its data simply abstains. */
export async function smartOrder(widgets: string[], now: Date = new Date()): Promise<StackOrdering> {
  const entries = await Promise.all(widgets.map(async (id) => {
    const rule = relevanceRules[id];
    if (!rule) return [id, null] as const;
    try {
      return [id, await rule(now)] as const;
    } catch {
      return [id, null] as const;
    }
  }));
  return orderByRelevance(widgets, Object.fromEntries(entries));
}
