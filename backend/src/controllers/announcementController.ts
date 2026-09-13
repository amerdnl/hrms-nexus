/**
 * Announcements: HR writes, the audience reads.
 *
 * Reading goes through `announcementService`'s one audience rule. Writing is
 * HR's alone (the router guards it), moves draft -> published -> archived and
 * nowhere else, names the revision it started from so two HR editors cannot
 * overwrite each other, and is audited without copying the text itself.
 * Publishing tells the audience through a notification, inside the same
 * transaction.
 */
import type { Request, Response } from "express";
import type { PoolClient } from "pg";
import pool from "../config/db.js";
import { actorFromUser, recordAudit } from "../services/auditService.js";
import {
  announcementColumns,
  announcementJoins,
  feedCondition,
  readerFor,
  toAnnouncement,
  type AnnouncementRow,
} from "../services/announcementService.js";
import { announcementPublished } from "../services/workflowNotifications.js";
import { companyToday } from "../utils/companyClock.js";
import { parseIdParam } from "../utils/employeeValidation.js";
import { eligibleAccountCondition } from "../utils/userQueries.js";
import { validateAnnouncement, type AnnouncementInput } from "../utils/workplaceValidation.js";

const MAX_PAGE_SIZE = 50;

function unavailable(response: Response, error: unknown, action: string): void {
  console.error(`Announcement ${action} failed:`, error);
  response.status(503).json({
    success: false,
    message: "Announcements are temporarily unavailable. Please try again.",
  });
}

async function safeRollback(client: PoolClient): Promise<void> {
  try {
    await client.query("ROLLBACK");
  } catch {
    // Already lost; the response stands.
  }
}

function paging(request: Request, response: Response, fallbackSize: number): { page: number; pageSize: number } | null {
  const page = Number(request.query.page ?? 1);
  const pageSize = Number(request.query.pageSize ?? fallbackSize);
  if (!Number.isSafeInteger(page) || page < 1 || page > 100_000
      || !Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > MAX_PAGE_SIZE) {
    response.status(400).json({ success: false, message: `Page sizes run from 1 to ${MAX_PAGE_SIZE}.` });
    return null;
  }
  return { page, pageSize };
}

// ------------------------------------------------------------------ reading

