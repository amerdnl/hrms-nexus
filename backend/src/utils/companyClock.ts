/**
 * The company's own clock.
 *
 * "Today" in HR Nexus is the calendar date in the timezone configured in
 * Company Settings - the same zone attendance uses to decide which day a clock
 * action belongs to. Not the database server's CURRENT_DATE, and not the
 * browser's. Four modules used to carry an identical private copy of this
 * lookup; one shared definition means a report, a dashboard, an export and the
 * V3 calendar cannot drift apart about what day it is.
 */
import type { Pool, PoolClient } from "pg";
import pool from "../config/db.js";
import { getZonedNow } from "./attendanceVerification.js";

type Db = Pick<PoolClient, "query"> | Pool;

/** The configured IANA zone, or UTC when settings are not initialised. */
export async function companyTimezone(db: Db = pool): Promise<string> {
  const settings = await db.query<{ timezone: string }>(
    "SELECT timezone FROM public.company_settings WHERE id = 1",
  );
  return settings.rows[0]?.timezone ?? "UTC";
}

/**
 * Today's date in the company's zone, `YYYY-MM-DD`.
 *
 * A zone the runtime does not recognise falls back to UTC rather than failing
 * a read; writes that depend on the zone fail closed on their own.
 */
export async function companyToday(db: Db = pool): Promise<string> {
  const timezone = await companyTimezone(db);
  try {
    return getZonedNow(timezone).date;
  } catch {
    return getZonedNow("UTC").date;
  }
}

/** Adds whole days to an ISO date in UTC, so no host timezone can shift it. */
export function addDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}
