import { ArrowDown, ArrowUp, Check, ChevronDown } from "lucide-react";
import { useEffect, useState } from "react";
import { getAllAttendance } from "../../api/attendanceApi";
import { getLeaveReport } from "../../api/reportsApi";
import type { AttendanceRecord } from "../../types/attendance";
import { cn } from "../../utils/cn";
import DropdownMenu from "../ui/DropdownMenu";
import { isoWeekday } from "./homeTime";

type Period = "this" | "last";

interface Window {
  from: string;
  to: string;
}

interface Figures {
  /** (present + late) / (present + late + absent), or null with nothing recorded. */
  rate: number | null;
  late: number;
  leaveRequests: number;
}

const pad = (value: number) => String(value).padStart(2, "0");
const daysIn = (year: number, month: number) => new Date(Date.UTC(year, month, 0)).getUTCDate();

/**
 * The period shown and the one it is compared with. "This month" runs to
 * today and is compared with the same number of days last month, so a
 * half-finished month is never measured against a whole one.
 */
function windowsFor(period: Period, today: string): { shown: Window; compared: Window; month: string[] } {
  const year = Number(today.slice(0, 4));
  const month = Number(today.slice(5, 7));
  const previous = month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };
  const before = previous.month === 1 ? { year: previous.year - 1, month: 12 } : { year: previous.year, month: previous.month - 1 };
  const start = (y: number, m: number) => `${y}-${pad(m)}-01`;
  const end = (y: number, m: number) => `${y}-${pad(m)}-${pad(daysIn(y, m))}`;
  const allDays = (y: number, m: number) => Array.from({ length: daysIn(y, m) }, (_, index) => `${y}-${pad(m)}-${pad(index + 1)}`);

  if (period === "this") {
    const elapsed = Number(today.slice(8, 10));
    const comparedEnd = Math.min(elapsed, daysIn(previous.year, previous.month));
    return {
      shown: { from: start(year, month), to: today },
      compared: { from: start(previous.year, previous.month), to: `${previous.year}-${pad(previous.month)}-${pad(comparedEnd)}` },
      month: allDays(year, month),
    };
  }
  return {
    shown: { from: start(previous.year, previous.month), to: end(previous.year, previous.month) },
    compared: { from: start(before.year, before.month), to: end(before.year, before.month) },
    month: allDays(previous.year, previous.month),
  };
}

function figuresFrom(records: AttendanceRecord[], leaveRequests: number): Figures {
  let attended = 0;
  let absent = 0;
  let late = 0;
  for (const record of records) {
    if (record.status === "present" || record.status === "late") attended += 1;
    if (record.status === "late") late += 1;
    if (record.status === "absent") absent += 1;
  }
  return { rate: attended + absent > 0 ? attended / (attended + absent) : null, late, leaveRequests };
}

function Delta({ current, previous, kind, better }: {
  current: number | null; previous: number | null; kind: "points" | "relative"; better: "up" | "down" | "neither";
}) {
  if (current === null || previous === null) return <span className="text-fg-subtle">No comparison</span>;
  const change = kind === "points" ? Math.round((current - previous) * 100) : previous === 0 ? null : Math.round(((current - previous) / previous) * 100);
  if (change === null) return <span className="text-fg-subtle">None before</span>;
  if (change === 0) return <span className="text-fg-subtle">No change</span>;
  const up = change > 0;
  const good = better === "neither" ? null : (better === "up") === up;
  const Icon = up ? ArrowUp : ArrowDown;
  return (
    <span className={cn("inline-flex items-center gap-1", good === null ? "text-fg-muted" : good ? "text-success-fg" : "text-danger-fg")}>
      <Icon size={13} aria-hidden="true" />
      <span className="sr-only">{up ? "Up" : "Down"} </span>
      {Math.abs(change)}{kind === "points" ? (Math.abs(change) === 1 ? " pt" : " pts") : "%"}
    </span>
  );
}

/**
 * Insights, from real records only: each working day's attendance rate as a
 * bar (days still to come are drawn faint), and the period's attendance rate,
 * leave requests and late check-ins against the comparison period.
 */