/** GET /api/announcements - the feed the caller is in the audience for. */
export async function getFeed(request: Request, response: Response): Promise<void> {
  const paged = paging(request, response, 20);
  if (!paged) return;
  try {
    const reader = await readerFor(request.user!);
    const params: unknown[] = [reader.userId];
    const condition = feedCondition(reader, params);
    const counts = await pool.query<{ total: number; unread: number }>(
      `SELECT count(*)::int AS total,
              count(*) FILTER (WHERE r.user_id IS NULL)::int AS unread
       FROM public.announcements a
       LEFT JOIN public.announcement_reads r ON r.announcement_id = a.id AND r.user_id = $1
       WHERE ${condition}`,
      params,
    );
    params.push(paged.pageSize, (paged.page - 1) * paged.pageSize);
    const rows = await pool.query<AnnouncementRow>(
      `SELECT ${announcementColumns}, (r.user_id IS NOT NULL) AS is_read
       FROM public.announcements a
       ${announcementJoins}
       LEFT JOIN public.announcement_reads r ON r.announcement_id = a.id AND r.user_id = $1
       WHERE ${condition}
       ORDER BY a.published_at DESC, a.id DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );
    response.status(200).json({
      success: true,
      data: {
        items: rows.rows.map(toAnnouncement),
        total: counts.rows[0]?.total ?? 0,
        unreadCount: counts.rows[0]?.unread ?? 0,
        page: paged.page,
        pageSize: paged.pageSize,
      },
    });
  } catch (error) {
    unavailable(response, error, "feed");
  }
}

/** Loads one announcement the caller may read; HR may read any. */
async function loadReadable(request: Request, id: number): Promise<AnnouncementRow | null> {
  const reader = await readerFor(request.user!);
  const params: unknown[] = [reader.userId, id];
  const condition = reader.isAdmin ? "TRUE" : feedCondition(reader, params);
  const result = await pool.query<AnnouncementRow>(
    `SELECT ${announcementColumns}, (r.user_id IS NOT NULL) AS is_read
     FROM public.announcements a
     ${announcementJoins}
     LEFT JOIN public.announcement_reads r ON r.announcement_id = a.id AND r.user_id = $1
     WHERE a.id = $2 AND ${condition}`,
    params,
  );
  return result.rows[0] ?? null;
}

/** GET /api/announcements/:id */
export async function getAnnouncement(request: Request, response: Response): Promise<void> {
  const id = parseIdParam(request.params.id);
  if (id === null) {
    response.status(400).json({ success: false, message: "Invalid announcement ID" });
    return;
  }
  try {
    const row = await loadReadable(request, id);
    if (!row) {
      response.status(404).json({ success: false, message: "Announcement not found" });
      return;
    }
    response.status(200).json({ success: true, data: { announcement: toAnnouncement(row) } });
  } catch (error) {
    unavailable(response, error, "read");
  }
}

/** PUT /api/announcements/:id/read - also clears the notification that pointed here. */
export async function markAnnouncementRead(request: Request, response: Response): Promise<void> {
  const id = parseIdParam(request.params.id);
  if (id === null) {
    response.status(400).json({ success: false, message: "Invalid announcement ID" });
    return;
  }
  try {
    const row = await loadReadable(request, id);
    if (!row || row.status !== "published") {
      response.status(404).json({ success: false, message: "Announcement not found" });
      return;
    }
    const userId = request.user!.id;
    await pool.query(
      `INSERT INTO public.announcement_reads (announcement_id, user_id) VALUES ($1, $2)
       ON CONFLICT (announcement_id, user_id) DO NOTHING`,
      [id, userId],
    );
    await pool.query(
      `UPDATE public.notifications SET read_at = GREATEST(CURRENT_TIMESTAMP, created_at)
       WHERE user_id = $1 AND entity_type = 'announcement' AND entity_id = $2 AND read_at IS NULL`,
      [userId, String(id)],
    );
    response.status(200).json({ success: true, message: "Marked as read." });
  } catch (error) {
    unavailable(response, error, "read marker");
  }
}

// ------------------------------------------------------------------ HR

const statusFilters = ["draft", "published", "archived", "all"] as const;

/** GET /api/announcements/manage?status=&page= - every announcement, for HR. */
export async function getManageList(request: Request, response: Response): Promise<void> {
  const status = request.query.status ?? "all";
  if (!statusFilters.includes(status as (typeof statusFilters)[number])) {
    response.status(400).json({ success: false, message: "Status must be draft, published, archived or all." });
    return;
  }
  const paged = paging(request, response, 20);
  if (!paged) return;
  try {
    const params: unknown[] = [status, paged.pageSize, (paged.page - 1) * paged.pageSize];
    const rows = await pool.query<AnnouncementRow & { read_count: number; total: number }>(
      `SELECT ${announcementColumns},
              (SELECT count(*)::int FROM public.announcement_reads r WHERE r.announcement_id = a.id) AS read_count,
              count(*) OVER ()::int AS total
       FROM public.announcements a
       ${announcementJoins}
       WHERE ($1 = 'all' OR a.status = $1)
       ORDER BY (a.status = 'draft') DESC, COALESCE(a.published_at, a.updated_at) DESC, a.id DESC
       LIMIT $2 OFFSET $3`,
      params,
    );
    const counts = await pool.query<{ status: string; count: number }>(
      "SELECT status, count(*)::int AS count FROM public.announcements GROUP BY status",
    );
    // How many people each audience reaches today, so "read by 12 of 23" is honest.
    const audience = await pool.query<{ department_id: string | null; is_total: number; count: number }>(
      `SELECT e.department_id, GROUPING(e.department_id) AS is_total, count(*)::int AS count
       FROM public.users u LEFT JOIN public.employees e ON e.id = u.employee_id
       WHERE ${eligibleAccountCondition}
       GROUP BY ROLLUP (e.department_id)`,
    );
    const everyone = audience.rows.find((row) => row.is_total === 1)?.count ?? 0;
    const byDepartment = new Map(
      audience.rows.filter((row) => row.is_total === 0 && row.department_id !== null)
        .map((row) => [String(row.department_id), row.count]),
    );

    response.status(200).json({
      success: true,
      data: {
        items: rows.rows.map((row) => ({
          ...toAnnouncement(row),
          readCount: row.read_count,
          audienceSize: row.department_id === null ? everyone : byDepartment.get(String(row.department_id)) ?? 0,
        })),
        total: rows.rows[0]?.total ?? 0,
        counts: Object.fromEntries(counts.rows.map((row) => [row.status, row.count])),
        page: paged.page,
        pageSize: paged.pageSize,
      },
    });
  } catch (error) {
    unavailable(response, error, "management list");
  }
}

async function checkContent(
  client: PoolClient,
  data: AnnouncementInput,
): Promise<Record<string, string> | null> {
  const errors: Record<string, string> = {};
  if (data.departmentId !== null) {
    const department = await client.query("SELECT 1 FROM public.departments WHERE id = $1", [data.departmentId]);
    if (department.rowCount === 0) errors.departmentId = "That department no longer exists.";
  }
  if (data.expiresOn !== null && data.expiresOn < await companyToday(client)) {
    errors.expiresOn = "Choose today or a later date.";
  }
  return Object.keys(errors).length > 0 ? errors : null;
}

async function withTransaction(
  response: Response,
  action: string,
  work: (client: PoolClient) => Promise<void>,
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
    await safeRollback(client);
    if (!response.headersSent) unavailable(response, error, action);
  } finally {
    client.release();
  }
}

async function reply(client: PoolClient, response: Response, status: number, id: number, message: string) {
  const row = await client.query<AnnouncementRow>(
    `SELECT ${announcementColumns} FROM public.announcements a ${announcementJoins} WHERE a.id = $1`, [id],
  );
  await client.query("COMMIT");
  response.status(status).json({ success: true, message, data: { announcement: toAnnouncement(row.rows[0]!) } });
}

/** POST /api/announcements - a new draft. */
export async function createAnnouncement(request: Request, response: Response): Promise<void> {
  const validation = validateAnnouncement(request.body, { withRevision: false });
  if (!validation.valid) {
    response.status(400).json({ success: false, message: "Check the highlighted fields.", errors: validation.errors });
    return;
  }
  const data = validation.data;
  await withTransaction(response, "creation", async (client) => {
    const problems = await checkContent(client, data);
    if (problems) {
      await safeRollback(client);
      response.status(400).json({ success: false, message: "Check the highlighted fields.", errors: problems });
      return;
    }
    const created = await client.query<{ id: string }>(
      `INSERT INTO public.announcements
         (title, body, priority, audience, department_id, expires_on, created_by, updated_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $7) RETURNING id`,
      [data.title, data.body, data.priority, data.audience, data.departmentId, data.expiresOn, request.user!.id],
    );
    const id = Number(created.rows[0]!.id);
    await recordAudit({
      actor: actorFromUser(request.user, request.user?.email),
      action: "ANNOUNCEMENT_CREATED",
      entityType: "announcement",
      entityId: id,
      summary: `Drafted announcement "${data.title}"`,
      changes: { title: data.title, priority: data.priority, audience: data.audience, department_id: data.departmentId, expires_on: data.expiresOn },
    }, client);
    await reply(client, response, 201, id, "Draft saved.");
  });
}

interface LockedAnnouncement {
  id: string;
  title: string;
  body: string;
  priority: string;
  audience: string;
  department_id: string | null;
  status: string;
  expires_on: string | null;
  revision: number;
}

async function lockAnnouncement(client: PoolClient, id: number): Promise<LockedAnnouncement | null> {
  const result = await client.query<LockedAnnouncement>(
    `SELECT id, title, body, priority, audience, department_id, status, expires_on::text AS expires_on, revision
     FROM public.announcements WHERE id = $1 FOR UPDATE`,
    [id],
  );
  return result.rows[0] ?? null;
}

function staleRevision(response: Response): void {
  response.status(409).json({
    success: false,
    code: "stale_revision",
    message: "Someone else changed this announcement since you opened it. Reload to see their changes.",
  });
}

/** PUT /api/announcements/:id - edit a draft, or correct a published one without changing who it reached. */
export async function updateAnnouncement(request: Request, response: Response): Promise<void> {
  const id = parseIdParam(request.params.id);
  if (id === null) {
    response.status(400).json({ success: false, message: "Invalid announcement ID" });
    return;
  }
  const validation = validateAnnouncement(request.body, { withRevision: true });
  if (!validation.valid) {
    response.status(400).json({ success: false, message: "Check the highlighted fields.", errors: validation.errors });
    return;
  }
  const data = validation.data;
  await withTransaction(response, "update", async (client) => {
    const existing = await lockAnnouncement(client, id);
    if (!existing) {
      await safeRollback(client);
      response.status(404).json({ success: false, message: "Announcement not found" });
      return;
    }
    if (existing.status === "archived") {
      await safeRollback(client);
      response.status(409).json({ success: false, code: "archived", message: "An archived announcement cannot be edited." });
      return;
    }
    if (existing.revision !== data.revision) {
      await safeRollback(client);
      staleRevision(response);
      return;
    }
    const departmentBefore = existing.department_id === null ? null : Number(existing.department_id);
    if (existing.status === "published" && (existing.audience !== data.audience || departmentBefore !== data.departmentId)) {
      await safeRollback(client);
      response.status(409).json({
        success: false,
        code: "audience_fixed",
        message: "Its audience is fixed once published. Archive it and publish a new announcement instead.",
      });
      return;
    }
    const problems = await checkContent(client, data);
    if (problems) {
      await safeRollback(client);
      response.status(400).json({ success: false, message: "Check the highlighted fields.", errors: problems });
      return;
    }
    await client.query(
      `UPDATE public.announcements
       SET title = $2, body = $3, priority = $4, audience = $5, department_id = $6, expires_on = $7,
           updated_by = $8, updated_at = CURRENT_TIMESTAMP, revision = revision + 1
       WHERE id = $1`,
      [id, data.title, data.body, data.priority, data.audience, data.departmentId, data.expiresOn, request.user!.id],
    );
    const changed: Record<string, unknown> = {};
    if (existing.title !== data.title) changed.title = { before: existing.title, after: data.title };
    if (existing.body !== data.body) changed.body_changed = true;
    if (existing.priority !== data.priority) changed.priority = { before: existing.priority, after: data.priority };
    if (existing.audience !== data.audience || departmentBefore !== data.departmentId) {
      changed.audience = { before: existing.audience, after: data.audience };
      changed.department_id = { before: departmentBefore, after: data.departmentId };
    }
    if (existing.expires_on !== data.expiresOn) changed.expires_on = { before: existing.expires_on, after: data.expiresOn };
    await recordAudit({
      actor: actorFromUser(request.user, request.user?.email),
      action: "ANNOUNCEMENT_UPDATED",
      entityType: "announcement",
      entityId: id,
      summary: `Edited ${existing.status} announcement "${data.title}"`,
      changes: changed,
    }, client);
    await reply(client, response, 200, id, existing.status === "published" ? "Changes published." : "Draft saved.");
  });
}

/** POST /api/announcements/:id/publish { revision } */
export async function publishAnnouncement(request: Request, response: Response): Promise<void> {
  const id = parseIdParam(request.params.id);
  const revision = (request.body ?? {}).revision;
  if (id === null || typeof revision !== "number" || !Number.isSafeInteger(revision)) {
    response.status(400).json({ success: false, message: "Send the announcement and the revision you reviewed." });
    return;
  }
  await withTransaction(response, "publication", async (client) => {
    const existing = await lockAnnouncement(client, id);
    if (!existing) {
      await safeRollback(client);
      response.status(404).json({ success: false, message: "Announcement not found" });
      return;
    }
    if (existing.status !== "draft") {
      await safeRollback(client);
      response.status(409).json({ success: false, code: "not_draft", message: `This announcement is already ${existing.status}.` });
      return;
    }
    if (existing.revision !== revision) {
      await safeRollback(client);
      staleRevision(response);
      return;
    }
    // Re-checked at publication: the department may have gone, or the expiry passed, since the draft was saved.
    const problems = await checkContent(client, {
      title: existing.title, body: existing.body,
      priority: existing.priority as AnnouncementInput["priority"],
      audience: existing.audience as AnnouncementInput["audience"],
      departmentId: existing.department_id === null ? null : Number(existing.department_id),
      expiresOn: existing.expires_on,
    });
    if (problems) {
      await safeRollback(client);
      response.status(409).json({ success: false, code: "cannot_publish", message: Object.values(problems).join(" "), errors: problems });
      return;
    }
    await client.query(
      `UPDATE public.announcements
       SET status = 'published', published_at = CURRENT_TIMESTAMP, published_by = $2,
           updated_by = $2, updated_at = CURRENT_TIMESTAMP, revision = revision + 1
       WHERE id = $1`,
      [id, request.user!.id],
    );
    await announcementPublished(client, existing, request.user!.id);
    await recordAudit({
      actor: actorFromUser(request.user, request.user?.email),
      action: "ANNOUNCEMENT_PUBLISHED",
      entityType: "announcement",
      entityId: id,
      summary: `Published announcement "${existing.title}" to ${existing.audience === "company" ? "the company" : `department #${existing.department_id}`}`,
      changes: { status: { before: "draft", after: "published" }, audience: existing.audience, department_id: existing.department_id },
    }, client);
    await reply(client, response, 200, id, "Published.");
  });
}

/** POST /api/announcements/:id/archive - takes it off every feed; history stays. */
export async function archiveAnnouncement(request: Request, response: Response): Promise<void> {
  const id = parseIdParam(request.params.id);
  if (id === null) {
    response.status(400).json({ success: false, message: "Invalid announcement ID" });
    return;
  }
  await withTransaction(response, "archive", async (client) => {
    const existing = await lockAnnouncement(client, id);
    if (!existing) {
      await safeRollback(client);
      response.status(404).json({ success: false, message: "Announcement not found" });
      return;
    }
    if (existing.status !== "published") {
      await safeRollback(client);
      response.status(409).json({
        success: false,
        code: "not_published",
        message: existing.status === "draft" ? "A draft is deleted, not archived." : "This announcement is already archived.",
      });
      return;
    }
    await client.query(
      `UPDATE public.announcements
       SET status = 'archived', archived_at = CURRENT_TIMESTAMP, archived_by = $2,
           updated_by = $2, updated_at = CURRENT_TIMESTAMP, revision = revision + 1
       WHERE id = $1`,
      [id, request.user!.id],
    );
    await recordAudit({
      actor: actorFromUser(request.user, request.user?.email),
      action: "ANNOUNCEMENT_ARCHIVED",
      entityType: "announcement",
      entityId: id,
      summary: `Archived announcement "${existing.title}"`,
      changes: { status: { before: "published", after: "archived" } },
    }, client);
    await reply(client, response, 200, id, "Archived.");
  });
}

/** DELETE /api/announcements/:id - drafts only; anything published is archived instead. */
export async function deleteAnnouncement(request: Request, response: Response): Promise<void> {
  const id = parseIdParam(request.params.id);
  if (id === null) {
    response.status(400).json({ success: false, message: "Invalid announcement ID" });
    return;
  }
  await withTransaction(response, "deletion", async (client) => {
    const existing = await lockAnnouncement(client, id);
    if (!existing) {
      await safeRollback(client);
      response.status(404).json({ success: false, message: "Announcement not found" });
      return;
    }
    if (existing.status !== "draft") {
      await safeRollback(client);
      response.status(409).json({
        success: false,
        code: "not_draft",
        message: "Only a draft can be deleted. Archive a published announcement instead.",
      });
      return;
    }
    await client.query("DELETE FROM public.announcements WHERE id = $1 AND status = 'draft'", [id]);
    await recordAudit({
      actor: actorFromUser(request.user, request.user?.email),
      action: "ANNOUNCEMENT_DELETED",
      entityType: "announcement",
      entityId: id,
      summary: `Deleted draft announcement "${existing.title}"`,
      changes: { title: existing.title },
    }, client);
    await client.query("COMMIT");
    response.status(200).json({ success: true, message: "Draft deleted." });
  });
}
