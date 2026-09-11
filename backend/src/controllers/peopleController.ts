/**
 * The directory, social profiles, timelines and the org chart.
 *
 * Open to every signed-in account - that is the point of a directory - and
 * limited, for every caller including HR, to the social layer. HR's record of
 * the same person lives on the admin routers; nothing here is a way round them.
 */
import type { Request, Response } from "express";
import { relationTo } from "../auth/policy.js";
import { directory, orgChart, socialProfile } from "../services/peopleService.js";
import { listTimeline } from "../services/timelineService.js";
import { parseIdParam } from "../utils/employeeValidation.js";

const MAX_PAGE_SIZE = 50;
const DEFAULT_PAGE_SIZE = 24;

function unavailable(response: Response, error: unknown, action: string): void {
  console.error(`People ${action} failed:`, error);
  response.status(503).json({
    success: false,
    message: "The database is temporarily unavailable. Please try again.",
  });
}

function hasControlCharacters(value: string): boolean {
  return [...value].some((character) => {
    const code = character.charCodeAt(0);
    return code < 32 || code === 127;
  });
}

/** GET /api/people?search=&department=&page=&pageSize= */
export async function getDirectory(request: Request, response: Response): Promise<void> {
  const rawSearch = typeof request.query.search === "string" ? request.query.search.trim() : "";
  if (rawSearch.length > 100 || hasControlCharacters(rawSearch)) {
    response.status(400).json({ success: false, message: "Search for up to 100 characters." });
    return;
  }
  const rawDepartment = typeof request.query.department === "string" ? request.query.department : "";
  const departmentId = rawDepartment === "" ? null : parseIdParam(rawDepartment);
  if (rawDepartment !== "" && departmentId === null) {
    response.status(400).json({ success: false, message: "Invalid department filter." });
    return;
  }
  const page = Number(request.query.page ?? 1);
  const size = Number(request.query.pageSize ?? DEFAULT_PAGE_SIZE);
  if (!Number.isSafeInteger(page) || page < 1 || page > 100_000
      || !Number.isSafeInteger(size) || size < 1 || size > MAX_PAGE_SIZE) {
    response.status(400).json({ success: false, message: `Page sizes run from 1 to ${MAX_PAGE_SIZE}.` });
    return;
  }

  try {
    const data = await directory({ search: rawSearch || null, departmentId, page, pageSize: size });
    response.status(200).json({ success: true, data });
  } catch (error) {
    unavailable(response, error, "directory");
  }
}

/** Resolves the relation, answering 404 for anyone the caller may not see. */
async function visibleRelation(request: Request, response: Response) {
  const employeeId = parseIdParam(request.params.id);
  if (employeeId === null) {
    response.status(400).json({ success: false, message: "Invalid person ID" });
    return null;
  }
  const relation = await relationTo(request.user!, employeeId);
  if (relation === null) {
    // Not found rather than forbidden: a colleague who has left is not
    // confirmed to have existed.
    response.status(404).json({ success: false, message: "Person not found" });
    return null;
  }
  return { employeeId, relation };
}

/** GET /api/people/:id - one social profile. */
export async function getPerson(request: Request, response: Response): Promise<void> {
  try {
    const visible = await visibleRelation(request, response);
    if (!visible) return;
    const profile = await socialProfile(visible.employeeId, visible.relation);
    if (!profile) {
      response.status(404).json({ success: false, message: "Person not found" });
      return;
    }
    response.status(200).json({ success: true, data: profile });
  } catch (error) {
    unavailable(response, error, "profile");
  }
}

/** GET /api/people/:id/timeline - the events this relation may read. */
export async function getPersonTimeline(request: Request, response: Response): Promise<void> {
  try {
    const visible = await visibleRelation(request, response);
    if (!visible) return;
    const events = await listTimeline(visible.employeeId, visible.relation);
    response.status(200).json({ success: true, data: { relation: visible.relation, events } });
  } catch (error) {
    unavailable(response, error, "timeline");
  }
}

/** GET /api/org/chart - the whole visible organisation. */
export async function getOrgChart(_request: Request, response: Response): Promise<void> {
  try {
    const nodes = await orgChart();
    response.status(200).json({ success: true, data: { nodes } });
  } catch (error) {
    unavailable(response, error, "org chart");
  }
}
