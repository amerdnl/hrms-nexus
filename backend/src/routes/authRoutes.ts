import { Router } from "express";
import {
  getCurrentUser,
  login,
  logout,
} from "../controllers/authController.js";
import { authenticateToken } from "../middleware/authMiddleware.js";

const router = Router();

router.post("/login", login);
router.get("/me", authenticateToken, getCurrentUser);
router.post("/logout", authenticateToken, logout);

export default router;
