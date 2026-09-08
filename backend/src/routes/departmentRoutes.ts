import { Router } from "express";
import { authenticateToken } from "../middleware/authMiddleware.js";
import { authorizeRoles } from "../middleware/roleMiddleware.js";

import {
  getDepartments,
  getDepartmentById,
  getDepartmentEmployees,
  createDepartment,
  updateDepartment,
  deleteDepartment,
} from "../controllers/departmentController.js";

const router = Router();

router.use(authenticateToken, authorizeRoles("admin"));

router.get("/", getDepartments);

router.get("/:id/employees", getDepartmentEmployees);

router.get("/:id", getDepartmentById);

router.post("/", createDepartment);

router.put("/:id", updateDepartment);

router.delete("/:id", deleteDepartment);

export default router;
