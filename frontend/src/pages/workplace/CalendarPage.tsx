import {
  CalendarClock,
  CalendarPlus,
  ChevronLeft,
  ChevronRight,
  MapPin,
  PartyPopper,
  Pencil,
  Trash2,
  UsersRound,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { getApiErrorMessage, resolveProfileImageUrl } from "../../api/axios";
import { getDepartments, type Department } from "../../api/departmentApi";
import { deleteEvent, getCalendar, getCalendarConfig } from "../../api/workplaceApi";
import ConfirmationModal from "../../components/common/ConfirmationModal";
import EventDialog from "../../components/workplace/EventDialog";
import Alert from "../../components/ui/Alert";
import Avatar from "../../components/ui/Avatar";
import Button from "../../components/ui/Button";
import Checkbox from "../../components/ui/Checkbox";
import EmptyState from "../../components/ui/EmptyState";
import ErrorState from "../../components/ui/ErrorState";
import FormField from "../../components/ui/FormField";
import PageHeader from "../../components/ui/PageHeader";
import SectionCard from "../../components/ui/SectionCard";
import SelectInput from "../../components/ui/SelectInput";
import { SkeletonText } from "../../components/ui/Skeleton";
import StatusBadge from "../../components/ui/StatusBadge";
import { useAuth } from "../../context/useAuth";
import type { Absence, CalendarData, CompanyEvent, CompanyHoliday } from "../../types/workplace";
import { cn } from "../../utils/cn";
import { formatDateRange } from "../../utils/datetime";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function addDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function isoWeekday(date: string): number {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  return day === 0 ? 7 : day;
}

function shiftMonth(month: string, delta: number): string {
  const [year, value] = month.split("-").map(Number);
  return new Date(Date.UTC(year!, value! - 1 + delta, 1)).toISOString().slice(0, 7);
}

function monthLabel(month: string): string {
  const [year, value] = month.split("-").map(Number);
  return new Date(Date.UTC(year!, value! - 1, 1)).toLocaleDateString(undefined, { month: "long", year: "numeric", timeZone: "UTC" });
}

function dayLabel(date: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString(undefined, {
    weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC",
  });
}

/** Six whole weeks, Monday first, around the month. */
function gridRange(month: string): { from: string; to: string } {
  const first = `${month}-01`;
  const from = addDays(first, -(isoWeekday(first) - 1));
  return { from, to: addDays(from, 41) };
}

interface Day {
  date: string;
  holidays: CompanyHoliday[];
  events: CompanyEvent[];
  out: Absence[];
}

function buildDays(data: CalendarData): Day[] {
  const days: Day[] = [];
  for (let date = data.from; date <= data.to; date = addDays(date, 1)) {
    days.push({
      date,
      holidays: data.holidays.filter((holiday) => holiday.date === date),
      events: data.events.filter((event) => event.startsOn <= date && event.endsOn >= date),
      out: data.absences.filter((absence) => absence.startDate <= date && absence.endDate >= date),
    });
  }
  return days;
}

function describeDay(day: Day, isWorking: boolean): string {
  const parts = [dayLabel(day.date)];
  if (!isWorking) parts.push("not a working day");
  for (const holiday of day.holidays) parts.push(`holiday: ${holiday.name}`);
  if (day.events.length > 0) parts.push(`${day.events.length} event${day.events.length === 1 ? "" : "s"}`);
  if (day.out.length > 0) parts.push(`${day.out.length} out`);
  return parts.join(", ");
}

function leaveLabel(type: string): string {
  return `${type.charAt(0).toUpperCase()}${type.slice(1)} leave`;
}

function eventTime(event: CompanyEvent): string | null {
  if (!event.startTime) return null;
  return event.endTime ? `${event.startTime}–${event.endTime}` : event.startTime;
}

function DayDetail({ day, isAdmin, onEdit, onDelete }: {
  day: Day;
  isAdmin: boolean;
  onEdit: (event: CompanyEvent) => void;
  onDelete: (event: CompanyEvent) => void;
}) {
  const nothing = day.holidays.length === 0 && day.events.length === 0 && day.out.length === 0;
  if (nothing) return <p className="text-sm text-fg-muted">Nothing on this day.</p>;
  return (
    <div className="space-y-4">
      {day.holidays.map((holiday) => (
        <div key={holiday.date + holiday.name} className="flex items-center gap-3 rounded-xl bg-success-soft px-3 py-2 text-success-fg">
          <PartyPopper size={16} aria-hidden="true" />
          <span className="text-sm font-semibold [overflow-wrap:anywhere]">{holiday.name}</span>
          <span className="ml-auto text-xs font-medium">Company holiday</span>
        </div>
      ))}

      {day.events.length > 0 && (
        <ul className="space-y-2" aria-label="Events">
          {day.events.map((event) => (
            <li key={event.id} className="rounded-xl border border-line p-3">
              <div className="flex items-start gap-3">
                <CalendarClock size={16} className="mt-0.5 shrink-0 text-info-fg" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-fg [overflow-wrap:anywhere]">{event.title}</p>
                  <p className="text-xs text-fg-muted">
                    {[eventTime(event), event.startsOn !== event.endsOn ? formatDateRange(event.startsOn, event.endsOn) : null].filter(Boolean).join(" · ") || "All day"}
                  </p>
                  {event.location && (
                    <p className="mt-0.5 flex items-center gap-1 text-xs text-fg-muted [overflow-wrap:anywhere]">
                      <MapPin size={12} aria-hidden="true" />{event.location}
                    </p>
                  )}
                  {event.description && <p className="mt-1.5 whitespace-pre-line text-sm text-fg-muted [overflow-wrap:anywhere]">{event.description}</p>}
                </div>
              </div>
              {isAdmin && (
                <div className="mt-2 flex justify-end gap-1">
                  <Button variant="ghost" size="sm" icon={Pencil} onClick={() => onEdit(event)} aria-label={`Edit ${event.title}`}>Edit</Button>
                  <Button variant="ghost" size="sm" icon={Trash2} onClick={() => onDelete(event)} aria-label={`Delete ${event.title}`}>Delete</Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {day.out.length > 0 && (
        <div>
          <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-fg-subtle">
            <UsersRound size={13} aria-hidden="true" /> Out ({day.out.length})
          </p>
          <ul className="space-y-2">
            {day.out.map((absence) => (
              <li key={`${absence.employeeId}-${absence.startDate}-${absence.status}`} className="flex items-center gap-3">
                <Avatar name={absence.name} src={resolveProfileImageUrl(absence.profileImage)} size="sm" />
                <div className="min-w-0 flex-1">
                  <Link to={`/people/${absence.employeeId}`} className="text-sm font-medium text-fg hover:text-primary hover:underline focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring [overflow-wrap:anywhere]">
                    {absence.relation === "self" ? `${absence.name} (you)` : absence.name}
                  </Link>
                  <p className="text-xs text-fg-subtle [overflow-wrap:anywhere]">
                    {[absence.departmentName, formatDateRange(absence.startDate, absence.endDate)].filter(Boolean).join(" · ")}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  {absence.leaveType && <span className="text-xs text-fg-muted">{leaveLabel(absence.leaveType)}</span>}
                  {absence.status === "pending" && <StatusBadge label="Pending" tone="warning" />}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/**
 * The company calendar: holidays, company events and who is out.
 *
 * Who's out is names and dates for everyone; the type of leave appears only
 * for yourself, your team and HR, and reasons never appear. The working week
 * and "today" are the company's, from settings, not the browser's.
 */
export default function CalendarPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [params, setParams] = useSearchParams();

  const [today, setToday] = useState<string | null>(null);
  const [data, setData] = useState<CalendarData | null>(null);
  const [error, setError] = useState("");
  const [departments, setDepartments] = useState<Department[]>([]);
  const [notice, setNotice] = useState("");
  const [editing, setEditing] = useState<{ event: CompanyEvent | null } | null>(null);
  const [deleting, setDeleting] = useState<CompanyEvent | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const requestedDate = params.get("date");
  const month = params.get("month") ?? requestedDate?.slice(0, 7) ?? today?.slice(0, 7) ?? null;
  const departmentId = Number(params.get("department")) || null;
  const teamOnly = params.get("team") === "1" && Boolean(user?.isManager);
  const selected = requestedDate ?? today;

  const update = useCallback((changes: Record<string, string | null>) => {
    setParams((current) => {
      const next = new URLSearchParams(current);
      for (const [key, value] of Object.entries(changes)) {
        if (value === null) next.delete(key); else next.set(key, value);
      }
      return next;
    }, { replace: true });
  }, [setParams]);

  useEffect(() => {
    getCalendarConfig()
      .then((config) => setToday(config.today))
      .catch((requestError) => setError(getApiErrorMessage(requestError, "The calendar could not be loaded.")));
    getDepartments().then(setDepartments).catch(() => setDepartments([]));
  }, []);

  const load = useCallback(() => {
    if (!month) return;
    setError("");
    setData(null);
    getCalendar({ ...gridRange(month), department: departmentId, team: teamOnly })
      .then(setData)
      .catch((requestError) => setError(getApiErrorMessage(requestError, "The calendar could not be loaded.")));
  }, [month, departmentId, teamOnly]);

  useEffect(load, [load]);

  const days = useMemo(() => (data ? buildDays(data) : []), [data]);
  const workingDays = data?.config.workingDays ?? [1, 2, 3, 4, 5];
  const selectedDay = days.find((day) => day.date === selected) ?? null;
  const monthDays = days.filter((day) => month && day.date.startsWith(month));
  const agenda = monthDays.filter((day) => day.holidays.length + day.events.length + day.out.length > 0);
  const outToday = days.find((day) => day.date === today)?.out.length ?? 0;

  async function confirmDelete() {
    if (!deleting) return;
    setIsDeleting(true);
    try {
      await deleteEvent(deleting.id);
      setNotice(`${deleting.title} was removed.`);
      setDeleting(null);
      load();
    } catch (requestError) {
      setNotice("");
      setError(getApiErrorMessage(requestError, "The event could not be removed."));
      setDeleting(null);
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <section className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        title="Calendar"
        description="Company holidays, events and who is out."
        actions={isAdmin && (
          <Button icon={CalendarPlus} onClick={() => setEditing({ event: null })}>Add event</Button>
        )}
      />

      {notice && <Alert tone="success" onDismiss={() => setNotice("")}>{notice}</Alert>}

      <SectionCard>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" icon={ChevronLeft} aria-label="Previous month" onClick={() => month && update({ month: shiftMonth(month, -1), date: null })} disabled={!month} />
            <h2 className="min-w-40 text-center text-lg font-semibold text-fg" aria-live="polite">{month ? monthLabel(month) : "…"}</h2>
            <Button variant="secondary" size="sm" icon={ChevronRight} aria-label="Next month" onClick={() => month && update({ month: shiftMonth(month, 1), date: null })} disabled={!month} />
            <Button variant="ghost" size="sm" onClick={() => update({ month: null, date: null })} disabled={!today}>Today</Button>
          </div>
          <div className="flex flex-wrap items-end gap-4">
            <FormField id="calendar-department" label="Department" className="min-w-48">
              <SelectInput
                id="calendar-department"
                value={departmentId ?? ""}
                onChange={(event) => update({ department: event.target.value || null })}
                disabled={teamOnly}
              >
                <option value="">Whole company</option>
                {departments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}
              </SelectInput>
            </FormField>
            {user?.isManager && (
              <Checkbox
                id="calendar-team"
                label="Only my team"
                checked={teamOnly}
                onChange={(event) => update({ team: event.target.checked ? "1" : null, department: null })}
                className="pb-2"
              />
            )}
          </div>
        </div>
        {today && data && (
          <p className="mt-3 text-sm text-fg-muted" role="status">
            {outToday === 0 ? "Nobody is out today" : `${outToday} ${outToday === 1 ? "person is" : "people are"} out today`}
            {teamOnly ? " in your team." : departmentId ? " in this department." : "."}
          </p>
        )}
      </SectionCard>

      {error ? (
        <SectionCard><ErrorState title="The calendar could not be loaded" description={error} onRetry={load} /></SectionCard>
      ) : !data || !month ? (
        <SectionCard><p className="sr-only" role="status">Loading the calendar</p><SkeletonText lines={8} /></SectionCard>
      ) : (
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <SectionCard>
            {data.truncated && <Alert tone="warning" className="mb-4">This month has more leave than the calendar can show at once. Filter by department to see everyone.</Alert>}

            {/* Month grid from md up: every day is a button that says what is on it. */}
            <div className="hidden md:block">
              <div className="grid grid-cols-7 gap-1 pb-1" aria-hidden="true">
                {WEEKDAYS.map((weekday) => <span key={weekday} className="px-1 text-xs font-semibold uppercase tracking-wide text-fg-subtle">{weekday}</span>)}
              </div>
              <div className="grid grid-cols-7 gap-1">
                {days.map((day) => {
                  const inMonth = day.date.startsWith(month);
                  const isWorking = workingDays.includes(isoWeekday(day.date));
                  const isSelected = day.date === selected;
                  return (
                    <button
                      key={day.date}
                      type="button"
                      onClick={() => update({ date: day.date, month })}
                      aria-pressed={isSelected}
                      aria-label={describeDay(day, isWorking)}
                      className={cn(
                        "flex min-h-24 flex-col gap-1 rounded-lg border p-1.5 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring",
                        isSelected ? "border-primary ring-2 ring-primary-soft" : "border-line hover:border-line-strong",
                        isWorking ? "bg-surface" : "bg-surface-muted",
                        !inMonth && "opacity-60",
                      )}
                    >
                      <span
                        className={cn(
                          "grid h-6 w-6 place-items-center rounded-full text-xs font-semibold",
                          day.date === today ? "bg-primary text-primary-fg" : inMonth ? "text-fg" : "text-fg-subtle",
                        )}
                      >
                        {Number(day.date.slice(8))}
                      </span>
                      {day.holidays.map((holiday) => (
                        <span key={holiday.name} className="truncate rounded bg-success-soft px-1 text-[11px] font-medium text-success-fg">{holiday.name}</span>
                      ))}
                      {day.events.slice(0, 1).map((event) => (
                        <span key={event.id} className="truncate rounded bg-info-soft px-1 text-[11px] font-medium text-info-fg">{event.title}</span>
                      ))}
                      {day.events.length > 1 && <span className="text-[11px] text-fg-muted">+{day.events.length - 1} more</span>}
                      {day.out.length > 0 && (
                        <span className="mt-auto flex items-center gap-1 text-[11px] font-medium text-fg-muted">
                          <UsersRound size={11} aria-hidden="true" />{day.out.length} out
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
              <p className="mt-3 text-xs text-fg-subtle">Shaded days are outside the working week. Green marks a company holiday and blue a company event.</p>
            </div>

            {/* Agenda below md: only the days with something on them, in order. */}
            <div className="md:hidden">
              {agenda.length === 0 ? (
                <EmptyState icon={CalendarClock} title="Nothing this month" description="No holidays, events or leave." />
              ) : (
                <ol className="space-y-5">
                  {agenda.map((day) => (
                    <li key={day.date}>
                      <h3 className={cn("mb-2 text-sm font-semibold", day.date === today ? "text-primary" : "text-fg")}>
                        {dayLabel(day.date)}{day.date === today ? " · Today" : ""}
                      </h3>
                      <DayDetail day={day} isAdmin={isAdmin} onEdit={(event) => setEditing({ event })} onDelete={setDeleting} />
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </SectionCard>

          <SectionCard title={selectedDay ? dayLabel(selectedDay.date) : "Choose a day"} className="hidden md:block">
            {selectedDay ? (
              <DayDetail day={selectedDay} isAdmin={isAdmin} onEdit={(event) => setEditing({ event })} onDelete={setDeleting} />
            ) : (
              <p className="text-sm text-fg-muted">Select a day in this month to see what is on.</p>
            )}
          </SectionCard>
        </div>
      )}

      {isAdmin && (
        <EventDialog
          isOpen={editing !== null}
          event={editing?.event ?? null}
          defaultDate={selected ?? today ?? ""}
          onClose={() => setEditing(null)}
          onSaved={(saved, message) => {
            setEditing(null);
            setNotice(message);
            update({ month: saved.startsOn.slice(0, 7), date: saved.startsOn });
            load();
          }}
        />
      )}
      <ConfirmationModal
        isOpen={deleting !== null}
        isProcessing={isDeleting}
        title="Remove this event?"
        description={deleting ? `${deleting.title} will disappear from everyone's calendar.` : ""}
        confirmLabel="Remove event"
        processingLabel="Removing…"
        onCancel={() => setDeleting(null)}
        onConfirm={() => void confirmDelete()}
      />
    </section>
  );
}
