import { Router } from "express";
import { requireEmployeeRecord, requireManager } from "../auth/guards.js";
import {
  getCycle,
  getCycles,
  getGoal,
  getMyGoals,
  getMyReviews,
  getParticipant,
  getPersonGoals,
  getTeamGoals,
  getTeamReviews,
  postCycle,
  postCycleClose,
  postCycleOpen,
  postGoal,
  postGoalUpdate,
  putCycle,
  putGoal,
  putManagerReview,
  putResponse,
  putSelfReview,
} from "../controllers/performanceController.js";
import { authenticateToken } from "../middleware/authMiddleware.js";
import { authorizeRoles } from "../middleware/roleMiddleware.js";

/**
 * Goals: your own need an employee record; a manager's team view needs a team.
 * Reading a goal or a person's goals is open and filtered by relation in the
 * service. Changes are checked against the owner and their current manager.
 */
export const goalRouter = Router();
goalRouter.use(authenticateToken);
goalRouter.get("/mine", requireEmployeeRecord, getMyGoals);
goalRouter.get("/team", requireManager, getTeamGoals);
goalRouter.get("/people/:employeeId", getPersonGoals);
goalRouter.post("/", requireEmployeeRecord, postGoal);
goalRouter.get("/:id", getGoal);
goalRouter.put("/:id", requireEmployeeRecord, putGoal);
goalRouter.post("/:id/updates", requireEmployeeRecord, postGoalUpdate);

/**
 * Reviews: cycles are HR's. A review is read and written by the roles the
 * service resolves (the employee, their current manager, HR); anyone else is
 * told it does not exist.
 */
export const reviewRouter = Router();
const hr = authorizeRoles("admin");
reviewRouter.use(authenticateToken);
reviewRouter.get("/cycles", hr, getCycles);
reviewRouter.post("/cycles", hr, postCycle);
reviewRouter.get("/cycles/:id", hr, getCycle);
reviewRouter.put("/cycles/:id", hr, putCycle);
reviewRouter.post("/cycles/:id/open", hr, postCycleOpen);
reviewRouter.post("/cycles/:id/close", hr, postCycleClose);
reviewRouter.get("/mine", requireEmployeeRecord, getMyReviews);
reviewRouter.get("/team", requireManager, getTeamReviews);
reviewRouter.get("/participants/:id", getParticipant);
reviewRouter.put("/participants/:id/self", requireEmployeeRecord, putSelfReview);
reviewRouter.put("/participants/:id/manager", putManagerReview);
reviewRouter.put("/participants/:id/response", requireEmployeeRecord, putResponse);
