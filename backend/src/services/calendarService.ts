/**
 * The company calendar: the working week, holidays, company events, and who
 * is out.
 *
 * The working week and timezone come from Company Settings and are the only
 * settings every account may read: they decide which days are working days
 * for leave, so an employee's leave preview must use the same ones the server
 * does. Nothing else from settings (office coordinates, radius, contact
 * details) is exposed here.
 *
 * Who's out shows approved leave for everyone in the working company, as a
 * name and a date range. The leave type is shown only to the person, their
 * manager and HR; the reason is never on the calendar at all. Pending
 * requests appear only for the people who could act on them or who made them.
 */
import type { Pool, PoolClient } from "pg";
import pool from "../config/db.js";
import type { AuthenticatedUser } from "../types/auth.js";
import { getZonedNow } from "../utils/attendanceVerification.js";

type Db = Pick<PoolClient, "query"> | Pool;

export interface CalendarConfig {
  configured: boolean;
  timezone: string;
  /** ISO weekdays, Monday = 1 ... Sunday = 7. Null until HR configures them. */
  workingDays: number[] | null;
  today: string;
}

export async function calendarConfig(db: Db = pool): Promise<CalendarConfig> {
  const result = await db.query<{ timezone: string; working_days: number[] | null }>(
    "SELECT timezone, working_days FROM public.company_settings WHERE id = 1",
  );
  const row = result.rows[0];
  const timezone = row?.timezone ?? "UTC";
  let today: string;
  try {
    today = getZonedNow(timezone).date;
  } catch {
    today = getZonedNow("UTC").date;
  }
  return {
    configured: Boolean(row),
    timezone,
    workingDays: row?.working_days ? row.working_days.map(Number).sort((a, b) => a - b) : null,
    today,
  };
}

export interface Holiday {
  id: number;
  date: string;
  name: string;
  revision: number;
}

export async function holidaysBetween(from: string, to: string, db: Db = pool): Promise<Holiday[]> {
  const result = await db.query<{ id: string; holiday_date: string; name: string; revision: number }>(
    `SELECT id, holiday_date::text AS holiday_date, name, revision
     FROM public.company_holidays
     WHERE holiday_date BETWEEN $1::date AND $2::date
     ORDER BY holiday_date
     LIMIT 400`,
    [from, to],
  );
  return result.rows.map((row) => ({ id: Number(row.id), date: row.holiday_date, name: row.name, revision: row.revision }));
}

export interface CompanyEvent {
  id: number;
  title: string;
  description: string | null;
  location: string | null;
  startsOn: string;
  endsOn: string;
  startTime: string | null;
  endTime: string | null;
  revision: number;
}

export const eventColumns = `id, title, description, location, starts_on::text AS starts_on, ends_on::text AS ends_on,
  to_char(start_time, 'HH24:MI') AS start_time, to_char(end_time, 'HH24:MI') AS end_time, revision`;

export function toEvent(row: {
  id: string; title: string; description: string | null; location: string | null;
  starts_on: string; ends_on: string; start_time: string | null; end_time: string | null; revision: number;
}): CompanyEvent {
  return {
    id: Number(row.id), title: row.title, description: row.description, location: row.location,
    startsOn: row.starts_on, endsOn: row.ends_on, startTime: row.start_time, endTime: row.end_time,
    revision: row.revision,
  };
}

export async function eventsBetween(from: string, to: string, db: Db = pool): Promise<CompanyEvent[]> {
  const result = await db.query(
    `SELECT ${eventColumns} FROM public.company_events
     WHERE starts_on <= $2::date AND ends_on >= $1::date
     ORDER BY starts_on, start_time NULLS FIRST, id
     LIMIT 500`,
    [from, to],
  );
  return result.rows.map(toEvent);
}

export interface Absence {
  employeeId: number;
  name: string;
  profileImage: string | null;
  departmentName: string | null;
  startDate: string;
  endDate: string;
  status: "approved" | "pending";
  /** Only for the person, their manager and HR. */
  leaveType: string | null;
  relation: "self" | "team" | "other";
}

const MAX_ABSENCES = 2000;

/**
 * Who is out between two dates, as the caller may see it. `teamOnly` narrows a
 * manager's view to themselves and their direct reports.
 */
export async function absencesBetween(
  user: AuthenticatedUser,
  options: { from: string; to: string; departmentId: number | null; teamOnly: boolean },
  db: Db = pool,
): Promise<{ absences: Absence[]; truncated: boolean }> {
  const isAdmin = user.role === "admin";
  const me = user.employeeId;
  const result = await db.query<{
    id: string; employee_id: string; full_name: string; profile_image: string | null;
    department_name: string | null; start_date: string; end_date: string;
    status: "approved" | "pending"; leave_type: string; manager_id: string | null;
  }>(
    `SELECT lr.id, lr.employee_id, e.full_name, e.profile_image, d.name AS department_name,
            lr.start_date::text AS start_date, lr.end_date::text AS end_date,
            lr.status, lr.leave_type, e.manager_id
     FROM public.leave_requests lr
     JOIN public.employees e ON e.id = lr.employee_id
     LEFT JOIN public.departments d ON d.id = e.department_id
     WHERE lr.start_date <= $2::date AND lr.end_date >= $1::date
       AND e.employment_status IN ('active', 'probation')
       AND (lr.status = 'approved'
            OR (lr.status = 'pending' AND ($3::boolean OR lr.employee_id = $4::int OR e.manager_id = $4::int)))
       AND ($5::int IS NULL OR e.department_id = $5::int)
       AND ($6::boolean IS FALSE OR e.manager_id = $4::int OR e.id = $4::int)
     ORDER BY lr.start_date, e.full_name, lr.id
     LIMIT $7`,
    [options.from, options.to, isAdmin, me, options.departmentId, options.teamOnly, MAX_ABSENCES + 1],
  );

  const absences = result.rows.slice(0, MAX_ABSENCES).map((row): Absence => {
    const employeeId = Number(row.employee_id);
    const relation = me !== null && employeeId === me ? "self"
      : me !== null && row.manager_id !== null && Number(row.manager_id) === me ? "team"
      : "other";
    return {
      employeeId,
      name: row.full_name,
      profileImage: row.profile_image,
      departmentName: row.department_name,
      startDate: row.start_date,
      endDate: row.end_date,
      status: row.status,
      leaveType: isAdmin || relation !== "other" ? row.leave_type : null,
      relation,
    };
  });
  return { absences, truncated: result.rows.length > MAX_ABSENCES };
}
