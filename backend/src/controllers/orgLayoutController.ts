/**
 * The layout of the organisation chart, and the relationships drawn on it.
 *
 * LAYOUT IS NOT STRUCTURE. Moving a card changes where it sits and nothing
 * else: who reports to whom lives in employees.manager_id and
 * employee_additional_managers, and only the relationship routes below touch
 * them. That separation is the whole point - an administrator tidying the chart
 * must never silently reassign anybody.
 *
 * Every route here is behind the admin guard on the router.
 */
import type { Request, Response } from "express";
import pool from "../config/db.js";
import { actorFromUser, recordAudit } from "../services/auditService.js";
import { OrgPositionError } from "../services/orgPositionService.js";

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

const coordinate = (value: unknown): number => {
  const number = Number(value);
  if (!Number.isFinite(number) || number < -500 || number > 500) {
    throw new OrgPositionError(422, "bad_coordinate", "That is not a place on the chart.");
  }
  return Math.round(number * 1000) / 1000;
};

/**
 * Saves where cards and notes have been dragged to.
 *
 * Deliberately not audited row by row. Nudging a card is not an HR decision,
 * and a log full of movements is a log nobody reads when a real change needs
 * finding.
 */
export async function putLayout(request: Request, response: Response): Promise<void> {
  const client = await pool.connect();
  try {
    const body = request.body ?? {};
    const positions = Array.isArray(body.positions) ? body.positions : [];
    const notes = Array.isArray(body.notes) ? body.notes : [];
    if (positions.length > 500 || notes.length > 200) {
      throw new OrgPositionError(422, "too_many", "Too many items in one save.");
    }

    await client.query("BEGIN");
    for (const item of positions) {
      const id = Number((item as { id: unknown }).id);
      if (!Number.isInteger(id) || id <= 0) continue;
      const x = coordinate((item as { x: unknown }).x);
      const y = coordinate((item as { y: unknown }).y);
      await client.query(
        `INSERT INTO public.org_chart_source_layout (employee_id, source_x, source_y, source_width, source_height)
         VALUES ($1, $2, $3, 1.34, 0.6)
         ON CONFLICT (employee_id) DO UPDATE SET source_x = EXCLUDED.source_x, source_y = EXCLUDED.source_y`,
        [id, x, y],
      );
    }
    for (const item of notes) {
      const id = Number((item as { id: unknown }).id);
      if (!Number.isInteger(id) || id <= 0) continue;
      await client.query(
        "UPDATE public.org_chart_source_notes SET source_x = $2, source_y = $3 WHERE id = $1",
        [id, coordinate((item as { x: unknown }).x), coordinate((item as { y: unknown }).y)],
      );
    }
    await client.query("COMMIT");
    response.status(200).json({ success: true, message: "Layout saved." });
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch { /* the failure below is the one to report */ }
    fail(response, error, "save the layout");
  } finally {
    client.release();
  }
}

/** An information panel: context on the chart that describes no post. */
export async function postNote(request: Request, response: Response): Promise<void> {
  const client = await pool.connect();
  try {
    const body = request.body ?? {};
    const label = typeof body.label === "string" ? body.label.trim() : "";
    if (!label) {
      throw new OrgPositionError(422, "validation_failed", "A panel needs a heading.", {
        label: "Give the panel a heading.",
      });
    }
    const text = typeof body.body === "string" && body.body.trim() ? body.body.trim() : null;
    await client.query("BEGIN");
    const created = await client.query<{ id: string }>(
      `INSERT INTO public.org_chart_source_notes (label, body, source_x, source_y, source_width, source_height)
       VALUES ($1, $2, $3, $4, 1.34, 0.8) RETURNING id`,
      [label.slice(0, 200), text, coordinate(body.x ?? 0.2), coordinate(body.y ?? 0.2)],
    );
    await recordAudit({
      actor: actorFromUser(request.user, request.user?.email),
      action: "ORG_NOTE_CREATED",
      entityType: "employee",
      summary: `Information panel "${label}" added to the org chart`,
    }, client);
    await client.query("COMMIT");
    response.status(201).json({ success: true, message: "Panel added.", data: { id: Number(created.rows[0]!.id) } });
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch { /* the failure below is the one to report */ }
    fail(response, error, "add the panel");
  } finally {
    client.release();
  }
}

