import { Router } from "express";
import {
  getDirectory,
  getOrgChart,
  getPerson,
  getPersonTimeline,
} from "../controllers/peopleController.js";
import {
  deleteNote,
  deleteRelationship,
  patchNote,
  postNote,
  postRelationship,
  putLayout,
} from "../controllers/orgLayoutController.js";
import { deletePosition, patchPosition, postPosition } from "../controllers/orgPositionController.js";
import { getPersonRecognition } from "../controllers/recognitionController.js";
import { authorizeRoles } from "../middleware/roleMiddleware.js";
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
peopleRouter.get("/:id/recognition", getPersonRecognition);

export const orgRouter = Router();
orgRouter.use(authenticateToken);
orgRouter.get("/chart", getOrgChart);

// Maintaining the chart is an HR action. The guard is here rather than in the
// interface, so hiding the buttons is a convenience and not the security.
orgRouter.post("/positions", authorizeRoles("admin"), postPosition);
orgRouter.patch("/positions/:id", authorizeRoles("admin"), patchPosition);
orgRouter.delete("/positions/:id", authorizeRoles("admin"), deletePosition);

// Where the cards sit, the panels of context beside them, and the lines
// between them. Layout is saved without an audit entry on purpose: nudging a
// card is not an HR decision, and a log full of movements hides the real ones.
orgRouter.put("/layout", authorizeRoles("admin"), putLayout);
orgRouter.post("/notes", authorizeRoles("admin"), postNote);
orgRouter.patch("/notes/:id", authorizeRoles("admin"), patchNote);
orgRouter.delete("/notes/:id", authorizeRoles("admin"), deleteNote);
orgRouter.post("/relationships", authorizeRoles("admin"), postRelationship);
orgRouter.delete("/relationships/:childId/:parentId", authorizeRoles("admin"), deleteRelationship);
