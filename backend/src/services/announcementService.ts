/**
 * Who may read which announcement. One rule, used by the feed, the detail
 * page, the Action Center and search:
 *
 *   HR           every announcement, in any state (they manage them)
 *   everyone     published, not past its expiry date in the company's
 *                timezone, and addressed to the company or to their own
 *                department
 *
 * A draft, an archived notice, an expired one or another department's is
 * "not found" to anyone but HR, so its existence is not confirmed.
 */
import type { Pool, PoolClient } from "pg";
import pool from "../config/db.js";
import type { AuthenticatedUser } from "../types/auth.js";
import { companyToday } from "../utils/companyClock.js";

type Db = Pick<PoolClient, "query"> | Pool;

export interface Reader {
  userId: number;
  isAdmin: boolean;
  departmentId: number | null;
  today: string;
}

export async function readerFor(user: AuthenticatedUser, db: Db = pool): Promise<Reader> {
  let departmentId: number | null = null;
  if (user.employeeId !== null) {
    const result = await db.query<{ department_id: string | number | null }>(
      "SELECT department_id FROM public.employees WHERE id = $1", [user.employeeId],
    );
    const value = result.rows[0]?.department_id;
    departmentId = value === null || value === undefined ? null : Number(value);
  }
  return { userId: user.id, isAdmin: user.role === "admin", departmentId, today: await companyToday(db) };
}

/**
 * The published-and-addressed-to-you condition over alias `a`. Parameters are
 * appended to `params` and referenced by position, so it composes into larger
 * queries. HR's feed shows every current announcement whatever its audience.
 */
export function feedCondition(reader: Reader, params: unknown[]): string {
  params.push(reader.today);
  const today = `$${params.length}::date`;
  const current = `a.status = 'published' AND (a.expires_on IS NULL OR a.expires_on >= ${today})`;
  if (reader.isAdmin) return current;
  params.push(reader.departmentId);
  return `${current} AND (a.audience = 'company' OR a.department_id = $${params.length}::int)`;
}

export const announcementColumns = `a.id, a.title, a.body, a.priority, a.audience, a.department_id,
  d.name AS department_name, a.status, a.expires_on::text AS expires_on,
  a.published_at, a.archived_at, a.created_at, a.updated_at, a.revision,
  COALESCE(pe.full_name, CASE WHEN a.published_by IS NULL THEN NULL ELSE 'HR' END) AS author_name`;

export const announcementJoins = `LEFT JOIN public.departments d ON d.id = a.department_id
  LEFT JOIN public.users pu ON pu.id = a.published_by
  LEFT JOIN public.employees pe ON pe.id = pu.employee_id`;

export interface AnnouncementRow {
  id: string;
  title: string;
  body: string;
  priority: "normal" | "important";
  audience: "company" | "department";
  department_id: string | null;
  department_name: string | null;
  status: "draft" | "published" | "archived";
  expires_on: string | null;
  published_at: Date | null;
  archived_at: Date | null;
  created_at: Date;
  updated_at: Date;
  revision: number;
  author_name: string | null;
  is_read?: boolean;
}

export function toAnnouncement(row: AnnouncementRow) {
  return {
    id: Number(row.id),
    title: row.title,
    body: row.body,
    priority: row.priority,
    audience: row.audience,
    departmentId: row.department_id === null ? null : Number(row.department_id),
    departmentName: row.department_name,
    status: row.status,
    expiresOn: row.expires_on,
    publishedAt: row.published_at ? row.published_at.toISOString() : null,
    archivedAt: row.archived_at ? row.archived_at.toISOString() : null,
    updatedAt: row.updated_at.toISOString(),
    edited: row.published_at !== null && row.updated_at.getTime() - row.published_at.getTime() > 60_000,
    revision: row.revision,
    authorName: row.author_name,
    isRead: row.is_read ?? false,
  };
}

/** Important announcements the reader has not opened yet, newest first. */
export async function unreadImportant(reader: Reader, db: Db = pool, limit = 5) {
  const params: unknown[] = [reader.userId];
  const condition = feedCondition(reader, params);
  params.push(limit);
  const result = await db.query<{ id: string; title: string; published_at: Date }>(
    `SELECT a.id, a.title, a.published_at
     FROM public.announcements a
     WHERE ${condition} AND a.priority = 'important'
       AND NOT EXISTS (SELECT 1 FROM public.announcement_reads r WHERE r.announcement_id = a.id AND r.user_id = $1)
     ORDER BY a.published_at DESC, a.id DESC
     LIMIT $${params.length}`,
    params,
  );
  return result.rows.map((row) => ({ id: Number(row.id), title: row.title, publishedAt: row.published_at.toISOString() }));
}
