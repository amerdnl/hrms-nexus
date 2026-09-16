import { Router } from "express";
import {
  getDashboardLayout,
  resetDashboardLayout,
  saveDashboardLayout,
} from "../controllers/dashboardLayoutController.js";
import { authenticateToken } from "../middleware/authMiddleware.js";

const router = Router();

/**
 * Each signed-in account's own Home layout. Applied router-wide so a route added
 * later cannot skip it; the account always comes from the session.
 */
router.use(authenticateToken);

router.get("/", getDashboardLayout);
router.put("/", saveDashboardLayout);
router.delete("/", resetDashboardLayout);

export default router;
