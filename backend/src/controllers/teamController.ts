/**
 * The manager's team endpoints.
 *
 * Every route is behind `requireManager`, and every query takes the manager's
 * own employee id from the session - there is no parameter naming whose team to
 * read, so there is nothing to substitute. A single report is only reachable
 * through `isTeamMember`, checked against the reporting line as it is now.
 */
import type { Request, Response } from "express";
import { isTeamMember } from "../auth/policy.js";
import {
  teamAttendanceSummary,
  teamLeave,
  teamOnDate,
  teamUpcomingLeave,
} from "../services/teamService.js";
import { addDays, companyToday } from "../utils/companyClock.js";
import { parseIdParam } from "../utils/employeeValidation.js";
import { leaveStatuses, parseDate } from "../utils/leaveCalculation.js";

/** How far back a manager's day view and range may reach. */
const MAX_LOOKBACK_DAYS = 366;
const MAX_RANGE_DAYS = 93;
const UPCOMING_DAYS = 14;

function unavailable(response: Response, error: unknown, action: string): void {
  console.error(`Team ${action} failed:`, error);
  response.status(503).json({
    success: false,
    message: "The database is temporarily unavailable. Please try again.",
  });
}

const managerOf = (request: Request): number => request.user!.employeeId!;

/** GET /api/team - the manager's dashboard: today, decisions and what is coming. */
export async function getTeamOverview(request: Request, response: Response): Promise<void> {
  try {
    const today = await companyToday();
    const manager = managerOf(request);
    const [members, pending, upcoming] = await Promise.all([
      teamOnDate(manager, today),
      teamLeave(manager, "pending"),
      teamUpcomingLeave(manager, today, UPCOMING_DAYS),
    ]);

    const counts = {
      members: members.length,
      present: members.filter((member) => member.day.status === "present").length,
      late: members.filter((member) => member.day.status === "late").length,
      absent: members.filter((member) => member.day.status === "absent").length,
      onLeave: members.filter((member) => member.day.onLeave !== null).length,
      // Employed, nothing recorded today and not on approved leave: an absence
      // of evidence, not a judgement, exactly as the admin dashboard counts it.
      notClockedIn: members.filter((member) => member.day.status === null && member.day.onLeave === null).length,
      pendingDecisions: pending.length,
    };

    response.status(200).json({
      success: true,
      data: { today, counts, members, pending, upcoming, upcomingDays: UPCOMING_DAYS },
    });
  } catch (error) {
    unavailable(response, error, "overview");
  }
}

/** GET /api/team/attendance?date= - the team on one day, no coordinates. */
export async function getTeamAttendanceDay(request: Request, response: Response): Promise<void> {
  try {
    const today = await companyToday();
    const raw = typeof request.query.date === "string" && request.query.date !== "" ? request.query.date : today;
    if (!parseDate(raw)) {
      response.status(400).json({ success: false, message: "Provide the date as a real YYYY-MM-DD date." });
      return;
    }
    if (raw > today || raw < addDays(today, -MAX_LOOKBACK_DAYS)) {
      response.status(400).json({
        success: false,
        message: `Choose a date between ${addDays(today, -MAX_LOOKBACK_DAYS)} and today.`,
      });
      return;
    }
    const members = await teamOnDate(managerOf(request), raw);
    response.status(200).json({ success: true, data: { date: raw, today, members } });
  } catch (error) {
    unavailable(response, error, "attendance");
  }
}

/** GET /api/team/attendance/summary?from=&to= - totals per report. */
export async function getTeamAttendanceSummary(request: Request, response: Response): Promise<void> {
  try {
    const today = await companyToday();
    const from = typeof request.query.from === "string" && request.query.from !== ""
      ? request.query.from : addDays(today, -29);
    const to = typeof request.query.to === "string" && request.query.to !== "" ? request.query.to : today;
    if (!parseDate(from) || !parseDate(to) || from > to) {
      response.status(400).json({ success: false, message: "Provide 'from' and 'to' as real dates, in order." });
      return;
    }
    const span = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000 + 1;
    if (span > MAX_RANGE_DAYS) {
      response.status(400).json({ success: false, message: `Choose a range of ${MAX_RANGE_DAYS} days or fewer.` });
      return;
    }
    const rows = await teamAttendanceSummary(managerOf(request), from, to);
    response.status(200).json({ success: true, data: { from, to, rows } });
  } catch (error) {
    unavailable(response, error, "attendance summary");
  }
}

/** GET /api/team/leave?status= - the team's requests, pending first. */
export async function getTeamLeave(request: Request, response: Response): Promise<void> {
  const raw = typeof request.query.status === "string" ? request.query.status.trim() : "";
  if (raw && !(leaveStatuses as readonly string[]).includes(raw)) {
    response.status(400).json({ success: false, message: "Invalid leave status filter" });
    return;
  }
  try {
    const leaves = await teamLeave(managerOf(request), raw || null);
    response.status(200).json({ success: true, data: { leaves } });
  } catch (error) {
    unavailable(response, error, "leave");
  }
}

/**
 * GET /api/team/members/:employeeId - one report's team layer.
 *
 * 404 for anyone outside the team, including a former report: the manager's
 * view ends when the reporting line does.
 */
export async function getTeamMember(request: Request, response: Response): Promise<void> {
  const employeeId = parseIdParam(request.params.employeeId);
  if (employeeId === null) {
    response.status(400).json({ success: false, message: "Invalid employee ID" });
    return;
  }
  try {
    const manager = managerOf(request);
    if (!(await isTeamMember(manager, employeeId))) {
      response.status(404).json({ success: false, message: "Team member not found" });
      return;
    }
    const today = await companyToday();
    const [members, summary, leaves] = await Promise.all([
      teamOnDate(manager, today),
      teamAttendanceSummary(manager, addDays(today, -29), today),
      teamLeave(manager, null),
    ]);
    response.status(200).json({
      success: true,
      data: {
        member: members.find((member) => member.id === employeeId) ?? null,
        attendance30Days: summary.find((row) => row.employeeId === employeeId) ?? null,
        leave: leaves.filter((leave) => leave.employeeId === employeeId).slice(0, 20),
      },
    });
  } catch (error) {
    unavailable(response, error, "member");
  }
}
