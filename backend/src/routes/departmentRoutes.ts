import { Router } from "express";

import {
  getDepartments,
  getDepartmentById,
  getDepartmentEmployees,
  createDepartment,
  updateDepartment,
  deleteDepartment,
} from "../controllers/departmentController.js";

const router = Router();

router.get("/", getDepartments);

router.get("/:id/employees", getDepartmentEmployees);

router.get("/:id", getDepartmentById);

router.post("/", createDepartment);

router.put("/:id", updateDepartment);

router.delete("/:id", deleteDepartment);

export default router;
