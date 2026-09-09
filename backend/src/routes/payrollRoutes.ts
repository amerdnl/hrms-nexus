import { Router } from "express";
import {
  addManualItem,
  calculatePayrollPeriod,
  createCompensation,
  createPeriod,
  deleteManualItem,
  getCompensation,
  getMyPayslip,
  getMyPayslips,
  getPeriod,
  getPeriodSummary,
  getRecord,
  listPeriods,
  setOvertime,
  transitionPeriod,
} from "../controllers/payrollController.js";
import { authenticateToken } from "../middleware/authMiddleware.js";
import { authorizeRoles } from "../middleware/roleMiddleware.js";

const router = Router();

router.use(authenticateToken);

// Employee self-service. Registered before the admin ":id" routes so these names
// are not captured as identifiers.
router.get("/me/payslips", authorizeRoles("employee"), getMyPayslips);
router.get("/me/payslips/:recordId", authorizeRoles("employee"), getMyPayslip);

// Compensation is salary data: administrator only, never exposed to the employee
// list or profile endpoints.
router.get("/compensation/:employeeId", authorizeRoles("admin"), getCompensation);
router.post("/compensation/:employeeId", authorizeRoles("admin"), createCompensation);

router.get("/periods", authorizeRoles("admin"), listPeriods);
router.post("/periods", authorizeRoles("admin"), createPeriod);
router.get("/periods/:id", authorizeRoles("admin"), getPeriod);
router.get("/periods/:id/summary", authorizeRoles("admin"), getPeriodSummary);
router.post("/periods/:id/calculate", authorizeRoles("admin"), calculatePayrollPeriod);
router.put("/periods/:id/status", authorizeRoles("admin"), transitionPeriod);

router.get("/records/:recordId", authorizeRoles("admin"), getRecord);
router.put("/records/:recordId/overtime", authorizeRoles("admin"), setOvertime);
router.post("/records/:recordId/items", authorizeRoles("admin"), addManualItem);
router.delete("/records/:recordId/items/:itemId", authorizeRoles("admin"), deleteManualItem);

export default router;
