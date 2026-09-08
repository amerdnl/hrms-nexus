import { Router } from "express";
import { authenticateToken } from "../middleware/authMiddleware.js";
import { authorizeRoles } from "../middleware/roleMiddleware.js";
import { getCompanySettings, updateCompanySettings } from "../controllers/companySettingsController.js";

const router = Router();
router.use(authenticateToken, authorizeRoles("admin"));
router.get("/", getCompanySettings);
router.put("/", updateCompanySettings);
export default router;
