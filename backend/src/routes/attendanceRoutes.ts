import { Router, type RequestHandler } from "express";
import {
  createManualAttendance,
  getStatistics,
  listAttendance,
  updateAttendance,
} from "../controllers/adminAttendanceController.js";
import {
  checkIn,
  checkOut,
  getMyHistory,
  getToday,
} from "../controllers/attendanceController.js";

interface AttendanceMiddleware {
  authenticate: RequestHandler;
  requireAdmin: RequestHandler;
}

export function createAttendanceRouter({
  authenticate,
  requireAdmin,
}: AttendanceMiddleware): Router {
  const router = Router();

  // Employee attendance routes
  router.post("/check-in", authenticate, checkIn);
  router.patch("/check-out", authenticate, checkOut);
  router.get("/today", authenticate, getToday);
  router.get("/my-history", authenticate, getMyHistory);

  // Admin attendance routes
  router.get("/statistics", authenticate, requireAdmin, getStatistics);

  router.post("/manual", authenticate, requireAdmin, createManualAttendance);

  router.patch("/:id", authenticate, requireAdmin, updateAttendance);

  router.get("/", authenticate, requireAdmin, listAttendance);

  return router;
}
