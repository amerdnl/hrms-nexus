import { Router } from "express";
import {
  exportDatasetCsv,
  exportWorkbook,
  listDatasets,
} from "../controllers/exportController.js";
import { authenticateToken } from "../middleware/authMiddleware.js";
import { authorizeRoles } from "../middleware/roleMiddleware.js";

const router = Router();

/**
 * The company data export is administrator-only, and the guard is applied to the
 * whole router rather than per route, so a route added later cannot be published
 * without it. A download is not a lesser endpoint than the API it exports: both
 * pass through exactly these two checks.
 */
router.use(authenticateToken, authorizeRoles("admin"));

router.get("/datasets", listDatasets);
router.get("/datasets/:key/csv", exportDatasetCsv);
router.get("/workbook", exportWorkbook);

export default router;