export default function InsightsCard({ today, workingDays, className }: { today: string; workingDays: number[]; className?: string }) {
  const [period, setPeriod] = useState<Period>("this");
  const [state, setState] = useState<"loading" | "ready" | "failed">("loading");
  const [data, setData] = useState<{ shown: Figures; compared: Figures; byDay: Map<string, { attended: number; counted: number }> } | null>(null);
  const windows = windowsFor(period, today);

  useEffect(() => {
    let active = true;
    const { shown, compared } = windowsFor(period, today);
    setState("loading");
    Promise.all([
      getAllAttendance({ startDate: shown.from, endDate: shown.to }),
      getAllAttendance({ startDate: compared.from, endDate: compared.to }),
      getLeaveReport({ from: shown.from, to: shown.to }),
      getLeaveReport({ from: compared.from, to: compared.to }),
    ])
      .then(([shownRecords, comparedRecords, shownLeave, comparedLeave]) => {
        if (!active) return;
        const byDay = new Map<string, { attended: number; counted: number }>();
        for (const record of shownRecords) {
          const day = record.attendanceDate.slice(0, 10);
          const entry = byDay.get(day) ?? { attended: 0, counted: 0 };
          if (record.status !== "on_leave") entry.counted += 1;
          if (record.status === "present" || record.status === "late") entry.attended += 1;
          byDay.set(day, entry);
        }
        setData({
          shown: figuresFrom(shownRecords, shownLeave.totals.requests),
          compared: figuresFrom(comparedRecords, comparedLeave.totals.requests),
          byDay,
        });
        setState("ready");
      })
      .catch(() => { if (active) setState("failed"); });
    return () => { active = false; };
  }, [period, today]);

  const bars = windows.month.filter((day) => workingDays.includes(isoWeekday(day)));
  const periodLabel = period === "this" ? "This month" : "Last month";
  const average = data?.shown.rate;

  return (
    <section aria-labelledby="home-insights-title" className={cn("flex flex-col rounded-card border border-line bg-surface p-5 shadow-card sm:px-6 sm:pb-3 sm:pt-[1.125rem]", className)}>
      <div className="flex items-center justify-between gap-3">
        <h2 id="home-insights-title" className="text-[1.0625rem] font-semibold text-fg">Insights</h2>
        <DropdownMenu
          unstyled
          label={`Insights period: ${periodLabel}. Change period`}
          align="end"
          className="min-h-8 gap-1.5 rounded-md px-1 text-[0.8125rem] font-medium text-primary hover:underline"
          trigger={<>{periodLabel}<ChevronDown size={14} aria-hidden="true" /></>}
          items={(["this", "last"] as const).map((value) => ({
            key: value,
            label: value === "this" ? "This month" : "Last month",
            checked: period === value,
            trailing: period === value ? <Check size={15} className="text-primary" aria-hidden="true" /> : undefined,
            onSelect: () => setPeriod(value),
          }))}
        />
      </div>

      {state === "failed" && <p className="mt-4 text-sm text-fg-muted">Insights could not be loaded.</p>}

      {state !== "failed" && (
        <>
          <div
            role="img"
            aria-label={state === "ready"
              ? `Attendance rate by working day, ${periodLabel.toLowerCase()}${average != null ? `, ${Math.round(average * 100)}% overall` : ", nothing recorded yet"}`
              : "Loading attendance by day"}
            aria-busy={state === "loading" || undefined}
            className="mt-4 flex h-[5.5rem] items-end justify-between gap-[3px] min-[80rem]:h-16"
          >
            {bars.map((day) => {
              const entry = data?.byDay.get(day);
              const future = day > today && period === "this";
              const rate = entry && entry.counted > 0 ? entry.attended / entry.counted : null;
              return (
                <span
                  key={day}
                  className={cn(
                    "w-[7px] shrink-0 rounded-full",
                    state === "loading" || future ? "h-full bg-line/70" : rate === null ? "h-[18%] bg-line" : "bg-linear-to-b from-primary to-primary/5",
                  )}
                  style={state === "ready" && !future && rate !== null ? { height: `${Math.max(14, Math.round(rate * 100))}%`, opacity: 0.45 + rate * 0.55 } : undefined}
                />
              );
            })}
          </div>

          <dl className="mt-4 grid grid-cols-3 divide-x divide-line">
            {[
              {
                label: "Attendance rate",
                value: data?.shown.rate != null ? `${Math.round(data.shown.rate * 100)}%` : "—",
                delta: <Delta current={data?.shown.rate ?? null} previous={data?.compared.rate ?? null} kind="points" better="up" />,
              },
              {
                label: "Leave requests",
                value: data ? String(data.shown.leaveRequests) : "—",
                delta: <Delta current={data?.shown.leaveRequests ?? null} previous={data?.compared.leaveRequests ?? null} kind="relative" better="neither" />,
              },
              {
                label: "Late check‑ins",
                value: data ? String(data.shown.late) : "—",
                delta: <Delta current={data?.shown.late ?? null} previous={data?.compared.late ?? null} kind="relative" better="down" />,
              },
            ].map((stat, index) => (
              <div key={stat.label} className={cn("min-w-0", index === 0 ? "pr-3" : "px-3 sm:px-5")}>
                <dt className="sr-only">{stat.label}</dt>
                <dd className="text-xl font-semibold tabular-nums text-fg">{state === "loading" ? "—" : stat.value}</dd>
                <dd aria-hidden="true" className="mt-0.5 text-[0.8125rem] leading-4 text-fg-muted min-[90rem]:truncate">{stat.label}</dd>
                <dd className="mt-1 text-[0.8125rem]" title={period === "this" ? "Compared with the same days last month" : "Compared with the month before"}>
                  {state === "ready" ? stat.delta : <span className="text-fg-subtle">&nbsp;</span>}
                  <span className="sr-only">{period === "this" ? ", compared with the same days last month" : ", compared with the month before"}</span>
                </dd>
              </div>
            ))}
          </dl>
          <p className="mt-3 text-xs text-fg-subtle min-[80rem]:sr-only">
            Compared with {period === "this" ? "the same days last month" : "the month before"}.
          </p>
        </>
      )}
    </section>
  );
}
