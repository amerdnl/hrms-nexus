import { Router } from "express";
import {
  exportAttendanceReport,
  exportLeaveBalances,
  exportLeaveReport,
  exportPayrollReport,
  exportWorkforceReport,
  getAttendanceReport,
  getLeaveReport,
  getPayrollReport,
  getWorkforceReport,
} from "../controllers/reportController.js";
import { authenticateToken } from "../middleware/authMiddleware.js";
import { authorizeRoles } from "../middleware/roleMiddleware.js";

const router = Router();

/**
 * Company-wide reporting is administrator-only, and the guard is applied to the
 * whole router rather than per route. An export is not a lesser endpoint than
 * the report it exports: both pass through exactly these two checks, so there is
 * no download URL that skips authorization.
 */
router.use(authenticateToken, authorizeRoles("admin"));

router.get("/workforce", getWorkforceReport);
router.get("/workforce/export", exportWorkforceReport);

router.get("/attendance", getAttendanceReport);
router.get("/attendance/export", exportAttendanceReport);

router.get("/leave", getLeaveReport);
router.get("/leave/export", exportLeaveReport);
router.get("/leave/balances/export", exportLeaveBalances);

router.get("/payroll/:periodId", getPayrollReport);
router.get("/payroll/:periodId/export", exportPayrollReport);

export default router;
