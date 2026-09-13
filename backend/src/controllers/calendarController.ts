/**
 * The company calendar, company holidays and company events.
 *
 * Reading is for every signed-in account: the working week, the timezone,
 * holidays, events and who is out (through `calendarService`'s visibility
 * rules). Holidays and events are written by HR only, guarded on the router,
 * checked against the revision the editor started from, and audited.
 */
import type { Request, Response } from "express";
import type { PoolClient } from "pg";
import pool from "../config/db.js";
import { actorFromUser, recordAudit } from "../services/auditService.js";
import {
  absencesBetween,
  calendarConfig,
  eventColumns,
  eventsBetween,
  holidaysBetween,
  toEvent,
} from "../services/calendarService.js";
import { parseIdParam } from "../utils/employeeValidation.js";
import { parseDate } from "../utils/leaveCalculation.js";
import { validateCompanyEvent, validateHoliday } from "../utils/workplaceValidation.js";

/** A month view needs six weeks; a quarter is the most any view asks for. */
const MAX_RANGE_DAYS = 93;

function unavailable(response: Response, error: unknown, action: string): void {
  console.error(`Calendar ${action} failed:`, error);
  response.status(503).json({
    success: false,
    message: "The calendar is temporarily unavailable. Please try again.",
  });
}

function databaseErrorCode(error: unknown): string | undefined {
  return typeof error === "object" && error !== null ? (error as { code?: string }).code : undefined;
}

function readRange(request: Request, response: Response): { from: string; to: string } | null {
  const from = typeof request.query.from === "string" ? request.query.from : "";
  const to = typeof request.query.to === "string" ? request.query.to : "";
  if (!parseDate(from) || !parseDate(to)) {
    response.status(400).json({ success: false, message: "Send from and to as YYYY-MM-DD dates." });
    return null;
  }
  const span = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000;
  if (span < 0 || span > MAX_RANGE_DAYS - 1) {
    response.status(400).json({ success: false, message: `Choose a range of 1 to ${MAX_RANGE_DAYS} days.` });
    return null;
  }
  return { from, to };
}

// ------------------------------------------------------------------ reading

/**
 * GET /api/company/calendar-config - the working week, timezone and holidays
 * for last, this and next year: everything a leave preview needs to count
 * working days the way the server will.
 */
export async function getCalendarConfig(_request: Request, response: Response): Promise<void> {
  try {
    const config = await calendarConfig();
    const year = Number(config.today.slice(0, 4));
    const holidays = await holidaysBetween(`${year - 1}-01-01`, `${year + 1}-12-31`);
    response.status(200).json({
      success: true,
      data: { ...config, holidays: holidays.map(({ date, name }) => ({ date, name })) },
    });
  } catch (error) {
    unavailable(response, error, "configuration");
  }
}

/** GET /api/calendar?from&to&department=&team=1 */
export async function getCalendar(request: Request, response: Response): Promise<void> {
  const range = readRange(request, response);
  if (!range) return;

  const rawDepartment = typeof request.query.department === "string" ? request.query.department : "";
  const departmentId = rawDepartment === "" ? null : parseIdParam(rawDepartment);
  if (rawDepartment !== "" && departmentId === null) {
    response.status(400).json({ success: false, message: "Invalid department filter." });
    return;
  }
  const team = request.query.team;
  if (team !== undefined && team !== "1" && team !== "0") {
    response.status(400).json({ success: false, message: "team must be 1 or 0." });
    return;
  }
  const teamOnly = team === "1";
  // "My team" is a manager's view; anyone else asking for it has no team to show.
  if (teamOnly && !request.user!.isManager) {
    response.status(403).json({ success: false, code: "not_a_manager", message: "Only managers have a team view." });
    return;
  }

  try {
    const [config, holidays, events, out] = await Promise.all([
      calendarConfig(),
      holidaysBetween(range.from, range.to),
      eventsBetween(range.from, range.to),
      absencesBetween(request.user!, { ...range, departmentId, teamOnly }),
    ]);
    response.status(200).json({
      success: true,
      data: {
        ...range,
        config,
        holidays: holidays.map(({ date, name }) => ({ date, name })),
        events,
        absences: out.absences,
        truncated: out.truncated,
      },
    });
  } catch (error) {
    unavailable(response, error, "read");
  }
}

