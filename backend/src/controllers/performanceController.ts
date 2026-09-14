/**
 * Goals and performance reviews over HTTP. Visibility, scope and ordering live
 * in `goalService` and `reviewService`; this file parses input, owns the
 * transaction and turns their errors into responses.
 */
import type { Request, Response } from "express";
import type { PoolClient } from "pg";
import pool from "../config/db.js";
import {
  GoalError,
  createGoal,
  goalDetail,
  listForPerson,
  listMine,
  listTeam,
  recordProgress,
  updateGoal,
} from "../services/goalService.js";
import {
  ReviewError,
  closeCycle,
  createCycle,
  cycleParticipants,
  listCycles,
  myReviews,
  openCycle,
  participantDetail,
  respond,
  teamReviews,
  updateCycle,
  writeManager,
  writeSelf,
} from "../services/reviewService.js";
import { parseIdParam } from "../utils/employeeValidation.js";
import {
  validateCycle,
  validateGoal,
  validateGoalProgress,
  validateReviewWrite,
} from "../utils/performanceValidation.js";

function unavailable(response: Response, error: unknown, action: string): void {
  console.error(`Performance ${action} failed:`, error);
  response.status(503).json({ success: false, message: "Goals and reviews are temporarily unavailable. Please try again." });
}

/** Records the response a transaction sends once it has committed. */
type Reply = (status: number, body: unknown) => void;

async function inTransaction(response: Response, action: string, work: (client: PoolClient, reply: Reply) => Promise<void>): Promise<void> {
  let client: PoolClient;
  try {
    client = await pool.connect();
  } catch (error) {
    unavailable(response, error, action);
    return;
  }
  const outcome: { reply?: { status: number; body: unknown } } = {};
  const reply: Reply = (status, body) => { outcome.reply = { status, body }; };
  try {
    await client.query("BEGIN");
    await work(client, reply);
    await client.query("COMMIT");
    // Sent only now: a client told the change is done must be able to read it,
    // and a failed COMMIT must never follow a success response.
    if (outcome.reply) response.status(outcome.reply.status).json(outcome.reply.body);
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch { /* already lost */ }
    if (response.headersSent) return;
    if (error instanceof GoalError || error instanceof ReviewError) {
      response.status(error.status).json({ success: false, code: error.code, message: error.message, ...(error.errors ? { errors: error.errors } : {}) });
      return;
    }
    unavailable(response, error, action);
  } finally {
    client.release();
  }
}

function idOr400(request: Request, response: Response, name = "id", label = "ID"): number | null {
  const id = parseIdParam(request.params[name]);
  if (id === null) response.status(400).json({ success: false, message: `Invalid ${label}` });
  return id;
}

async function read<T>(response: Response, action: string, work: () => Promise<T | null>, notFound: string): Promise<void> {
  try {
    const data = await work();
    if (data === null) {
      response.status(404).json({ success: false, message: notFound });
      return;
    }
    response.status(200).json({ success: true, data });
  } catch (error) {
    unavailable(response, error, action);
  }
}

// ------------------------------------------------------------ goals

export const getMyGoals = (request: Request, response: Response) =>
  read(response, "goal list", () => listMine(request.user!), "Not found");

export const getTeamGoals = (request: Request, response: Response) =>
  read(response, "team goal list", () => listTeam(request.user!), "Not found");

export async function getPersonGoals(request: Request, response: Response): Promise<void> {
  const id = idOr400(request, response, "employeeId", "person ID");
  if (id === null) return;
  await read(response, "person goals", () => listForPerson(request.user!, id), "Person not found");
}

export async function getGoal(request: Request, response: Response): Promise<void> {
  const id = idOr400(request, response, "id", "goal ID");
  if (id === null) return;
  await read(response, "goal read", () => goalDetail(request.user!, id), "Goal not found");
}

export async function postGoal(request: Request, response: Response): Promise<void> {
  const validation = validateGoal(request.body, { update: false });
  if (!validation.valid) {
    response.status(400).json({ success: false, message: "Check the highlighted fields.", errors: validation.errors });
    return;
  }
  await inTransaction(response, "goal creation", async (client, reply) => {
    const id = await createGoal(client, request.user!, validation.data);
    reply(201, { success: true, message: "Goal saved.", data: { id } });
  });
}

export async function putGoal(request: Request, response: Response): Promise<void> {
  const id = idOr400(request, response, "id", "goal ID");
  if (id === null) return;
  const validation = validateGoal(request.body, { update: true });
  if (!validation.valid) {
    response.status(400).json({ success: false, message: "Check the highlighted fields.", errors: validation.errors });
    return;
  }
  await inTransaction(response, "goal update", async (client, reply) => {
    await updateGoal(client, request.user!, id, validation.data);
    reply(200, { success: true, message: "Goal saved." });
  });
}

export async function postGoalUpdate(request: Request, response: Response): Promise<void> {
  const id = idOr400(request, response, "id", "goal ID");
  if (id === null) return;
  const validation = validateGoalProgress(request.body);
  if (!validation.valid) {
    response.status(400).json({ success: false, message: "Check the highlighted fields.", errors: validation.errors });
    return;
  }
  await inTransaction(response, "goal progress", async (client, reply) => {
    const result = await recordProgress(client, request.user!, id, validation.data);
    reply(201, {
      success: true,
      message: result.status === "completed" ? "Goal completed." : result.status === "cancelled" ? "Goal cancelled." : "Progress recorded.",
      data: result,
    });
  });
}

