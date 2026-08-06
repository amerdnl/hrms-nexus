import { Router } from "express";
import {
  changePassword,
  getProfile,
  updateProfile,
} from "../controllers/profileController.js";
import { authenticateToken } from "../middleware/authMiddleware.js";

const router = Router();

router.use(authenticateToken);
router.get("/", getProfile);
router.put("/", updateProfile);
router.put("/password", changePassword);

export default router;
