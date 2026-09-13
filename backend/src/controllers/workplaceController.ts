/**
 * Search and the Action Center: two read-only views over data the caller may
 * already reach, both filtered on the server by the services they call.
 */
import type { Request, Response } from "express";
import { actionCenterFor } from "../services/actionCenterService.js";
import { search } from "../services/searchService.js";

function hasControlCharacters(value: string): boolean {
  return [...value].some((character) => {
    const code = character.charCodeAt(0);
    return code < 32 || code === 127;
  });
}

/** GET /api/search?q= */
export async function getSearch(request: Request, response: Response): Promise<void> {
  const term = typeof request.query.q === "string" ? request.query.q.trim().replace(/\s+/g, " ") : "";
  if (term.length < 2 || term.length > 100 || hasControlCharacters(term)) {
    response.status(400).json({ success: false, message: "Search for 2 to 100 characters." });
    return;
  }
  try {
    response.status(200).json({ success: true, data: { query: term, ...(await search(request.user!, term)) } });
  } catch (error) {
    console.error("Search failed:", error);
    response.status(503).json({ success: false, message: "Search is temporarily unavailable. Please try again." });
  }
}

/** GET /api/action-center */
export async function getActionCenter(request: Request, response: Response): Promise<void> {
  try {
    response.status(200).json({ success: true, data: await actionCenterFor(request.user!) });
  } catch (error) {
    console.error("Action Center failed:", error);
    response.status(503).json({ success: false, message: "The Action Center is temporarily unavailable. Please try again." });
  }
}
