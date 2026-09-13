/**
 * Recognition over HTTP: the feed views, giving, a profile's recognition and
 * HR moderation. Visibility and limits live in `recognitionService`.
 */
import type { Request, Response } from "express";
import type { PoolClient } from "pg";
import { relationTo } from "../auth/policy.js";
import pool from "../config/db.js";
import {
  RecognitionError,
  giveRecognition,
  listRecognition,
  recognitionCategories,
  recognitionForProfile,
  setHidden,
  type FeedView,
  type RecognitionCategory,
} from "../services/recognitionService.js";
import { parseIdParam } from "../utils/employeeValidation.js";

const MAX_PAGE_SIZE = 50;
const views: FeedView[] = ["company", "received", "given", "all"];

function unavailable(response: Response, error: unknown, action: string): void {
  console.error(`Recognition ${action} failed:`, error);
  response.status(503).json({ success: false, message: "Recognition is temporarily unavailable. Please try again." });
}

function hasControlCharacters(value: string): boolean {
  return [...value].some((character) => {
    const code = character.charCodeAt(0);
    return (code < 32 && code !== 10 && code !== 13 && code !== 9) || code === 127;
  });
}

/** GET /api/recognition?view=company|received|given|all&page&pageSize */
export async function getRecognition(request: Request, response: Response): Promise<void> {
  const view = (request.query.view ?? "company") as FeedView;
  if (!views.includes(view)) {
    response.status(400).json({ success: false, message: "View must be company, received, given or all." });
    return;
  }
  const user = request.user!;
  if (view === "all" && user.role !== "admin") {
    response.status(403).json({ success: false, message: "Only HR sees every recognition." });
    return;
  }
  if ((view === "received" || view === "given") && user.employeeId === null) {
    response.status(403).json({ success: false, code: "no_employee_record", message: "This account has no employee record." });
    return;
  }
  const page = Number(request.query.page ?? 1);
  const pageSize = Number(request.query.pageSize ?? 20);
  if (!Number.isSafeInteger(page) || page < 1 || page > 100_000 || !Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > MAX_PAGE_SIZE) {
    response.status(400).json({ success: false, message: `Page sizes run from 1 to ${MAX_PAGE_SIZE}.` });
    return;
  }
  try {
    response.status(200).json({ success: true, data: await listRecognition(user, { view, page, pageSize }) });
  } catch (error) {
    unavailable(response, error, "feed");
  }
}

/** POST /api/recognition { receiverId, category, message, visibility } */
export async function postRecognition(request: Request, response: Response): Promise<void> {
  const body = request.body;
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    response.status(400).json({ success: false, message: "Send the recognition as a JSON object." });
    return;
  }
  const errors: Record<string, string> = {};
  const extra = Object.keys(body).filter((key) => !["receiverId", "category", "message", "visibility"].includes(key));
  if (extra.length > 0) errors.form = `Unexpected field: ${extra[0]}.`;
  const receiverId = parseIdParam(typeof body.receiverId === "number" ? String(body.receiverId) : body.receiverId);
  if (receiverId === null) errors.receiverId = "Choose who to recognise.";
  if (!(body.category in recognitionCategories)) errors.category = "Choose a category.";
  const message = typeof body.message === "string" ? body.message.replace(/\r\n/g, "\n").trim() : "";
  if (message.length < 5) errors.message = "Write at least 5 characters.";
  else if (message.length > 500) errors.message = "Keep it to 500 characters.";
  else if (hasControlCharacters(message)) errors.message = "Remove unusual characters.";
  const visibility = body.visibility ?? "company";
  if (visibility !== "company" && visibility !== "private") errors.visibility = "Choose company or private.";
  if (Object.keys(errors).length > 0) {
    response.status(400).json({ success: false, message: "Check the highlighted fields.", errors });
    return;
  }

  let client: PoolClient;
  try {
    client = await pool.connect();
  } catch (error) {
    unavailable(response, error, "giving");
    return;
  }
  try {
    await client.query("BEGIN");
    const result = await giveRecognition(client, request.user!, {
      receiverId: receiverId!, category: body.category as RecognitionCategory, message, visibility,
    });
    await client.query("COMMIT");
    response.status(201).json({ success: true, message: "Recognition sent.", data: result });
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch { /* already lost */ }
    if (error instanceof RecognitionError) {
      response.status(error.status).json({ success: false, code: error.code, message: error.message, ...(error.errors ? { errors: error.errors } : {}) });
      return;
    }
    unavailable(response, error, "giving");
  } finally {
    client.release();
  }
}

/** GET /api/people/:id/recognition - what someone received, as the caller may see it. */
export async function getPersonRecognition(request: Request, response: Response): Promise<void> {
  const employeeId = parseIdParam(request.params.id);
  if (employeeId === null) {
    response.status(400).json({ success: false, message: "Invalid person ID" });
    return;
  }
  try {
    const relation = await relationTo(request.user!, employeeId);
    if (relation === null) {
      response.status(404).json({ success: false, message: "Person not found" });
      return;
    }
    response.status(200).json({ success: true, data: await recognitionForProfile(employeeId, request.user!) });
  } catch (error) {
    unavailable(response, error, "profile read");
  }
}

/** PUT /api/recognition/:id/hidden { hidden } - HR moderation. */
export async function putHidden(request: Request, response: Response): Promise<void> {
  const id = parseIdParam(request.params.id);
  const hidden = (request.body ?? {}).hidden;
  if (id === null || typeof hidden !== "boolean") {
    response.status(400).json({ success: false, message: "Send the recognition and whether it is hidden." });
    return;
  }
  let client: PoolClient;
  try {
    client = await pool.connect();
  } catch (error) {
    unavailable(response, error, "moderation");
    return;
  }
  try {
    await client.query("BEGIN");
    const result = await setHidden(client, id, hidden, request.user!);
    await client.query("COMMIT");
    response.status(200).json({ success: true, message: hidden ? "Hidden from everyone but HR." : "Visible again.", data: result });
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch { /* already lost */ }
    if (error instanceof RecognitionError) {
      response.status(error.status).json({ success: false, code: error.code, message: error.message });
      return;
    }
    unavailable(response, error, "moderation");
  } finally {
    client.release();
  }
}
