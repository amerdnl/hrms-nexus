import { Router } from "express";
import { requireManager } from "../auth/guards.js";
import {
  getTeamAttendanceDay,
  getTeamAttendanceSummary,
  getTeamLeave,
  getTeamMember,
  getTeamOverview,
} from "../controllers/teamController.js";
import { authenticateToken } from "../middleware/authMiddleware.js";

const router = Router();

/**
 * The manager scope, applied to the whole router so a route added later cannot
 * be published without it. Administrators are not managers by virtue of their
 * role: company-wide data stays on the admin routers, and this one is only for
 * someone who currently has direct reports.
 */
router.use(authenticateToken, requireManager);

router.get("/", getTeamOverview);
router.get("/attendance", getTeamAttendanceDay);
router.get("/attendance/summary", getTeamAttendanceSummary);
router.get("/leave", getTeamLeave);
router.get("/members/:employeeId", getTeamMember);

export default router;
