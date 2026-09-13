import { Router } from "express";
import {
  getNotifications,
  getUnreadCount,
  readAllNotifications,
  readNotification,
} from "../controllers/notificationController.js";
import { authenticateToken } from "../middleware/authMiddleware.js";

/** Every signed-in account, and only its own notifications. */
const router = Router();
router.use(authenticateToken);
router.get("/", getNotifications);
router.get("/unread-count", getUnreadCount);
router.put("/read-all", readAllNotifications);
router.put("/:id/read", readNotification);

export default router;