// ------------------------------------------------------------------ holidays (HR)

/** GET /api/settings/holidays?year= */
export async function listHolidays(request: Request, response: Response): Promise<void> {
  const rawYear = request.query.year;
  let year: number;
  if (rawYear === undefined) {
    year = Number((await calendarConfig().catch(() => null))?.today.slice(0, 4) ?? new Date().getUTCFullYear());
  } else {
    year = Number(rawYear);
    if (!Number.isSafeInteger(year) || year < 2000 || year > 2100) {
      response.status(400).json({ success: false, message: "Choose a year from 2000 to 2100." });
      return;
    }
  }
  try {
    response.status(200).json({
      success: true,
      data: { year, holidays: await holidaysBetween(`${year}-01-01`, `${year}-12-31`) },
    });
  } catch (error) {
    unavailable(response, error, "holiday list");
  }
}

function duplicateDate(response: Response, date: string): void {
  response.status(409).json({
    success: false,
    code: "duplicate_date",
    message: `There is already a holiday on ${date}.`,
    errors: { date: "There is already a holiday on this date." },
  });
}

async function inTransaction(
  response: Response,
  action: string,
  work: (client: PoolClient) => Promise<void>,
  onError?: (error: unknown) => boolean,
): Promise<void> {
  let client: PoolClient;
  try {
    client = await pool.connect();
  } catch (error) {
    unavailable(response, error, action);
    return;
  }
  try {
    await client.query("BEGIN");
    await work(client);
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // Already lost.
    }
    if (response.headersSent) return;
    if (onError?.(error)) return;
    unavailable(response, error, action);
  } finally {
    client.release();
  }
}

/** POST /api/settings/holidays { date, name } */
export async function createHoliday(request: Request, response: Response): Promise<void> {
  const validation = validateHoliday(request.body, { withRevision: false });
  if (!validation.valid) {
    response.status(400).json({ success: false, message: "Check the highlighted fields.", errors: validation.errors });
    return;
  }
  const { date, name } = validation.data;
  await inTransaction(response, "holiday creation", async (client) => {
    const created = await client.query<{ id: string; revision: number }>(
      `INSERT INTO public.company_holidays (holiday_date, name, created_by, updated_by)
       VALUES ($1, $2, $3, $3) RETURNING id, revision`,
      [date, name, request.user!.id],
    );
    const id = Number(created.rows[0]!.id);
    await recordAudit({
      actor: actorFromUser(request.user, request.user?.email),
      action: "HOLIDAY_CREATED",
      entityType: "holiday",
      entityId: id,
      summary: `Added company holiday ${name} on ${date}`,
      changes: { date, name },
    }, client);
    await client.query("COMMIT");
    response.status(201).json({
      success: true,
      message: "Holiday added.",
      data: { holiday: { id, date, name, revision: created.rows[0]!.revision } },
    });
  }, (error) => {
    if (databaseErrorCode(error) !== "23505") return false;
    duplicateDate(response, date);
    return true;
  });
}

