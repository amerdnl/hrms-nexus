import { Router } from "express";
import {
  getCurrentUser,
  login,
  logout,
} from "../controllers/authController.js";
import { authenticateForPasswordChange } from "../middleware/authMiddleware.js";

const router = Router();

router.post("/login", login);

/**
 * Both of these deliberately accept an account that still owes a password
 * change. They are two of the three endpoints such an account may reach:
 * knowing who you are, and signing out, must not require first doing the thing
 * you cannot do without knowing who you are. The third is PUT /api/profile/password.
 */
router.get("/me", authenticateForPasswordChange, getCurrentUser);
router.post("/logout", authenticateForPasswordChange, logout);

export default router;
