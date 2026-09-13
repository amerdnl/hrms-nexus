/**
 * The caller's own notifications. Every query is keyed by the session's user
 * id, so there is no id a caller can send that reaches someone else's: a
 * notification that is not theirs is simply not found.
 */
import type { Request, Response } from "express";
import {
  listFor,
  markAllRead,
  markRead,
  pruneFor,
  unreadCount,
} from "../services/notificationService.js";
import { parseIdParam } from "../utils/employeeValidation.js";

const MAX_LIMIT = 50;

function unavailable(response: Response, error: unknown, action: string): void {
  console.error(`Notification ${action} failed:`, error);
  response.status(503).json({
    success: false,
    message: "Notifications are temporarily unavailable. Please try again.",
  });
}

/** GET /api/notifications?filter=unread|all&before=<id>&limit=<1..50> */
export async function getNotifications(request: Request, response: Response): Promise<void> {
  const filter = request.query.filter ?? "all";
  if (filter !== "all" && filter !== "unread") {
    response.status(400).json({ success: false, message: "Filter must be all or unread." });
    return;
  }
  const rawBefore = request.query.before;
  const beforeId = rawBefore === undefined ? null : parseIdParam(rawBefore);
  if (rawBefore !== undefined && beforeId === null) {
    response.status(400).json({ success: false, message: "Invalid cursor." });
    return;
  }
  const limit = Number(request.query.limit ?? 20);
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
    response.status(400).json({ success: false, message: `Ask for 1 to ${MAX_LIMIT} notifications.` });
    return;
  }

  const userId = request.user!.id;
  try {
    // Retention runs on the first page only, so paging stays a pure read.
    if (beforeId === null) await pruneFor(userId);
    const page = await listFor(userId, { unreadOnly: filter === "unread", beforeId, limit });
    response.status(200).json({ success: true, data: { ...page, unreadCount: await unreadCount(userId) } });
  } catch (error) {
    unavailable(response, error, "listing");
  }
}

/** GET /api/notifications/unread-count - the header badge. */
export async function getUnreadCount(request: Request, response: Response): Promise<void> {
  try {
    response.status(200).json({ success: true, data: { unreadCount: await unreadCount(request.user!.id) } });
  } catch (error) {
    unavailable(response, error, "count");
  }
}

/** PUT /api/notifications/:id/read */
export async function readNotification(request: Request, response: Response): Promise<void> {
  const id = parseIdParam(request.params.id);
  if (id === null) {
    response.status(400).json({ success: false, message: "Invalid notification ID" });
    return;
  }
  try {
    if (!(await markRead(request.user!.id, id))) {
      response.status(404).json({ success: false, message: "Notification not found" });
      return;
    }
    response.status(200).json({ success: true, data: { unreadCount: await unreadCount(request.user!.id) } });
  } catch (error) {
    unavailable(response, error, "update");
  }
}

/** PUT /api/notifications/read-all */
export async function readAllNotifications(request: Request, response: Response): Promise<void> {
  try {
    const updated = await markAllRead(request.user!.id);
    response.status(200).json({ success: true, data: { updated, unreadCount: 0 } });
  } catch (error) {
    unavailable(response, error, "update");
  }
}
