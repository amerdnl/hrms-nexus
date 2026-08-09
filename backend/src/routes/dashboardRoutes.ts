import { Router } from "express";
import {
  getAdminDashboard,
  getEmployeeDashboard,
} from "../controllers/dashboardController.js";
import { authenticateToken } from "../middleware/authMiddleware.js";
import { authorizeRoles } from "../middleware/roleMiddleware.js";

const router = Router();

router.get(
  "/admin",
  authenticateToken,
  authorizeRoles("admin"),
  getAdminDashboard,
);

router.get(
  "/employee",
  authenticateToken,
  authorizeRoles("employee"),
  getEmployeeDashboard,
);

export default router;