// ------------------------------------------------------------ review cycles (HR)

export const getCycles = (_request: Request, response: Response) =>
  read(response, "cycle list", async () => ({ cycles: await listCycles() }), "Not found");

export async function getCycle(request: Request, response: Response): Promise<void> {
  const id = idOr400(request, response, "id", "cycle ID");
  if (id === null) return;
  await read(response, "cycle read", () => cycleParticipants(id), "Review cycle not found");
}

export async function postCycle(request: Request, response: Response): Promise<void> {
  const validation = validateCycle(request.body, { update: false });
  if (!validation.valid) {
    response.status(400).json({ success: false, message: "Check the highlighted fields.", errors: validation.errors });
    return;
  }
  await inTransaction(response, "cycle creation", async (client, reply) => {
    const id = await createCycle(client, request.user!, validation.data);
    reply(201, { success: true, message: "Cycle drafted.", data: { id } });
  });
}

export async function putCycle(request: Request, response: Response): Promise<void> {
  const id = idOr400(request, response, "id", "cycle ID");
  if (id === null) return;
  const validation = validateCycle(request.body, { update: true });
  if (!validation.valid) {
    response.status(400).json({ success: false, message: "Check the highlighted fields.", errors: validation.errors });
    return;
  }
  await inTransaction(response, "cycle update", async (client, reply) => {
    await updateCycle(client, request.user!, id, validation.data);
    reply(200, { success: true, message: "Cycle saved." });
  });
}

export async function postCycleOpen(request: Request, response: Response): Promise<void> {
  const id = idOr400(request, response, "id", "cycle ID");
  if (id === null) return;
  const raw = (request.body ?? {}).departmentId;
  const departmentId = raw === undefined || raw === null || raw === "" ? null : parseIdParam(typeof raw === "number" ? String(raw) : raw);
  if (raw !== undefined && raw !== null && raw !== "" && departmentId === null) {
    response.status(400).json({ success: false, message: "Invalid department.", errors: { departmentId: "Choose a department or the whole company." } });
    return;
  }
  await inTransaction(response, "cycle opening", async (client, reply) => {
    const result = await openCycle(client, request.user!, id, departmentId);
    reply(200, { success: true, message: `Opened for ${result.participants} people. Each has been told their self-review is due.`, data: result });
  });
}

export async function postCycleClose(request: Request, response: Response): Promise<void> {
  const id = idOr400(request, response, "id", "cycle ID");
  if (id === null) return;
  await inTransaction(response, "cycle closing", async (client, reply) => {
    await closeCycle(client, request.user!, id);
    reply(200, { success: true, message: "Cycle closed. Reviews can no longer be written." });
  });
}

// ------------------------------------------------------------ reviews

export const getMyReviews = (request: Request, response: Response) =>
  read(response, "review list", () => myReviews(request.user!), "Not found");

export const getTeamReviews = (request: Request, response: Response) =>
  read(response, "team review list", () => teamReviews(request.user!), "Not found");

export async function getParticipant(request: Request, response: Response): Promise<void> {
  const id = idOr400(request, response, "id", "review ID");
  if (id === null) return;
  await read(response, "review read", () => participantDetail(request.user!, id), "Review not found");
}

export async function putSelfReview(request: Request, response: Response): Promise<void> {
  const id = idOr400(request, response, "id", "review ID");
  if (id === null) return;
  const validation = validateReviewWrite(request.body);
  if (!validation.valid) {
    response.status(400).json({ success: false, message: "Check the highlighted fields.", errors: validation.errors });
    return;
  }
  await inTransaction(response, "self-review", async (client, reply) => {
    const result = await writeSelf(client, request.user!, id, validation.data);
    reply(200, { success: true, message: result.submitted ? "Self-review submitted. Your manager has been told." : "Draft saved. Only you can see it.", data: result });
  });
}

export async function putManagerReview(request: Request, response: Response): Promise<void> {
  const id = idOr400(request, response, "id", "review ID");
  if (id === null) return;
  const validation = validateReviewWrite(request.body);
  if (!validation.valid) {
    response.status(400).json({ success: false, message: "Check the highlighted fields.", errors: validation.errors });
    return;
  }
  await inTransaction(response, "manager review", async (client, reply) => {
    const result = await writeManager(client, request.user!, id, validation.data);
    reply(200, { success: true, message: result.submitted ? "Review submitted. They have been told it is ready to read." : "Draft saved. They cannot see it until you submit.", data: result });
  });
}

export async function putResponse(request: Request, response: Response): Promise<void> {
  const id = idOr400(request, response, "id", "review ID");
  if (id === null) return;
  const body = request.body ?? {};
  const text = typeof body.response === "string" ? body.response.replace(/\r\n/g, "\n").trim() : "";
  const extra = Object.keys(body).filter((key) => key !== "response");
  if (extra.length > 0 || text.length < 1 || text.length > 2000) {
    response.status(400).json({ success: false, message: "Check the highlighted fields.", errors: { response: extra.length > 0 ? `Unexpected field: ${extra[0]}.` : "Write a response of up to 2000 characters." } });
    return;
  }
  await inTransaction(response, "review response", async (client, reply) => {
    await respond(client, request.user!, id, text);
    reply(200, { success: true, message: "Response saved." });
  });
}
