import { Router } from "express";
import {
  changePassword,
  deleteProfileImage,
  getProfile,
  uploadProfileImage,
  updateProfile,
} from "../controllers/profileController.js";
import { authenticateToken } from "../middleware/authMiddleware.js";
import { acceptProfileImage } from "../middleware/profileImageUpload.js";
import { authorizeRoles } from "../middleware/roleMiddleware.js";

const router = Router();

router.use(authenticateToken);
router.get("/", getProfile);
router.put("/", updateProfile);
router.put("/password", changePassword);
router.post(
  "/image",
  authorizeRoles("employee"),
  acceptProfileImage,
  uploadProfileImage,
);
router.delete("/image", authorizeRoles("employee"), deleteProfileImage);

export default router;