/** PUT /api/settings/holidays/:id { date, name, revision } */
export async function updateHoliday(request: Request, response: Response): Promise<void> {
  const id = parseIdParam(request.params.id);
  if (id === null) {
    response.status(400).json({ success: false, message: "Invalid holiday ID" });
    return;
  }
  const validation = validateHoliday(request.body, { withRevision: true });
  if (!validation.valid) {
    response.status(400).json({ success: false, message: "Check the highlighted fields.", errors: validation.errors });
    return;
  }
  const { date, name, revision } = validation.data;
  await inTransaction(response, "holiday update", async (client) => {
    const existing = await client.query<{ holiday_date: string; name: string; revision: number }>(
      "SELECT holiday_date::text AS holiday_date, name, revision FROM public.company_holidays WHERE id = $1 FOR UPDATE",
      [id],
    );
    const before = existing.rows[0];
    if (!before) {
      await client.query("ROLLBACK");
      response.status(404).json({ success: false, message: "Holiday not found" });
      return;
    }
    if (before.revision !== revision) {
      await client.query("ROLLBACK");
      response.status(409).json({
        success: false,
        code: "stale_revision",
        message: "Someone else changed this holiday since you opened it. Reload to see the current list.",
      });
      return;
    }
    const updated = await client.query<{ revision: number }>(
      `UPDATE public.company_holidays
       SET holiday_date = $2, name = $3, updated_by = $4, updated_at = CURRENT_TIMESTAMP, revision = revision + 1
       WHERE id = $1 RETURNING revision`,
      [id, date, name, request.user!.id],
    );
    await recordAudit({
      actor: actorFromUser(request.user, request.user?.email),
      action: "HOLIDAY_UPDATED",
      entityType: "holiday",
      entityId: id,
      summary: `Changed company holiday ${before.name} (${before.holiday_date}) to ${name} (${date})`,
      changes: {
        date: { before: before.holiday_date, after: date },
        name: { before: before.name, after: name },
      },
    }, client);
    await client.query("COMMIT");
    response.status(200).json({
      success: true,
      message: "Holiday saved.",
      data: { holiday: { id, date, name, revision: updated.rows[0]!.revision } },
    });
  }, (error) => {
    if (databaseErrorCode(error) !== "23505") return false;
    duplicateDate(response, date);
    return true;
  });
}

/** DELETE /api/settings/holidays/:id */
export async function deleteHoliday(request: Request, response: Response): Promise<void> {
  const id = parseIdParam(request.params.id);
  if (id === null) {
    response.status(400).json({ success: false, message: "Invalid holiday ID" });
    return;
  }
  await inTransaction(response, "holiday deletion", async (client) => {
    const deleted = await client.query<{ holiday_date: string; name: string }>(
      "DELETE FROM public.company_holidays WHERE id = $1 RETURNING holiday_date::text AS holiday_date, name",
      [id],
    );
    const row = deleted.rows[0];
    if (!row) {
      await client.query("ROLLBACK");
      response.status(404).json({ success: false, message: "Holiday not found" });
      return;
    }
    await recordAudit({
      actor: actorFromUser(request.user, request.user?.email),
      action: "HOLIDAY_DELETED",
      entityType: "holiday",
      entityId: id,
      summary: `Removed company holiday ${row.name} on ${row.holiday_date}`,
      changes: { date: row.holiday_date, name: row.name },
    }, client);
    await client.query("COMMIT");
    response.status(200).json({ success: true, message: "Holiday removed." });
  });
}

// ------------------------------------------------------------------ events (HR)

/** GET /api/calendar/events?from&to - the events list HR manages. */
export async function listEvents(request: Request, response: Response): Promise<void> {
  const range = readRange(request, response);
  if (!range) return;
  try {
    response.status(200).json({ success: true, data: { ...range, events: await eventsBetween(range.from, range.to) } });
  } catch (error) {
    unavailable(response, error, "event list");
  }
}

/** POST /api/calendar/events */
export async function createEvent(request: Request, response: Response): Promise<void> {
  const validation = validateCompanyEvent(request.body, { withRevision: false });
  if (!validation.valid) {
    response.status(400).json({ success: false, message: "Check the highlighted fields.", errors: validation.errors });
    return;
  }
  const data = validation.data;
  await inTransaction(response, "event creation", async (client) => {
    const created = await client.query(
      `INSERT INTO public.company_events
         (title, description, location, starts_on, ends_on, start_time, end_time, created_by, updated_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8)
       RETURNING ${eventColumns}`,
      [data.title, data.description, data.location, data.startsOn, data.endsOn, data.startTime, data.endTime, request.user!.id],
    );
    const event = toEvent(created.rows[0]);
    await recordAudit({
      actor: actorFromUser(request.user, request.user?.email),
      action: "COMPANY_EVENT_CREATED",
      entityType: "company_event",
      entityId: event.id,
      summary: `Added company event "${event.title}" on ${event.startsOn}`,
      changes: { title: event.title, starts_on: event.startsOn, ends_on: event.endsOn },
    }, client);
    await client.query("COMMIT");
    response.status(201).json({ success: true, message: "Event added.", data: { event } });
  });
}

