import { Router } from "express";
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

router.get("/", getEmployees);
router.get("/:id", getEmployeeById);
router.post("/", createEmployee);
router.put("/:id", updateEmployee);
router.delete("/:id", deleteEmployee);
router.patch("/:id/reactivate", reactivateEmployee);
router.delete("/:id/permanent", permanentlyDeleteEmployee);

export default router;
