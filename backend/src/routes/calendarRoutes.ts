import { Router } from "express";
import {
  createEvent,
  createHoliday,
  deleteEvent,
  deleteHoliday,
  getCalendar,
  getCalendarConfig,
  listEvents,
  listHolidays,
  updateEvent,
  updateHoliday,
} from "../controllers/calendarController.js";
import { authenticateToken } from "../middleware/authMiddleware.js";
import { authorizeRoles } from "../middleware/roleMiddleware.js";

const hr = authorizeRoles("admin");

/** The calendar for every signed-in account; its events are written by HR. */
export const calendarRouter = Router();
calendarRouter.use(authenticateToken);
calendarRouter.get("/", getCalendar);
calendarRouter.get("/events", hr, listEvents);
calendarRouter.post("/events", hr, createEvent);
calendarRouter.put("/events/:id", hr, updateEvent);
calendarRouter.delete("/events/:id", hr, deleteEvent);

/**
 * The one slice of company configuration every account may read: timezone,
 * working week and holidays. Nothing else from settings is reachable here.
 */
export const companyRouter = Router();
companyRouter.use(authenticateToken);
companyRouter.get("/calendar-config", getCalendarConfig);

/** Company holidays are settings: HR only, mounted under /api/settings/holidays. */
export const holidayRouter = Router();
holidayRouter.use(authenticateToken, hr);
holidayRouter.get("/", listHolidays);
holidayRouter.post("/", createHoliday);
holidayRouter.put("/:id", updateHoliday);
holidayRouter.delete("/:id", deleteHoliday);
