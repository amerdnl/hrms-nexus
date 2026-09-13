import { Router } from "express";
import {
  getMyWork,
  getPlan,
  getPlans,
  getTemplates,
  postPlan,
  postPlanCancel,
  postPlanComplete,
  postTemplate,
  putTask,
  putTemplate,
} from "../controllers/lifecycleController.js";
import { authenticateToken } from "../middleware/authMiddleware.js";
import { authorizeRoles } from "../middleware/roleMiddleware.js";

/**
 * Templates, starting, completing and cancelling plans are HR's. Reading a plan,
 * "my work" and updating a task are open to every signed-in account and scoped
 * by the roles the caller holds in each plan right now.
 */
const router = Router();
const hr = authorizeRoles("admin");
router.use(authenticateToken);

router.get("/templates", hr, getTemplates);
router.post("/templates", hr, postTemplate);
router.put("/templates/:id", hr, putTemplate);

router.get("/plans", hr, getPlans);
router.post("/plans", hr, postPlan);
router.get("/plans/:id", getPlan);
router.post("/plans/:id/complete", hr, postPlanComplete);
router.post("/plans/:id/cancel", hr, postPlanCancel);

router.get("/my-work", getMyWork);
router.put("/tasks/:id", putTask);

export default router;
