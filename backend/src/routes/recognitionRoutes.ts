import { Router } from "express";
import { requireEmployeeRecord } from "../auth/guards.js";
import { getRecognition, postRecognition, putHidden } from "../controllers/recognitionController.js";
import { authenticateToken } from "../middleware/authMiddleware.js";
import { authorizeRoles } from "../middleware/roleMiddleware.js";

/**
 * Reading is for every signed-in account and filtered by visibility in the
 * service. Giving needs an employee record; hiding is HR's.
 */
const router = Router();
router.use(authenticateToken);
router.get("/", getRecognition);
router.post("/", requireEmployeeRecord, postRecognition);
router.put("/:id/hidden", authorizeRoles("admin"), putHidden);

export default router;
