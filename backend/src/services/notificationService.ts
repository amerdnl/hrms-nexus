/**
 * In-app notifications: something one account should look at.
 *
 * Distinct from the audit log (for investigation) and the timeline (what
 * happened to a person). A notification is written by the service that owns
 * the change, inside its transaction, and is contained by a SAVEPOINT exactly
 * like `recordAudit`: failing to notify must never undo the change, and the
 * change must never commit without trying to notify.
 *
 * Text is deliberately thin. A title and a short body say what happened in
 * words anyone who can see the notification may see; pay, leave reasons,
 * review content, coordinates and credentials never appear. The link is an
 * app-relative path, and the page behind it authorises the reader again - a
 * notification points at something, it never grants access to it.
 */
import type { Pool, PoolClient } from "pg";
import pool from "../config/db.js";
import { eligibleAccountCondition } from "../utils/userQueries.js";

type Db = Pick<PoolClient, "query"> | Pool;

/** A closed list, so the client can choose an icon and nothing else is sent. */
export const notificationKinds = [
  "leave_submitted",
  "leave_approved",
  "leave_rejected",
  "leave_cancelled",
  "payslip_published",
  "announcement_published",
  "manager_changed",
  "report_added",
  "task_assigned",
  "plan_started",
  "recognition_received",
  "goal_assigned",
  "goal_updated",
  "review_opened",
  "review_submitted",
] as const;

export type NotificationKind = (typeof notificationKinds)[number];

export interface NotificationTemplate {
  kind: NotificationKind;
  title: string;
  body?: string | null;
  link?: string | null;
  entityType?: string | null;
  entityId?: string | number | null;
  /** Same key for the same event: a repeated delivery is dropped per account. */
  dedupeKey?: string | null;
  /** Who caused it. Never notified about their own action. */
  actorUserId?: number | null;
}

/** The same rule the database CHECK enforces, applied first so a bad link is dropped, not fatal. */
const APP_LINK = /^\/[A-Za-z0-9/_?=&.%-]*$/;

export function isAppLink(link: string): boolean {
  return link.length <= 300 && APP_LINK.test(link) && !link.startsWith("//");
}

/**
 * Delivers one notification to each of `userIds`. Never throws; returns how
 * many were newly stored (a repeat delivery counts zero).
 */
export async function notify(
  userIds: readonly number[],
  template: NotificationTemplate,
  db: Db = pool,
): Promise<number> {
  const targets = [...new Set(userIds)].filter(
    (id) => Number.isSafeInteger(id) && id > 0 && id !== template.actorUserId,
  );
  if (targets.length === 0) return 0;

  let link = template.link ?? null;
  if (link !== null && !isAppLink(link)) {
    console.error(`Notification ${template.kind} had an unsafe link; sent without it.`);
    link = null;
  }
  const entityType = template.entityType ?? null;
  const entityId = template.entityId === null || template.entityId === undefined || entityType === null
    ? null : String(template.entityId).slice(0, 64);

  const transactional = "release" in db;
  try {
    if (transactional) await db.query("SAVEPOINT hr_nexus_notify");
    const result = await db.query(
      `INSERT INTO public.notifications
         (user_id, kind, title, body, link, entity_type, entity_id, dedupe_key, actor_user_id)
       SELECT target, $2, $3, $4, $5, $6, $7, $8, $9
       FROM unnest($1::int[]) AS target
       ON CONFLICT (user_id, dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING`,
      [
        targets,
        template.kind,
        template.title.trim().slice(0, 160),
        template.body ? template.body.trim().slice(0, 500) : null,
        link,
        entityId === null ? null : entityType,
        entityId,
        template.dedupeKey ? template.dedupeKey.slice(0, 160) : null,
        template.actorUserId ?? null,
      ],
    );
    if (transactional) await db.query("RELEASE SAVEPOINT hr_nexus_notify");
    return result.rowCount ?? 0;
  } catch (error) {
    console.error(`Notification write failed for ${template.kind}:`, error);
    if (transactional) {
      try {
        await db.query("ROLLBACK TO SAVEPOINT hr_nexus_notify");
      } catch (rollbackError) {
        console.error("Notification savepoint rollback failed:", rollbackError);
      }
    }
    return 0;
  }
}

// ------------------------------------------------------------ targets

/** Account ids from a query over `users u LEFT JOIN employees e`, eligible accounts only. */
async function eligibleAccounts(where: string, params: unknown[], db: Db): Promise<number[]> {
  const result = await db.query<{ id: string | number }>(
    `SELECT u.id FROM public.users u
     LEFT JOIN public.employees e ON e.id = u.employee_id
     WHERE ${eligibleAccountCondition} AND (${where})
     ORDER BY u.id`,
    params,
  );
  return result.rows.map((row) => Number(row.id));
}

