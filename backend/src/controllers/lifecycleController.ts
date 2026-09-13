/**
 * Onboarding and offboarding over HTTP. Scope decisions live in
 * `lifecycleService`; this file parses input, owns the transaction and turns a
 * LifecycleError into its response.
 */
import type { Request, Response } from "express";
import type { PoolClient } from "pg";
import pool from "../config/db.js";
import {
  LifecycleError,
  cancelPlan,
  completePlan,
  createTemplate,
  listPlans,
  listTemplates,
  myWork,
  planDetail,
  startPlan,
  updateTask,
  updateTemplate,
} from "../services/lifecycleService.js";
import { parseIdParam } from "../utils/employeeValidation.js";
import {
  lifecycleKinds,
  validatePlanStart,
  validateTaskUpdate,
  validateTemplate,
} from "../utils/lifecycleValidation.js";

function unavailable(response: Response, error: unknown, action: string): void {
  console.error(`Lifecycle ${action} failed:`, error);
  response.status(503).json({
    success: false,
    message: "Onboarding and offboarding are temporarily unavailable. Please try again.",
  });
}

async function inTransaction(response: Response, action: string, work: (client: PoolClient) => Promise<void>): Promise<void> {
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
    await client.query("COMMIT");
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // Already lost.
    }
    if (response.headersSent) return;
    if (error instanceof LifecycleError) {
      response.status(error.status).json({ success: false, code: error.code, message: error.message, ...(error.errors ? { errors: error.errors } : {}) });
      return;
    }
    unavailable(response, error, action);
  } finally {
    client.release();
  }
}

function kindFilter(request: Request, response: Response): string | null | undefined {
  const kind = request.query.kind;
  if (kind === undefined) return null;
  if (!lifecycleKinds.includes(kind as (typeof lifecycleKinds)[number])) {
    response.status(400).json({ success: false, message: "Kind must be onboarding or offboarding." });
    return undefined;
  }
  return kind as string;
}

// ------------------------------------------------------------ templates (HR)

export async function getTemplates(request: Request, response: Response): Promise<void> {
  const kind = kindFilter(request, response);
  if (kind === undefined) return;
  try {
    response.status(200).json({ success: true, data: { templates: await listTemplates(kind) } });
  } catch (error) {
    unavailable(response, error, "template list");
  }
}

export async function postTemplate(request: Request, response: Response): Promise<void> {
  const validation = validateTemplate(request.body, { update: false });
  if (!validation.valid) {
    response.status(400).json({ success: false, message: "Check the highlighted fields.", errors: validation.errors });
    return;
  }
  await inTransaction(response, "template creation", async (client) => {
    const id = await createTemplate(client, validation.data, request.user!);
    response.status(201).json({ success: true, message: "Checklist saved.", data: { id } });
  });
}

export async function putTemplate(request: Request, response: Response): Promise<void> {
  const id = parseIdParam(request.params.id);
  if (id === null) {
    response.status(400).json({ success: false, message: "Invalid checklist ID" });
    return;
  }
  const validation = validateTemplate(request.body, { update: true });
  if (!validation.valid) {
    response.status(400).json({ success: false, message: "Check the highlighted fields.", errors: validation.errors });
    return;
  }
  await inTransaction(response, "template update", async (client) => {
    await updateTemplate(client, id, validation.data, request.user!);
    response.status(200).json({ success: true, message: "Checklist saved. Plans already started keep their own tasks." });
  });
}

// ------------------------------------------------------------ plans

const planStatuses = ["active", "completed", "cancelled"];

export async function getPlans(request: Request, response: Response): Promise<void> {
  const kind = kindFilter(request, response);
  if (kind === undefined) return;
  const status = request.query.status;
  if (status !== undefined && !planStatuses.includes(status as string)) {
    response.status(400).json({ success: false, message: "Status must be active, completed or cancelled." });
    return;
  }
  try {
    response.status(200).json({ success: true, data: await listPlans({ kind, status: (status as string | undefined) ?? null }) });
  } catch (error) {
    unavailable(response, error, "plan list");
  }
}

export async function postPlan(request: Request, response: Response): Promise<void> {
  const validation = validatePlanStart(request.body);
  if (!validation.valid) {
    response.status(400).json({ success: false, message: "Check the highlighted fields.", errors: validation.errors });
    return;
  }
  await inTransaction(response, "plan start", async (client) => {
    const id = await startPlan(client, validation.data, request.user!);
    response.status(201).json({
      success: true,
      message: validation.data.kind === "onboarding" ? "Onboarding started." : "Offboarding started. Their account stays active until you complete it.",
      data: { id },
    });
  });
}

export async function getPlan(request: Request, response: Response): Promise<void> {
  const id = parseIdParam(request.params.id);
  if (id === null) {
    response.status(400).json({ success: false, message: "Invalid plan ID" });
    return;
  }
  try {
    const detail = await planDetail(id, request.user!);
    if (!detail) {
      response.status(404).json({ success: false, message: "Plan not found" });
      return;
    }
    response.status(200).json({ success: true, data: detail });
  } catch (error) {
    unavailable(response, error, "plan read");
  }
}

export async function postPlanComplete(request: Request, response: Response): Promise<void> {
  const id = parseIdParam(request.params.id);
  if (id === null) {
    response.status(400).json({ success: false, message: "Invalid plan ID" });
    return;
  }
  await inTransaction(response, "plan completion", async (client) => {
    const result = await completePlan(client, id, request.user!);
    response.status(200).json({
      success: true,
      message: result.deactivated ? "Offboarding completed. The employee is deactivated and their history is kept." : "Onboarding completed.",
      data: result,
    });
  });
}

export async function postPlanCancel(request: Request, response: Response): Promise<void> {
  const id = parseIdParam(request.params.id);
  if (id === null) {
    response.status(400).json({ success: false, message: "Invalid plan ID" });
    return;
  }
  await inTransaction(response, "plan cancellation", async (client) => {
    await cancelPlan(client, id, request.user!);
    response.status(200).json({ success: true, message: "Plan cancelled. Employment is unchanged." });
  });
}

// ------------------------------------------------------------ tasks and my work

export async function getMyWork(request: Request, response: Response): Promise<void> {
  try {
    response.status(200).json({ success: true, data: await myWork(request.user!) });
  } catch (error) {
    unavailable(response, error, "task list");
  }
}

export async function putTask(request: Request, response: Response): Promise<void> {
  const id = parseIdParam(request.params.id);
  if (id === null) {
    response.status(400).json({ success: false, message: "Invalid task ID" });
    return;
  }
  const validation = validateTaskUpdate(request.body);
  if (!validation.valid) {
    response.status(400).json({ success: false, message: "Check the highlighted fields.", errors: validation.errors });
    return;
  }
  await inTransaction(response, "task update", async (client) => {
    const result = await updateTask(client, id, validation.data, request.user!);
    response.status(200).json({
      success: true,
      message: result.planCompleted ? "Done. That was the last task: onboarding is complete." : "Task updated.",
      data: result,
    });
  });
}
