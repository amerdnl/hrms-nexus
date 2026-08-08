import { Router } from "express";
import {
  createLeaveRequest,
  getMyLeaveRequests,
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

router.post(
  "/",
  authenticateToken,
  authorizeRoles("employee"),
  createLeaveRequest,
);

export default router;