/** The account of an employee, if they can sign in. */
export function accountsOfEmployees(employeeIds: readonly number[], db: Db = pool): Promise<number[]> {
  if (employeeIds.length === 0) return Promise.resolve([]);
  return eligibleAccounts("u.employee_id = ANY($1::int[])", [[...employeeIds]], db);
}

/** Every administrator who can sign in. */
export function adminAccounts(db: Db = pool): Promise<number[]> {
  return eligibleAccounts("u.role = 'admin'", [], db);
}

/**
 * The account of an employee's current manager, when the manager is part of
 * the working company and can sign in. Empty otherwise, so the caller falls
 * back to HR.
 */
export function managerAccountOf(employeeId: number, db: Db = pool): Promise<number[]> {
  return eligibleAccounts(
    `u.employee_id = (
       SELECT m.id FROM public.employees subject
       JOIN public.employees m ON m.id = subject.manager_id
       WHERE subject.id = $1 AND m.employment_status IN ('active', 'probation')
     )`,
    [employeeId],
    db,
  );
}

/** Every account in an announcement's audience: the company, or one department. */
export function audienceAccounts(departmentId: number | null, db: Db = pool): Promise<number[]> {
  return departmentId === null
    ? eligibleAccounts("TRUE", [], db)
    : eligibleAccounts("e.department_id = $1", [departmentId], db);
}

// ------------------------------------------------------------ reading

export interface NotificationItem {
  id: number;
  kind: NotificationKind;
  title: string;
  body: string | null;
  link: string | null;
  createdAt: string;
  readAt: string | null;
}

const READ_RETENTION_DAYS = 90;
const UNREAD_RETENTION_DAYS = 365;

/**
 * Retention, applied when someone opens their list: read notifications go
 * after 90 days and unread ones after a year. Only the caller's own rows.
 */
export async function pruneFor(userId: number, db: Db = pool): Promise<void> {
  await db.query(
    `DELETE FROM public.notifications
     WHERE user_id = $1
       AND ((read_at IS NOT NULL AND read_at < CURRENT_TIMESTAMP - make_interval(days => $2))
         OR created_at < CURRENT_TIMESTAMP - make_interval(days => $3))`,
    [userId, READ_RETENTION_DAYS, UNREAD_RETENTION_DAYS],
  );
}

export async function unreadCount(userId: number, db: Db = pool): Promise<number> {
  const result = await db.query<{ count: number }>(
    "SELECT count(*)::int AS count FROM public.notifications WHERE user_id = $1 AND read_at IS NULL",
    [userId],
  );
  return result.rows[0]?.count ?? 0;
}

export async function listFor(
  userId: number,
  options: { unreadOnly: boolean; beforeId: number | null; limit: number },
  db: Db = pool,
): Promise<{ items: NotificationItem[]; nextBefore: number | null }> {
  const result = await db.query<{
    id: string; kind: NotificationKind; title: string; body: string | null;
    link: string | null; created_at: Date; read_at: Date | null;
  }>(
    `SELECT id, kind, title, body, link, created_at, read_at
     FROM public.notifications
     WHERE user_id = $1
       AND ($2::boolean IS FALSE OR read_at IS NULL)
       AND ($3::bigint IS NULL OR id < $3)
     ORDER BY id DESC
     LIMIT $4`,
    [userId, options.unreadOnly, options.beforeId, options.limit + 1],
  );
  const rows = result.rows.slice(0, options.limit);
  return {
    items: rows.map((row) => ({
      id: Number(row.id),
      kind: row.kind,
      title: row.title,
      body: row.body,
      link: row.link,
      createdAt: row.created_at.toISOString(),
      readAt: row.read_at ? row.read_at.toISOString() : null,
    })),
    nextBefore: result.rows.length > options.limit ? Number(rows[rows.length - 1]!.id) : null,
  };
}

/** Marks one of the caller's notifications read. False when it is not theirs. */
export async function markRead(userId: number, notificationId: number, db: Db = pool): Promise<boolean> {
  const result = await db.query(
    `UPDATE public.notifications
     SET read_at = COALESCE(read_at, GREATEST(CURRENT_TIMESTAMP, created_at))
     WHERE id = $1 AND user_id = $2`,
    [notificationId, userId],
  );
  return (result.rowCount ?? 0) > 0;
}

export async function markAllRead(userId: number, db: Db = pool): Promise<number> {
  const result = await db.query(
    `UPDATE public.notifications
     SET read_at = GREATEST(CURRENT_TIMESTAMP, created_at)
     WHERE user_id = $1 AND read_at IS NULL`,
    [userId],
  );
  return result.rowCount ?? 0;
}
