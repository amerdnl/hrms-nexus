import { Router } from "express";
import {
  cancelLeaveRequest,
  createLeaveRequest,
  getAllLeaveRequests,
  getEmployeeLeaveBalances,
  getLeavePolicies,
  getLeaveRequestById,
  getMyLeaveBalances,
  getMyLeaveRequests,
  getUnpaidLeaveSummary,
  setEmployeeEntitlement,
  updateLeavePolicy,
  updateLeaveStatus,
} from "../controllers/leaveController.js";
import { authorizeLeaveDecision } from "../auth/guards.js";
import { authenticateToken } from "../middleware/authMiddleware.js";
import { authorizeRoles } from "../middleware/roleMiddleware.js";

const router = Router();

router.use(authenticateToken);

// Employee self-service. Registered before "/:id" so these names are not
// captured as identifiers.
router.get("/me", authorizeRoles("employee"), getMyLeaveRequests);
router.get("/me/balances", authorizeRoles("employee"), getMyLeaveBalances);

// Administrator policy and entitlement management.
router.get("/policies", authorizeRoles("admin"), getLeavePolicies);
router.put("/policies/:leaveType", authorizeRoles("admin"), updateLeavePolicy);
router.get("/employees/:employeeId/balances", authorizeRoles("admin"), getEmployeeLeaveBalances);
router.put("/employees/:employeeId/entitlements", authorizeRoles("admin"), setEmployeeEntitlement);
router.get("/employees/:employeeId/unpaid", authorizeRoles("admin"), getUnpaidLeaveSummary);

router.get("/", authorizeRoles("admin"), getAllLeaveRequests);
router.post("/", authorizeRoles("employee"), createLeaveRequest);

router.get("/:id", authorizeRoles("employee"), getLeaveRequestById);
// An administrator, or a manager for a current direct report only. The guard
// admits managers; the controller limits them to their team inside the
// transaction that locks the request, and refuses anyone's own request.
router.put("/:id/status", authorizeLeaveDecision, updateLeaveStatus);
// Either role: the controller enforces that an employee may only cancel their own.
router.post("/:id/cancel", cancelLeaveRequest);

export default router;
