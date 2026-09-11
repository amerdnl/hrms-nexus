import { Router } from "express";
import {
  changePassword,
  deleteProfileImage,
  getAbout,
  getProfile,
  updateAbout,
  uploadProfileImage,
  updateProfile,
} from "../controllers/profileController.js";
import { requireEmployeeRecord } from "../auth/guards.js";
import {
  authenticateForPasswordChange,
  authenticateToken,
} from "../middleware/authMiddleware.js";
import { acceptProfileImage } from "../middleware/profileImageUpload.js";
import { authorizeRoles } from "../middleware/roleMiddleware.js";

const router = Router();

/**
 * Registered before the router-wide guard, and with its own, so an account still
 * holding a temporary password can reach exactly this one route on this router
 * and nothing else. Express matches in order, so the `router.use` below does not
 * apply to it.
 */
router.put("/password", authenticateForPasswordChange, changePassword);

router.use(authenticateToken);
router.get("/", getProfile);
router.put("/", updateProfile);
router.post(
  "/image",
  authorizeRoles("employee"),
  acceptProfileImage,
  uploadProfileImage,
);
router.delete("/image", authorizeRoles("employee"), deleteProfileImage);
// What the employee shares with colleagues. Their own record only: the
// employee id comes from the session, and nothing here touches an HR field.
router.get("/about", requireEmployeeRecord, getAbout);
router.put("/about", requireEmployeeRecord, updateAbout);

export default router;
