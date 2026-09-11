/**
 * Company-wide reporting.
 *
 * Every route in this file is administrator-only, enforced by the router rather
 * than by anything here, and every export goes through the same server-side
 * authorization as the report it exports. There is no client-supplied SQL, no
 * client-chosen column list and no client-controlled row limit.
 *
 * Exports deliberately omit verification metadata. Attendance carries
 * coordinates, GPS accuracy and distance-from-office, which describe where a
 * person physically was; that belongs in the attendance record, not in a
 * spreadsheet that gets emailed around. QR challenge hashes and password hashes
 * are never selected at all.
 */
import type { Request, Response } from "express";
import pool from "../config/db.js";
import { getBalancesForEmployees } from "../services/leaveBalanceService.js";
import {
  attendanceReport,
  employeesForBalances,
  leaveReport,
  payrollReport,
  workforceReport,
  type DateRange,
  type DepartmentFilter,
} from "../services/reportService.js";
import { companyToday } from "../utils/companyClock.js";
import { buildCsv, csvFilename, ExportTooLargeError } from "../utils/csv.js";
import { parseIdParam } from "../utils/employeeValidation.js";
import { leaveStatuses, leaveTypes, parseDate } from "../utils/leaveCalculation.js";
import { formatSenExact } from "../utils/payrollMoney.js";

/** A window longer than this is refused rather than allowed to scan unbounded. */
const MAX_RANGE_DAYS = 366;

function unavailable(response: Response, error: unknown, action: string): void {
  console.error(`Report ${action} failed:`, error);
  response.status(503).json({
    success: false,
    message: "The database is temporarily unavailable. Please try again.",
  });
}

type RangeResult =
  | { ok: true; range: DateRange }
  | { ok: false; message: string };

