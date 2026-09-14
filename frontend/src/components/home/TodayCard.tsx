import { ArrowRight, Briefcase, CalendarClock, ChevronRight, Moon, PartyPopper, type LucideIcon } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import type { CalendarData } from "../../types/workplace";
import { cn } from "../../utils/cn";
import { cityOf, clockInZone, formatClock, formatLongDate, formatShortDay, isoWeekday } from "./homeTime";
import type { LoadState } from "./useCompanyCalendar";

interface Slot {
  key: string;
  icon: LucideIcon;
  title: string;
  when: string;
  date: string;
}

/**
 * What is on today, then what is coming: company holidays and events only,
 * straight from the company calendar. Nothing is invented to fill the row -
 * with an empty calendar the card says so.
 */
function slotsFor(calendar: CalendarData): { today: Slot[]; upcoming: Slot[] } {
  const today = calendar.config.today;
  const all: Slot[] = [
    ...calendar.holidays.map((holiday) => ({
      key: `holiday-${holiday.date}`, icon: PartyPopper, title: holiday.name, when: "All day", date: holiday.date,
    })),
    ...calendar.events.map((event) => ({
      key: `event-${event.id}`,
      icon: CalendarClock,
      title: event.title,
      when: event.startTime ? formatClock(event.startTime) : "All day",
      // A multi-day event that started earlier still belongs to today.
      date: event.startsOn < today && event.endsOn >= today ? today : event.startsOn,
    })),
  ].sort((a, b) => a.date.localeCompare(b.date) || a.when.localeCompare(b.when));
  return {
    today: all.filter((slot) => slot.date === today),
    upcoming: all.filter((slot) => slot.date > today).map((slot) => ({ ...slot, when: `${formatShortDay(slot.date)} · ${slot.when}` })),
  };
}

/**
 * The deep green Today card from the approved reference: the company's date,
 * whether today is a working day, the company clock as "Now", and the day's
 * schedule on a timeline.
 *
 * The reference's corner shows weather and a place. HR Nexus has neither, so
 * that corner carries what the company calendar does know: whether today is a
 * working day, a holiday or a day off, and whose clock "Now" is read from.
 */
