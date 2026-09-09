/**
 * Reading the audit log.
 *
 * Administrator-only, enforced by the router. There is deliberately no write
 * endpoint: entries are produced by the actions they describe, never by a client
 * asking for one, so no caller can forge history.
 */
import type { Request, Response } from "express";
import {
  auditActions,
  auditEntityTypes,
  listAudit,
  type AuditQuery,
} from "../services/auditService.js";
import { parseIdParam } from "../utils/employeeValidation.js";
import { parseDate } from "../utils/leaveCalculation.js";

const MAX_PAGE_SIZE = 100;
const DEFAULT_PAGE_SIZE = 25;

/** Only values from the closed lists reach the query; anything else is ignored. */
function pickFrom(readonlyList: readonly string[], value: unknown): string | null {
  return typeof value === "string" && readonlyList.includes(value) ? value : null;
}

function pickDate(value: unknown): string | null {
  return typeof value === "string" && value !== "" && parseDate(value) ? value : null;
}

export async function getAuditLog(request: Request, response: Response): Promise<void> {
  const rawPage = Number(request.query.page ?? 1);
  const rawSize = Number(request.query.pageSize ?? DEFAULT_PAGE_SIZE);

  const page = Number.isSafeInteger(rawPage) && rawPage > 0 ? rawPage : 1;
  const pageSize = Number.isSafeInteger(rawSize) && rawSize > 0
    ? Math.min(rawSize, MAX_PAGE_SIZE)
    : DEFAULT_PAGE_SIZE;

  const entityIdRaw = request.query.entityId;
  const actorRaw = request.query.actorUserId;

  const query: AuditQuery = {
    action: pickFrom(auditActions, request.query.action),
    entityType: pickFrom(auditEntityTypes, request.query.entityType),
    entityId:
      typeof entityIdRaw === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(entityIdRaw)
        ? entityIdRaw : null,
    actorUserId:
      typeof actorRaw === "string" ? parseIdParam(actorRaw) : null,
    outcome: pickFrom(["success", "failure"], request.query.outcome),
    from: pickDate(request.query.from),
    to: pickDate(request.query.to),
    limit: pageSize,
    offset: (page - 1) * pageSize,
  };

  try {
    const { rows, total } = await listAudit(query);
    response.status(200).json({
      success: true,
      data: {
        events: rows,
        page,
        pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
        // Offered so the UI's filters cannot drift from what the server accepts.
        actions: auditActions,
        entityTypes: auditEntityTypes,
      },
    });
  } catch (error) {
    console.error("Audit log read failed:", error);
    response.status(503).json({
      success: false,
      message: "The database is temporarily unavailable. Please try again.",
    });
  }
}
