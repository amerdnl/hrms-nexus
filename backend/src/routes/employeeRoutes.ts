import { Router } from "express";
import { authenticateToken } from "../middleware/authMiddleware.js";
import { authorizeRoles } from "../middleware/roleMiddleware.js";
import {
  getEmployees,
  getEmployeeById,
  createEmployee,
  updateEmployee,
  deleteEmployee,
  reactivateEmployee,
  permanentlyDeleteEmployee,
} from "../controllers/employeeController.js";

const router = Router();

router.use(authenticateToken, authorizeRoles("admin"));

router.get("/", getEmployees);
router.get("/:id", getEmployeeById);
router.post("/", createEmployee);
router.put("/:id", updateEmployee);
router.delete("/:id", deleteEmployee);
router.patch("/:id/reactivate", reactivateEmployee);
router.delete("/:id/permanent", permanentlyDeleteEmployee);

export default router;
