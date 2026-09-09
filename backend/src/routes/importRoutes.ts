import { Router } from "express";
import {
  confirmImportJob,
  createImportJob,
  getImportFields,
  getImportJob,
  getImportJobRows,
  getImportTemplate,
  listImportJobs,
  setImportMapping,
} from "../controllers/importController.js";
import { authenticateToken } from "../middleware/authMiddleware.js";
import { importFileUpload } from "../middleware/importUpload.js";
import { authorizeRoles } from "../middleware/roleMiddleware.js";

const router = Router();

// Importing rewrites workforce records in bulk; it is administrator-only.
router.use(authenticateToken, authorizeRoles("admin"));

router.get("/template", getImportTemplate);
router.get("/fields", getImportFields);

router.get("/jobs", listImportJobs);
router.post("/jobs", importFileUpload, createImportJob);
router.get("/jobs/:id", getImportJob);
router.get("/jobs/:id/rows", getImportJobRows);
router.put("/jobs/:id/mapping", setImportMapping);
router.post("/jobs/:id/confirm", confirmImportJob);

export default router;
