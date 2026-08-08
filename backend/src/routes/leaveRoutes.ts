import { Router } from "express";
import {
  createLeaveRequest,
  getMyLeaveRequests,
  getAllLeaveRequests,
  updateLeaveStatus,
} from "../controllers/leaveController.js";
import { authenticateToken } from "../middleware/authMiddleware.js";
import { authorizeRoles } from "../middleware/roleMiddleware.js";

const router = Router();

router.get(
  "/me",
  authenticateToken,
  authorizeRoles("employee"),
  getMyLeaveRequests,
);

router.get(
  "/",
  authenticateToken,
  authorizeRoles("admin"),
  getAllLeaveRequests,
);

router.post(
  "/",
  authenticateToken,
  authorizeRoles("employee"),
  createLeaveRequest,
);

router.put(
  "/:id/status",
  authenticateToken,
  authorizeRoles("admin"),
  updateLeaveStatus,
);

export default router;
