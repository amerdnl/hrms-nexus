/**
 * The administrator's end of the organisation chart.
 *
 * Every route here is behind the admin guard on the router, and each one runs
 * in a transaction with its audit entry, so a change to the company's structure
 * is either recorded with its author or did not happen.
 */
import type { Request, Response } from "express";
import pool from "../config/db.js";
import { actorFromUser, recordAudit } from "../services/auditService.js";
import {
  archivePosition,
  createPosition,
  loadPosition,
  OrgPositionError,
  parsePosition,
  updatePosition,
} from "../services/orgPositionService.js";

function fail(response: Response, error: unknown, what: string): void {
  if (error instanceof OrgPositionError) {
    response.status(error.status).json({
      success: false,
      message: error.message,
      ...(error.fields ? { errors: error.fields } : {}),
    });
    return;
  }
  console.error(`Failed to ${what}`, error);
  response.status(500).json({ success: false, message: `Could not ${what}.` });
}

const identifier = (raw: string | string[] | undefined): number => {
  const id = Number(Array.isArray(raw) ? raw[0] : raw);
  if (!Number.isInteger(id) || id <= 0) {
    throw new OrgPositionError(400, "bad_id", "That is not a position on the chart.");
  }
  return id;
};

/** A readable description of what changed, for the audit trail. */
const describe = (occupancy: string) =>
  occupancy === "filled" ? "filled" : occupancy === "filled_unnamed" ? "filled, occupant not recorded" : "vacant";

export async function postPosition(request: Request, response: Response): Promise<void> {
  const client = await pool.connect();
  try {
    const input = parsePosition(request.body ?? {});
    await client.query("BEGIN");
    const created = await createPosition(client, input);
    await recordAudit({
      actor: actorFromUser(request.user, request.user?.email),
      action: "ORG_POSITION_CREATED",
      entityType: "employee",
      entityId: created.id,
      summary: `Position "${input.title}" added to the org chart (${describe(input.occupancy)})`,
      changes: {
        title: input.title,
        positionKind: input.positionKind,
        occupancy: input.occupancy,
        managerId: input.managerId,
        additionalManagerIds: input.additionalManagerIds,
      },
    }, client);
    await client.query("COMMIT");
    response.status(201).json({ success: true, message: "Position added.", data: { id: created.id } });
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch { /* the failure below is the one to report */ }
    fail(response, error, "add the position");
  } finally {
    client.release();
  }
}

export async function patchPosition(request: Request, response: Response): Promise<void> {
  const client = await pool.connect();
  try {
    const id = identifier(request.params.id!);
    const input = parsePosition(request.body ?? {});
    await client.query("BEGIN");
    const before = await loadPosition(client, id);
    await updatePosition(client, id, input);

    // Only what actually moved goes into the record.
    const changes: Record<string, { before: unknown; after: unknown }> = {};
    const note = (key: string, was: unknown, now: unknown) => {
      if (String(was ?? "") !== String(now ?? "")) changes[key] = { before: was ?? null, after: now ?? null };
    };
    note("title", before.job_title ?? before.full_name, input.title);
    note("positionKind", before.position_kind, input.positionKind);
    note("occupancy", before.occupancy, input.occupancy);
    note("departmentId", before.department_id, input.departmentId);
    note("managerId", before.manager_id, input.managerId);
    note("notes", before.position_notes, input.notes);

    await recordAudit({
      actor: actorFromUser(request.user, request.user?.email),
      action: "ORG_POSITION_UPDATED",
      entityType: "employee",
      entityId: id,
      summary: `Position "${input.title}" updated on the org chart (${describe(input.occupancy)})`,
      changes: { ...changes, additionalManagerIds: input.additionalManagerIds },
    }, client);
    await client.query("COMMIT");
    response.status(200).json({ success: true, message: "Position saved.", data: { id } });
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch { /* the failure below is the one to report */ }
    fail(response, error, "save the position");
  } finally {
    client.release();
  }
}

export async function deletePosition(request: Request, response: Response): Promise<void> {
  const client = await pool.connect();
  try {
    const id = identifier(request.params.id!);
    await client.query("BEGIN");
    const before = await loadPosition(client, id);
    await archivePosition(client, id);
    await recordAudit({
      actor: actorFromUser(request.user, request.user?.email),
      action: "ORG_POSITION_ARCHIVED",
      entityType: "employee",
      entityId: id,
      summary: `Position "${before.full_name}" archived and taken off the org chart`,
      changes: { employment_status: { before: "active", after: "inactive" } },
    }, client);
    await client.query("COMMIT");
    response.status(200).json({ success: true, message: "Position archived." });
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch { /* the failure below is the one to report */ }
    fail(response, error, "archive the position");
  } finally {
    client.release();
  }
}