export default function TodayCard({ state, calendar, className, aside }: {
  state: LoadState;
  calendar: CalendarData | null;
  className?: string;
  /**
   * Replaces the corner's working-day status with something personal - an
   * employee's own attendance and its check-in action. The working-day status
   * then moves beside the date, so it is never lost.
   */
  aside?: ReactNode;
}) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  // @container: the slot row adapts to the card's width, which differs between
  // HR's Home (beside Tasks) and a phone.
  const shell = cn(
    "@container relative overflow-hidden rounded-card p-5 text-feature-fg shadow-raised sm:p-6 lg:px-[1.625rem] lg:pb-5 lg:pt-5",
    "bg-linear-to-br from-feature to-feature-deep dark:ring-1 dark:ring-white/5",
    className,
  );

  if (state !== "ready" || !calendar) {
    return (
      <section aria-labelledby="home-today-title" className={shell} aria-busy={state === "loading" || undefined}>
        <h2 id="home-today-title" className="text-lg font-medium text-feature-accent">Today</h2>
        {state === "loading" ? (
          <div aria-hidden="true" className="mt-4 space-y-3">
            <div className="h-5 w-56 animate-pulse rounded bg-white/10 motion-reduce:animate-none" />
            <div className="mt-8 flex gap-4">
              {[0, 1, 2].map((key) => <div key={key} className="h-24 w-36 animate-pulse rounded-xl bg-white/[0.06] motion-reduce:animate-none" />)}
            </div>
          </div>
        ) : (
          <p className="mt-3 text-sm text-feature-muted">The company calendar could not be loaded. Try again in a moment.</p>
        )}
      </section>
    );
  }

  const { config } = calendar;
  const today = config.today;
  const holidayToday = calendar.holidays.find((holiday) => holiday.date === today);
  const working = (config.workingDays ?? [1, 2, 3, 4, 5]).includes(isoWeekday(today));
  const status = holidayToday
    ? { icon: PartyPopper, label: holidayToday.name }
    : working
      ? { icon: Briefcase, label: "Working day" }
      : { icon: Moon, label: "Not a working day" };
  const { today: todaySlots, upcoming } = slotsFor(calendar);
  const slots = [...todaySlots, ...upcoming].slice(0, 3);
  const calendarLink = `/calendar?date=${today}`;

  return (
    <section aria-labelledby="home-today-title" className={shell}>
      <div aria-hidden="true" className="pointer-events-none absolute -right-24 -top-24 size-72 rounded-full bg-[radial-gradient(closest-side,rgb(127_211_191/0.12),transparent)]" />

      <div className="relative flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div>
          <h2 id="home-today-title" className="text-lg font-medium leading-6 text-feature-accent">Today</h2>
          <p className="mt-1 text-lg font-medium leading-6 text-feature-fg">{formatLongDate(today)}</p>
          {aside && (
            <p className="mt-1 flex items-center gap-2 text-[0.8125rem] text-feature-muted">
              <status.icon size={14} className="text-[#f0c070]" aria-hidden="true" />
              {status.label} · {cityOf(config.timezone)} time
            </p>
          )}
        </div>
        {aside ?? (
          <div className="text-right">
            <p className="flex items-center justify-end gap-2 text-[0.9375rem] font-medium text-feature-fg">
              <status.icon size={17} className="text-[#f0c070]" aria-hidden="true" />
              {status.label}
            </p>
            <p className="mt-1 text-[0.8125rem] text-feature-muted">{cityOf(config.timezone)} time</p>
          </div>
        )}
      </div>

      <div className="relative mt-5">
        {/* The timeline: a hairline across the card with a node above each
            slot, ending in an arrow. The nodes live inside the slot row's own
            top padding, so the row's horizontal scroll cannot clip them. */}
        <div aria-hidden="true" className="absolute inset-x-0 top-[7px] flex items-center">
          <span className="h-px flex-1 bg-feature-accent/25" />
          <ChevronRight size={12} className="-ml-1 text-feature-accent/60" />
        </div>

        {/* Wider than 36rem, the slots share the row as flexible tiles (7 to
            11.25rem) beside the inline link, so three events never slide under
            it. Narrower, the row scrolls sideways and the link moves below. */}
        <div className="flex items-end gap-4">
          <div className="-mx-1 min-w-0 flex-1 overflow-x-auto px-1 pb-1 pt-4 [scrollbar-width:none] @min-[36rem]:overflow-visible">
            <ol className="flex gap-3">
              <li className="relative w-[6.75rem] shrink-0 rounded-xl border border-feature-accent/45 bg-white/[0.06] px-4 py-3.5">
                <span aria-hidden="true" className="absolute -top-[11px] left-4 size-1.5 rounded-full bg-feature-accent" />
                <p className="text-[0.9375rem] font-medium">Now</p>
                <p className="mt-1 text-[0.8125rem] text-feature-muted">
                  <time>{clockInZone(config.timezone, now)}</time>
                </p>
                <span aria-hidden="true" className="mt-3 block size-2 rounded-full bg-feature-accent" />
              </li>
              {slots.map((slot, index) => (
                <li key={slot.key} className="relative w-40 shrink-0 @min-[36rem]:w-auto @min-[36rem]:min-w-[7rem] @min-[36rem]:max-w-[11.25rem] @min-[36rem]:flex-1 @min-[36rem]:shrink">
                  <span aria-hidden="true" className="absolute -top-[10px] left-4 size-1 rounded-full bg-feature-accent/70" />
                  <Link
                    to={`/calendar?date=${slot.date}`}
                    className="block h-full rounded-xl border border-white/[0.07] bg-white/[0.035] px-4 py-3.5 transition-colors hover:bg-white/[0.07] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-feature-accent"
                  >
                    <slot.icon size={17} className="text-[#8fd6e6]" aria-hidden="true" />
                    <p className="mt-2 truncate text-sm font-medium" title={slot.title}>{slot.title}</p>
                    <p className="mt-1 truncate text-[0.8125rem] text-feature-muted" title={slot.when}>
                      {index >= todaySlots.length && <span className="sr-only">Coming up, </span>}
                      {slot.when}
                    </p>
                  </Link>
                </li>
              ))}
              {slots.length === 0 && (
                <li className="self-center text-sm text-feature-muted">Nothing on the company calendar for the next two weeks.</li>
              )}
            </ol>
          </div>
          <Link
            to={calendarLink}
            className="mb-1 hidden min-h-8 shrink-0 items-center gap-2 rounded-md text-[0.8125rem] font-medium text-feature-accent hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-feature-accent @min-[36rem]:inline-flex"
          >
            View calendar
            <ArrowRight size={14} aria-hidden="true" />
          </Link>
        </div>
      </div>

      <Link
        to={calendarLink}
        className="relative mt-3 inline-flex min-h-8 items-center gap-2 rounded-md text-[0.8125rem] font-medium text-feature-accent hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-feature-accent @min-[36rem]:hidden"
      >
        View calendar
        <ArrowRight size={14} aria-hidden="true" />
      </Link>
    </section>
  );
}
