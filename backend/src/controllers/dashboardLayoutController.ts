import type { Request, Response } from "express";
import {
  deleteLayout,
  findLayout,
  PersonalizationUnavailableError,
  upsertLayout,
} from "../services/dashboardLayoutService.js";
import {
  sanitizeStoredLayout,
  validateLayout,
  type LayoutSubject,
} from "../utils/dashboardLayout.js";

/** Who the layout is for, from the session. There is no way to name another account. */
function subjectOf(request: Request): LayoutSubject {
  return {
    role: request.user!.role,
    isManager: request.user!.isManager,
    employeeId: request.user!.employeeId,
  };
}

const unavailable = (response: Response) =>
  response.status(503).json({
    success: false,
    code: "personalization_unavailable",
    message: "Home personalization is not available on this installation yet.",
  });

/**
 * GET /api/dashboard/layout - the account's saved Home layout, filtered to what
 * it may use today, or null for the default Home.
 */
export async function getDashboardLayout(request: Request, response: Response): Promise<void> {
  try {
    const found = await findLayout(request.user!.id);
    if (!found.available) {
      response.status(200).json({
        success: true,
        data: { available: false, layout: null, revision: null, updatedAt: null },
      });
      return;
    }
    response.status(200).json({
      success: true,
      data: {
        available: true,
        layout: found.stored ? sanitizeStoredLayout(found.stored.layout, subjectOf(request)) : null,
        revision: found.stored?.revision ?? null,
        updatedAt: found.stored?.updatedAt ?? null,
      },
    });
  } catch (error) {
    console.error("Read dashboard layout error:", error);
    response.status(500).json({ success: false, message: "Your Home layout could not be loaded." });
  }
}

/** PUT /api/dashboard/layout - saves the account's own layout after checking every widget. */
export async function saveDashboardLayout(request: Request, response: Response): Promise<void> {
  const body = (request.body ?? {}) as Record<string, unknown>;
  const result = validateLayout(body.layout, subjectOf(request));
  if (!result.ok) {
    response.status(result.status).json({ success: false, code: result.code, message: result.message });
    return;
  }

  try {
    const saved = await upsertLayout(request.user!.id, result.layout);
    response.status(200).json({
      success: true,
      data: { available: true, layout: result.layout, revision: saved.revision, updatedAt: saved.updatedAt },
    });
  } catch (error) {
    if (error instanceof PersonalizationUnavailableError) {
      unavailable(response);
      return;
    }
    console.error("Save dashboard layout error:", error);
    response.status(500).json({ success: false, message: "Your Home layout could not be saved." });
  }
}

/** DELETE /api/dashboard/layout - Reset to default: the saved layout is removed. */
export async function resetDashboardLayout(request: Request, response: Response): Promise<void> {
  try {
    await deleteLayout(request.user!.id);
    response.status(200).json({
      success: true,
      data: { available: true, layout: null, revision: null, updatedAt: null },
    });
  } catch (error) {
    if (error instanceof PersonalizationUnavailableError) {
      unavailable(response);
      return;
    }
    console.error("Reset dashboard layout error:", error);
    response.status(500).json({ success: false, message: "Your Home layout could not be reset." });
  }
}