export async function patchNote(request: Request, response: Response): Promise<void> {
  const client = await pool.connect();
  try {
    const id = Number(request.params.id);
    const body = request.body ?? {};
    const label = typeof body.label === "string" ? body.label.trim() : "";
    if (!Number.isInteger(id) || !label) {
      throw new OrgPositionError(422, "validation_failed", "A panel needs a heading.", {
        label: "Give the panel a heading.",
      });
    }
    const text = typeof body.body === "string" && body.body.trim() ? body.body.trim() : null;
    await client.query("BEGIN");
    const updated = await client.query(
      "UPDATE public.org_chart_source_notes SET label = $2, body = $3 WHERE id = $1",
      [id, label.slice(0, 200), text],
    );
    if (updated.rowCount === 0) throw new OrgPositionError(404, "not_found", "That panel is not on the chart.");
    await recordAudit({
      actor: actorFromUser(request.user, request.user?.email),
      action: "ORG_NOTE_UPDATED",
      entityType: "employee",
      summary: `Information panel "${label}" edited on the org chart`,
    }, client);
    await client.query("COMMIT");
    response.status(200).json({ success: true, message: "Panel saved." });
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch { /* the failure below is the one to report */ }
    fail(response, error, "save the panel");
  } finally {
    client.release();
  }
}

export async function deleteNote(request: Request, response: Response): Promise<void> {
  const client = await pool.connect();
  try {
    const id = Number(request.params.id);
    if (!Number.isInteger(id)) throw new OrgPositionError(400, "bad_id", "That is not a panel.");
    await client.query("BEGIN");
    const removed = await client.query<{ label: string }>(
      "DELETE FROM public.org_chart_source_notes WHERE id = $1 RETURNING label",
      [id],
    );
    if (removed.rowCount === 0) throw new OrgPositionError(404, "not_found", "That panel is not on the chart.");
    await recordAudit({
      actor: actorFromUser(request.user, request.user?.email),
      action: "ORG_NOTE_DELETED",
      entityType: "employee",
      summary: `Information panel "${removed.rows[0]!.label}" removed from the org chart`,
    }, client);
    await client.query("COMMIT");
    response.status(200).json({ success: true, message: "Panel removed." });
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch { /* the failure below is the one to report */ }
    fail(response, error, "remove the panel");
  } finally {
    client.release();
  }
}

/**
 * Creates one reporting relationship, drawn from card to card.
 *
 * `kind` decides which of the two structures it joins: `primary` is the single
 * operational line on the employee, `additional` is one of the extra lines the
 * chart draws and nothing else reads.
 */
