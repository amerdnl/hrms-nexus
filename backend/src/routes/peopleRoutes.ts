import { Router } from "express";
import {
  getDirectory,
  getOrgChart,
  getPerson,
  getPersonTimeline,
} from "../controllers/peopleController.js";
import { authenticateToken } from "../middleware/authMiddleware.js";

/**
 * Every signed-in account, and only the social layer. Authentication applies
 * to the whole router, and each profile is then checked against the caller's
 * relation to that person, so a former employee is visible to HR alone.
 */
export const peopleRouter = Router();
peopleRouter.use(authenticateToken);
peopleRouter.get("/", getDirectory);
peopleRouter.get("/:id", getPerson);
peopleRouter.get("/:id/timeline", getPersonTimeline);

export const orgRouter = Router();
orgRouter.use(authenticateToken);
orgRouter.get("/chart", getOrgChart);