/** PUT /api/calendar/events/:id */
export async function updateEvent(request: Request, response: Response): Promise<void> {
  const id = parseIdParam(request.params.id);
  if (id === null) {
    response.status(400).json({ success: false, message: "Invalid event ID" });
    return;
  }
  const validation = validateCompanyEvent(request.body, { withRevision: true });
  if (!validation.valid) {
    response.status(400).json({ success: false, message: "Check the highlighted fields.", errors: validation.errors });
    return;
  }
  const data = validation.data;
  await inTransaction(response, "event update", async (client) => {
    const existing = await client.query(`SELECT ${eventColumns} FROM public.company_events WHERE id = $1 FOR UPDATE`, [id]);
    if (!existing.rows[0]) {
      await client.query("ROLLBACK");
      response.status(404).json({ success: false, message: "Event not found" });
      return;
    }
    const before = toEvent(existing.rows[0]);
    if (before.revision !== data.revision) {
      await client.query("ROLLBACK");
      response.status(409).json({
        success: false,
        code: "stale_revision",
        message: "Someone else changed this event since you opened it. Reload to see their changes.",
      });
      return;
    }
    const updated = await client.query(
      `UPDATE public.company_events
       SET title = $2, description = $3, location = $4, starts_on = $5, ends_on = $6,
           start_time = $7, end_time = $8, updated_by = $9, updated_at = CURRENT_TIMESTAMP, revision = revision + 1
       WHERE id = $1 RETURNING ${eventColumns}`,
      [id, data.title, data.description, data.location, data.startsOn, data.endsOn, data.startTime, data.endTime, request.user!.id],
    );
    const event = toEvent(updated.rows[0]);
    const changes: Record<string, unknown> = {};
    for (const key of ["title", "location", "startsOn", "endsOn", "startTime", "endTime"] as const) {
      if (before[key] !== event[key]) changes[key] = { before: before[key], after: event[key] };
    }
    if (before.description !== event.description) changes.description_changed = true;
    await recordAudit({
      actor: actorFromUser(request.user, request.user?.email),
      action: "COMPANY_EVENT_UPDATED",
      entityType: "company_event",
      entityId: id,
      summary: `Changed company event "${event.title}"`,
      changes,
    }, client);
    await client.query("COMMIT");
    response.status(200).json({ success: true, message: "Event saved.", data: { event } });
  });
}

/** DELETE /api/calendar/events/:id */
export async function deleteEvent(request: Request, response: Response): Promise<void> {
  const id = parseIdParam(request.params.id);
  if (id === null) {
    response.status(400).json({ success: false, message: "Invalid event ID" });
    return;
  }
  await inTransaction(response, "event deletion", async (client) => {
    const deleted = await client.query<{ title: string; starts_on: string }>(
      "DELETE FROM public.company_events WHERE id = $1 RETURNING title, starts_on::text AS starts_on",
      [id],
    );
    const row = deleted.rows[0];
    if (!row) {
      await client.query("ROLLBACK");
      response.status(404).json({ success: false, message: "Event not found" });
      return;
    }
    await recordAudit({
      actor: actorFromUser(request.user, request.user?.email),
      action: "COMPANY_EVENT_DELETED",
      entityType: "company_event",
      entityId: id,
      summary: `Removed company event "${row.title}" on ${row.starts_on}`,
      changes: { title: row.title, starts_on: row.starts_on },
    }, client);
    await client.query("COMMIT");
    response.status(200).json({ success: true, message: "Event removed." });
  });
}
