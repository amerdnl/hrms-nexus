import { useCallback, useEffect, useState } from "react";
import { getCalendar, getCalendarConfig } from "../../api/workplaceApi";
import type { CalendarData } from "../../types/workplace";
import { addDays } from "./homeTime";

export type LoadState = "loading" | "ready" | "failed";

/**
 * The company calendar from the company's today forward, read once for Home.
 *
 * Today's schedule and who is out both come from this single window, so the
 * two cards can never disagree about what "today" is. The company's today
 * comes from the server (Company Settings timezone), never the browser.
 */
export function useCompanyCalendar(days = 14): { state: LoadState; calendar: CalendarData | null; reload: () => void } {
  const [state, setState] = useState<LoadState>("loading");
  const [calendar, setCalendar] = useState<CalendarData | null>(null);

  const load = useCallback(async () => {
    setState("loading");
    try {
      const config = await getCalendarConfig();
      const data = await getCalendar({ from: config.today, to: addDays(config.today, days) });
      setCalendar(data);
      setState("ready");
    } catch {
      setCalendar(null);
      setState("failed");
    }
  }, [days]);

  useEffect(() => {
    void load();
  }, [load]);

  return { state, calendar, reload: () => void load() };
}
