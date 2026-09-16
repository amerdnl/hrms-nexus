import { useEffect, useState } from "react";
import { getVerificationStatus } from "../../api/attendanceApi";
import { getAdminDashboard, getEmployeeDashboard } from "../../api/dashboardApi";
import { getMyWork, getPlans } from "../../api/lifecycleApi";
import { getMyGoals, getTeamReviews } from "../../api/performanceApi";
import { getTeamOverview } from "../../api/teamApi";
import { getActionCenter, getCalendar, getCalendarConfig } from "../../api/workplaceApi";
import type { CalendarData } from "../../types/workplace";
import { addDays } from "../home/homeTime";
import type { LoadState } from "../home/useCompanyCalendar";

/*
 * One request per source for a personalised Home.
 *
 * Several widgets - and smart ordering - read the same few endpoints. Each
 * response is shared for a minute rather than fetched by every widget on its
 * own, and nothing polls: sources are read when Home mounts and again only once
 * the minute has passed. The cache belongs to one signed-in account and is
 * emptied the moment another account uses it, so one person's data can never be
 * shown to the next person on the same browser.
 */

const FRESH_FOR_MS = 60_000;
const cache = new Map<string, { at: number; promise: Promise<unknown> }>();
let owner: number | null = null;

/** Binds the cache to the signed-in account, clearing it if that has changed. */
export function claimDashboardData(userId: number): void {
  if (owner !== userId) {
    cache.clear();
    owner = userId;
  }
}

export function clearDashboardData(): void {
  cache.clear();
}

function shared<T>(key: string, load: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < FRESH_FOR_MS) return hit.promise as Promise<T>;
  const promise = load();
  cache.set(key, { at: Date.now(), promise });
  // A failure is not remembered: the next reader tries again.
  promise.catch(() => {
    if (cache.get(key)?.promise === promise) cache.delete(key);
  });
  return promise;
}

/** Every source a widget or a smart-ordering rule reads. Each endpoint authorises itself. */
export const sources = {
  employeeDashboard: () => shared("employee-dashboard", getEmployeeDashboard),
  adminDashboard: () => shared("admin-dashboard", getAdminDashboard),
  actionCenter: () => shared("action-center", getActionCenter),
  myWork: () => shared("my-work", getMyWork),
  myGoals: () => shared("my-goals", getMyGoals),
  teamOverview: () => shared("team-overview", getTeamOverview),
  teamReviews: () => shared("team-reviews", getTeamReviews),
  attendanceSettings: () => shared("attendance-settings", getVerificationStatus),
  activePlans: () => shared("active-plans", () => getPlans({ status: "active" })),
  // The same window Home's own calendar hook reads: the company's today and the next two weeks.
  calendar: () => shared("calendar", async (): Promise<CalendarData> => {
    const config = await getCalendarConfig();
    return getCalendar({ from: config.today, to: addDays(config.today, 14) });
  }),
};

/** Reads a shared source into component state. `source` must be stable, e.g. one of `sources`. */
export function useSource<T>(source: () => Promise<T>): { data: T | null; failed: boolean } {
  const [state, setState] = useState<{ data: T | null; failed: boolean }>({ data: null, failed: false });
  useEffect(() => {
    let active = true;
    source()
      .then((data) => { if (active) setState({ data, failed: false }); })
      .catch(() => { if (active) setState({ data: null, failed: true }); });
    return () => { active = false; };
  }, [source]);
  return state;
}

/** The company calendar in the shape Home's calendar cards expect. */
export function useSharedCalendar(): { state: LoadState; calendar: CalendarData | null } {
  const { data, failed } = useSource(sources.calendar);
  return { state: failed ? "failed" : data ? "ready" : "loading", calendar: data };
}
