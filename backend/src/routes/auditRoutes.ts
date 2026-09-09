import { Router } from "express";
import { getAuditLog } from "../controllers/auditController.js";
import { authenticateToken } from "../middleware/authMiddleware.js";
import { authorizeRoles } from "../middleware/roleMiddleware.js";

const router = Router();

/**
 * Administrator-only, applied to the whole router. A normal employee has no
 * route into company-wide audit records at all, and there is no write endpoint:
 * entries come only from the actions that produce them.
 */
router.use(authenticateToken, authorizeRoles("admin"));

router.get("/", getAuditLog);

export default router;