export async function postRelationship(request: Request, response: Response): Promise<void> {
  const client = await pool.connect();
  try {
    const body = request.body ?? {};
    const childId = Number(body.childId);
    const parentId = Number(body.parentId);
    const kind = body.kind === "primary" ? "primary" : "additional";
    const confidence = body.confidence === "unconfirmed" ? "unconfirmed" : "confirmed";
    if (!Number.isInteger(childId) || !Number.isInteger(parentId) || childId === parentId) {
      throw new OrgPositionError(422, "validation_failed", "Choose two different positions.");
    }

    await client.query("BEGIN");
    const names = await client.query<{ id: string; full_name: string }>(
      "SELECT id, full_name FROM public.employees WHERE id = ANY($1::int[])",
      [[childId, parentId]],
    );
    if (names.rowCount !== 2) throw new OrgPositionError(404, "not_found", "One of those positions is not on the chart.");
    const nameOf = (id: number) => names.rows.find((row) => Number(row.id) === id)!.full_name;

    if (kind === "primary") {
      // The database trigger refuses a loop here, which is the authority.
      await client.query(
        `UPDATE public.employees
         SET manager_id = $2, reporting_line_confidence = $3, updated_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [childId, parentId, confidence],
      );
      // The same pair cannot be both the operational line and an extra one.
      await client.query(
        "DELETE FROM public.employee_additional_managers WHERE employee_id = $1 AND manager_id = $2",
        [childId, parentId],
      );
    } else {
      const primary = await client.query<{ manager_id: string | null }>(
        "SELECT manager_id FROM public.employees WHERE id = $1",
        [childId],
      );
      if (Number(primary.rows[0]?.manager_id) === parentId) {
        throw new OrgPositionError(409, "already_primary", `${nameOf(parentId)} is already the primary manager.`);
      }
      await client.query(
        `INSERT INTO public.employee_additional_managers (employee_id, manager_id, confidence)
         VALUES ($1, $2, $3)
         ON CONFLICT (employee_id, manager_id) DO UPDATE SET confidence = EXCLUDED.confidence`,
        [childId, parentId, confidence],
      );
    }

    await recordAudit({
      actor: actorFromUser(request.user, request.user?.email),
      action: kind === "primary" ? "MANAGER_CHANGED" : "ORG_RELATIONSHIP_ADDED",
      entityType: "employee",
      entityId: childId,
      summary:
        kind === "primary"
          ? `${nameOf(childId)} now reports to ${nameOf(parentId)} on the org chart`
          : `${nameOf(childId)} also reports to ${nameOf(parentId)} (${confidence})`,
      changes: { childId, parentId, kind, confidence },
    }, client);
    await client.query("COMMIT");
    response.status(201).json({ success: true, message: "Reporting line saved." });
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch { /* the failure below is the one to report */ }
    if (error && typeof error === "object" && (error as { constraint?: string }).constraint === "employees_manager_cycle") {
      response.status(409).json({ success: false, message: "That reporting line would loop back on itself." });
      return;
    }
    fail(response, error, "save the reporting line");
  } finally {
    client.release();
  }
}

/** Removes one reporting line. The primary line is cleared, not deleted. */
export async function deleteRelationship(request: Request, response: Response): Promise<void> {
  const client = await pool.connect();
  try {
    const childId = Number(request.params.childId);
    const parentId = Number(request.params.parentId);
    if (!Number.isInteger(childId) || !Number.isInteger(parentId)) {
      throw new OrgPositionError(400, "bad_id", "That is not a reporting line.");
    }
    await client.query("BEGIN");
    const names = await client.query<{ id: string; full_name: string }>(
      "SELECT id, full_name FROM public.employees WHERE id = ANY($1::int[])",
      [[childId, parentId]],
    );
    const nameOf = (id: number) => names.rows.find((row) => Number(row.id) === id)?.full_name ?? `#${id}`;

    const removed = await client.query(
      "DELETE FROM public.employee_additional_managers WHERE employee_id = $1 AND manager_id = $2",
      [childId, parentId],
    );
    let kind = "additional";
    if (removed.rowCount === 0) {
      const cleared = await client.query(
        `UPDATE public.employees
         SET manager_id = NULL, reporting_line_confidence = NULL, updated_at = CURRENT_TIMESTAMP
         WHERE id = $1 AND manager_id = $2`,
        [childId, parentId],
      );
      if (cleared.rowCount === 0) throw new OrgPositionError(404, "not_found", "That reporting line is not recorded.");
      kind = "primary";
    }

    await recordAudit({
      actor: actorFromUser(request.user, request.user?.email),
      action: "ORG_RELATIONSHIP_REMOVED",
      entityType: "employee",
      entityId: childId,
      summary: `${nameOf(childId)} no longer reports to ${nameOf(parentId)} (${kind} line removed)`,
      changes: { childId, parentId, kind },
    }, client);
    await client.query("COMMIT");
    response.status(200).json({ success: true, message: "Reporting line removed." });
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch { /* the failure below is the one to report */ }
    fail(response, error, "remove the reporting line");
  } finally {
    client.release();
  }
}
