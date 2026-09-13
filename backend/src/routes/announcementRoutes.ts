import { Router } from "express";
import {
  archiveAnnouncement,
  createAnnouncement,
  deleteAnnouncement,
  getAnnouncement,
  getFeed,
  getManageList,
  markAnnouncementRead,
  publishAnnouncement,
  updateAnnouncement,
} from "../controllers/announcementController.js";
import { authenticateToken } from "../middleware/authMiddleware.js";
import { authorizeRoles } from "../middleware/roleMiddleware.js";

/**
 * Reading is for every signed-in account, filtered by audience in the
 * controller. Everything that writes is HR's, guarded here per route.
 */
const router = Router();
const hr = authorizeRoles("admin");
router.use(authenticateToken);

router.get("/", getFeed);
router.get("/manage", hr, getManageList);
router.post("/", hr, createAnnouncement);
router.get("/:id", getAnnouncement);
router.put("/:id/read", markAnnouncementRead);
router.put("/:id", hr, updateAnnouncement);
router.post("/:id/publish", hr, publishAnnouncement);
router.post("/:id/archive", hr, archiveAnnouncement);
router.delete("/:id", hr, deleteAnnouncement);

export default router;