async function parseRange(request: Request): Promise<RangeResult> {
  const today = await companyToday();
  const rawFrom = request.query.from;
  const rawTo = request.query.to;

  // Default window is the current month to date, in the company's timezone.
  const from = typeof rawFrom === "string" && rawFrom !== "" ? rawFrom : `${today.slice(0, 7)}-01`;
  const to = typeof rawTo === "string" && rawTo !== "" ? rawTo : today;

  if (!parseDate(from) || !parseDate(to)) {
    return { ok: false, message: "Provide 'from' and 'to' as real YYYY-MM-DD dates." };
  }
  if (from > to) {
    return { ok: false, message: "The start date must not be after the end date." };
  }

  const spanDays =
    (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000 + 1;
  if (spanDays > MAX_RANGE_DAYS) {
    return {
      ok: false,
      message: `Choose a range of ${MAX_RANGE_DAYS} days or fewer; this one covers ${Math.round(spanDays)}.`,
    };
  }

  return { ok: true, range: { from, to } };
}

type FilterResult =
  | { ok: true; filter: DepartmentFilter }
  | { ok: false; message: string };

function parseDepartment(request: Request): FilterResult {
  const raw = request.query.departmentId;
  if (raw === undefined || raw === "" || raw === "all") return { ok: true, filter: { departmentId: null } };
  const parsed = parseIdParam(typeof raw === "string" ? raw : "");
  if (parsed === null) return { ok: false, message: "Invalid department filter." };
  return { ok: true, filter: { departmentId: parsed } };
}

function parseLeaveYear(request: Request, fallback: number): number {
  const raw = request.query.leaveYear;
  if (typeof raw !== "string" || !/^\d{4}$/.test(raw)) return fallback;
  const year = Number(raw);
  return year >= 2000 && year <= 2100 ? year : fallback;
}

/** Sends a CSV as a download, with a filename the client cannot influence. */
function sendCsv(response: Response, filename: string, csv: string): void {
  response.setHeader("Content-Type", "text/csv; charset=utf-8");
  response.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  // Stops a browser from sniffing the body into something executable.
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.status(200).send(csv);
}

function tooLarge(response: Response, error: unknown): boolean {
  if (error instanceof ExportTooLargeError) {
    response.status(413).json({ success: false, message: error.message });
    return true;
  }
  return false;
}

// ----------------------------------------------------------------- workforce

export async function getWorkforceReport(_request: Request, response: Response): Promise<void> {
  try {
    response.status(200).json({ success: true, data: await workforceReport() });
  } catch (error) {
    unavailable(response, error, "workforce");
  }
}

export async function exportWorkforceReport(_request: Request, response: Response): Promise<void> {
  try {
    const report = await workforceReport();
    const csv = buildCsv(
      ["Department", "Headcount", "Active", "Probation", "Inactive", "Resigned", "Terminated"],
      report.byDepartment.map((row) => [
        row.department_name, row.headcount, row.active,
        row.probation, row.inactive, row.resigned, row.terminated,
      ]),
    );
    sendCsv(response, csvFilename("workforce-report"), csv);
  } catch (error) {
    if (tooLarge(response, error)) return;
    unavailable(response, error, "workforce export");
  }
}

// ---------------------------------------------------------------- attendance

export async function getAttendanceReport(request: Request, response: Response): Promise<void> {
  try {
    const range = await parseRange(request);
    if (!range.ok) {
      response.status(400).json({ success: false, message: range.message });
      return;
    }
    const filter = parseDepartment(request);
    if (!filter.ok) {
      response.status(400).json({ success: false, message: filter.message });
      return;
    }

    response.status(200).json({
      success: true,
      data: await attendanceReport(range.range, filter.filter),
    });
  } catch (error) {
    unavailable(response, error, "attendance");
  }
}

export async function exportAttendanceReport(request: Request, response: Response): Promise<void> {
  try {
    const range = await parseRange(request);
    if (!range.ok) {
      response.status(400).json({ success: false, message: range.message });
      return;
    }
    const filter = parseDepartment(request);
    if (!filter.ok) {
      response.status(400).json({ success: false, message: filter.message });
      return;
    }

    const report = await attendanceReport(range.range, filter.filter);
    // No coordinates, accuracy or distance: this file describes attendance, not
    // an employee's physical movements.
    const csv = buildCsv(
      [
        "Employee number", "Name", "Department", "Days recorded",
        "Present", "Late", "Absent", "On leave", "Late minutes", "Missing checkout",
      ],
      report.rows.map((row) => [
        row.employee_number, row.full_name, row.department_name, row.days_recorded,
        row.present, row.late, row.absent, row.on_leave, row.late_minutes, row.missing_checkout,
      ]),
    );
    sendCsv(response, csvFilename("attendance-report", `${range.range.from}_${range.range.to}`), csv);
  } catch (error) {
    if (tooLarge(response, error)) return;
    unavailable(response, error, "attendance export");
  }
}

// --------------------------------------------------------------------- leave

function parseLeaveFilters(request: Request): { leaveType: string | null; status: string | null } {
  const rawType = request.query.leaveType;
  const rawStatus = request.query.status;
  return {
    leaveType:
      typeof rawType === "string" && (leaveTypes as readonly string[]).includes(rawType)
        ? rawType : null,
    status:
      typeof rawStatus === "string" && (leaveStatuses as readonly string[]).includes(rawStatus)
        ? rawStatus : null,
  };
}

export async function getLeaveReport(request: Request, response: Response): Promise<void> {
  try {
    const range = await parseRange(request);
    if (!range.ok) {
      response.status(400).json({ success: false, message: range.message });
      return;
    }
    const filter = parseDepartment(request);
    if (!filter.ok) {
      response.status(400).json({ success: false, message: filter.message });
      return;
    }

    const leaveYear = parseLeaveYear(request, Number(range.range.to.slice(0, 4)));
    const report = await leaveReport(
      range.range,
      { ...filter.filter, ...parseLeaveFilters(request) },
    );

    // Balances are a position at a point in time, not a range, so they are
    // reported for the selected leave year alongside the requests.
    const employees = await employeesForBalances(filter.filter);
    const balances = await getBalancesForEmployees(
      pool, employees.map((employee) => employee.id), leaveYear,
    );

    response.status(200).json({
      success: true,
      data: {
        ...report,
        leaveYear,
        balances: employees.map((employee) => ({
          employee_id: employee.id,
          employee_number: employee.employee_number,
          full_name: employee.full_name,
          department_name: employee.department_name,
          balances: balances.get(employee.id) ?? [],
        })),
      },
    });
  } catch (error) {
    unavailable(response, error, "leave");
  }
}

export async function exportLeaveReport(request: Request, response: Response): Promise<void> {
  try {
    const range = await parseRange(request);
    if (!range.ok) {
      response.status(400).json({ success: false, message: range.message });
      return;
    }
    const filter = parseDepartment(request);
    if (!filter.ok) {
      response.status(400).json({ success: false, message: filter.message });
      return;
    }

    const report = await leaveReport(
      range.range, { ...filter.filter, ...parseLeaveFilters(request) },
    );
    const csv = buildCsv(
      [
        "Employee number", "Name", "Department", "Leave type", "Status",
        "Start date", "End date", "Working days", "Leave year",
      ],
      report.rows.map((row) => [
        row.employee_number, row.full_name, row.department_name, row.leave_type, row.status,
        row.start_date, row.end_date, row.working_days, row.leave_year,
      ]),
    );
    sendCsv(response, csvFilename("leave-report", `${range.range.from}_${range.range.to}`), csv);
  } catch (error) {
    if (tooLarge(response, error)) return;
    unavailable(response, error, "leave export");
  }
}

export async function exportLeaveBalances(request: Request, response: Response): Promise<void> {
  try {
    const filter = parseDepartment(request);
    if (!filter.ok) {
      response.status(400).json({ success: false, message: filter.message });
      return;
    }
    const leaveYear = parseLeaveYear(request, Number((await companyToday()).slice(0, 4)));

    const employees = await employeesForBalances(filter.filter);
    const balances = await getBalancesForEmployees(
      pool, employees.map((employee) => employee.id), leaveYear,
    );

    const rows: unknown[][] = [];
    for (const employee of employees) {
      for (const balance of balances.get(employee.id) ?? []) {
        rows.push([
          employee.employee_number, employee.full_name, employee.department_name,
          leaveYear, balance.leaveType, balance.entitledDays, balance.usedDays,
          balance.pendingDays, balance.remainingDays, balance.availableDays,
        ]);
      }
    }

    const csv = buildCsv(
      [
        "Employee number", "Name", "Department", "Leave year", "Leave type",
        "Entitled", "Used", "Pending", "Remaining", "Available",
      ],
      rows,
    );
    sendCsv(response, csvFilename("leave-balances", String(leaveYear)), csv);
  } catch (error) {
    if (tooLarge(response, error)) return;
    unavailable(response, error, "leave balance export");
  }
}

// ------------------------------------------------------------------- payroll

export async function getPayrollReport(request: Request, response: Response): Promise<void> {
  try {
    const periodId = parseIdParam(request.params.periodId);
    if (periodId === null) {
      response.status(400).json({ success: false, message: "Invalid payroll period ID" });
      return;
    }
    const filter = parseDepartment(request);
    if (!filter.ok) {
      response.status(400).json({ success: false, message: filter.message });
      return;
    }

    const report = await payrollReport(String(periodId), filter.filter);
    if (report.period === null) {
      response.status(404).json({ success: false, message: "Payroll period not found" });
      return;
    }

    response.status(200).json({ success: true, data: report });
  } catch (error) {
    unavailable(response, error, "payroll");
  }
}

export async function exportPayrollReport(request: Request, response: Response): Promise<void> {
  try {
    const periodId = parseIdParam(request.params.periodId);
    if (periodId === null) {
      response.status(400).json({ success: false, message: "Invalid payroll period ID" });
      return;
    }
    const filter = parseDepartment(request);
    if (!filter.ok) {
      response.status(400).json({ success: false, message: filter.message });
      return;
    }

    const report = await payrollReport(String(periodId), filter.filter);
    if (report.period === null) {
      response.status(404).json({ success: false, message: "Payroll period not found" });
      return;
    }

    // Amounts are formatted from the exact BIGINT sen string, never via a float.
    const csv = buildCsv(
      [
        "Employee number", "Name", "Department",
        "Basic salary", "Allowances", "Gross", "Deductions", "Net",
      ],
      report.rows.map((row) => [
        row.employee_number, row.full_name, row.department_name,
        formatSenExact(row.basic_salary_sen), formatSenExact(row.allowance_sen),
        formatSenExact(row.gross_sen), formatSenExact(row.deductions_sen),
        formatSenExact(row.net_sen),
      ]),
    );
    const { period_year: year, period_month: month } = report.period;
    sendCsv(
      response,
      csvFilename("payroll-report", `${year}-${String(month).padStart(2, "0")}`),
      csv,
    );
  } catch (error) {
    if (tooLarge(response, error)) return;
    unavailable(response, error, "payroll export");
  }
}
