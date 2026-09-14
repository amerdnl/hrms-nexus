import type { Request, Response } from "express";
import { companyAnalytics, teamAnalytics } from "../services/analyticsService.js";

function unavailable(response: Response, error: unknown, scope: string): void {
  console.error(`Loading ${scope} analytics failed:`, error);
  response.status(500).json({ success: false, message: `The ${scope} analytics could not be loaded.` });
}

/** GET /api/analytics/company - HR only. */
export async function getCompanyAnalytics(_request: Request, response: Response): Promise<void> {
  try {
    response.status(200).json({ success: true, data: await companyAnalytics() });
  } catch (error) {
    unavailable(response, error, "company");
  }
}

/** GET /api/analytics/team - the caller's current direct reports, resolved on this request. */
export async function getTeamAnalytics(request: Request, response: Response): Promise<void> {
  try {
    response.status(200).json({ success: true, data: await teamAnalytics(request.user!.employeeId!) });
  } catch (error) {
    unavailable(response, error, "team");
  }
}
