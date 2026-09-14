import { Router } from "express";
import { requireManager } from "../auth/guards.js";
import { getCompanyAnalytics, getTeamAnalytics } from "../controllers/analyticsController.js";
import { authenticateToken } from "../middleware/authMiddleware.js";
import { authorizeRoles } from "../middleware/roleMiddleware.js";

const router = Router();

/**
 * Each route carries its own scope guard: company figures are HR's, team
 * figures need someone who manages people right now. Anything else under
 * /api/analytics is a 404.
 */
router.use(authenticateToken);
router.get("/company", authorizeRoles("admin"), getCompanyAnalytics);
router.get("/team", requireManager, getTeamAnalytics);

export default router;
