/**
 * Company data export.
 *
 * Master §42: a company must be able to retrieve its own data, both to move in
 * and to leave. Every dataset here is therefore a faithful rendering of what is
 * stored, not a recalculation — attendance lateness, leave working days and all
 * payroll money are read back exactly as they were snapshotted, so an exported
 * file agrees with the payslip that was issued at the time.
 *
 * What is deliberately NOT exported, and why:
 *
 *   users.password_hash            a credential, in any form
 *   attendance_qr_challenges       token hashes; the QR secret's whole point
 *   attendance_qr_uses             verification internals, no HR meaning
 *   attendance coordinates         latitude, longitude, accuracy and distance
 *                                  from the office describe where a person
 *                                  physically was; that is not spreadsheet data
 *   company office coordinates     the geofence's position, same reasoning
 *   import_job_rows.row_data       the raw uploaded rows, which for a workforce
 *                                  import can contain temporary passwords
 *   import_jobs.source_rows        the same content, held on the job
 *   schema_migrations              file checksums; internal, not company data
 *   employees.profile_image        an internal storage path, useless without
 *                                  the file it points at
 *
 * Queries are set-based and ordered by a stable key, so exporting twice over
 * unchanged data produces byte-identical output.
 */
import type { PoolClient } from "pg";
import pool from "../config/db.js";
import { formatSenExact } from "../utils/payrollMoney.js";
import { getBalancesForEmployees } from "./leaveBalanceService.js";

type Db = Pick<PoolClient, "query">;

export interface Dataset {
  /** URL segment and CSV filename stem. */
  key: string;
  /** Worksheet tab name and UI label. */
  label: string;
  /** One line explaining what the dataset holds. */
  description: string;
  headers: readonly string[];
  load: (db: Db, context: ExportContext) => Promise<unknown[][]>;
}

export interface ExportContext {
  /** The company's own calendar year, used for derived leave balances. */
  leaveYear: number;
}

const money = (value: unknown): string => formatSenExact(String(value ?? "0"));

/** Timestamps go out as ISO 8601 UTC so they are unambiguous in any timezone. */
const iso = (value: unknown): string =>
  value === null || value === undefined ? "" : new Date(value as string).toISOString();

export const datasets: readonly Dataset[] = [
  {
    key: "employees",
    label: "Employees",
    description: "Every personnel record, including inactive and former employees.",
    headers: [
      "Employee ID", "Employee number", "Full name", "Job title", "Department",
      "Employment status", "Employment date", "Date of birth", "Gender", "Phone",
      "Address", "Emergency contact name", "Emergency contact phone",
      "Created at", "Updated at",
    ],
    load: async (db) => {
      const { rows } = await db.query(
        `SELECT e.id, e.employee_number, e.full_name, e.job_title,
                COALESCE(d.name, '') AS department_name, e.employment_status,
                e.employment_date::text AS employment_date,
                e.date_of_birth::text AS date_of_birth, e.gender, e.phone, e.address,
                e.emergency_contact_name, e.emergency_contact_phone,
                e.created_at, e.updated_at
         FROM public.employees e
         LEFT JOIN public.departments d ON d.id = e.department_id
         ORDER BY e.id`,
      );
      return rows.map((row) => [
        Number(row.id), row.employee_number, row.full_name, row.job_title,
        row.department_name, row.employment_status, row.employment_date,
        row.date_of_birth, row.gender, row.phone, row.address,
        row.emergency_contact_name, row.emergency_contact_phone,
        iso(row.created_at), iso(row.updated_at),
      ]);
    },
  },

  {
    key: "departments",
    label: "Departments",
    description: "Departments and their current headcount.",
    headers: ["Department ID", "Name", "Description", "Employees", "Created at", "Updated at"],
    load: async (db) => {
      const { rows } = await db.query(
        `SELECT d.id, d.name, d.description, d.created_at, d.updated_at,
                (SELECT COUNT(*)::int FROM public.employees e WHERE e.department_id = d.id) AS headcount
         FROM public.departments d
         ORDER BY d.id`,
      );
      return rows.map((row) => [
        Number(row.id), row.name, row.description, row.headcount,
        iso(row.created_at), iso(row.updated_at),
      ]);
    },
  },

  {
    key: "company-settings",
    label: "Company settings",
    description: "Company profile and attendance rules. Office coordinates are excluded.",
    headers: ["Setting", "Value"],
    load: async (db) => {
      // Office latitude and longitude are deliberately not selected: they are
      // the geofence's position, and the audit log redacts them for the same
      // reason. The radius is kept, because it is a rule rather than a place.
      const { rows } = await db.query(
        `SELECT company_name, registration_number, address, email, phone, timezone,
                working_days, work_start_time, work_end_time, grace_period_minutes,
                attendance_radius_meters, revision, created_at, updated_at
         FROM public.company_settings WHERE id = 1`,
      );
      const settings = rows[0];
      if (!settings) return [];

      const weekdays = ["", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
      return [
        ["Company name", settings.company_name],
        ["Registration number", settings.registration_number],
        ["Address", settings.address],
        ["Email", settings.email],
        ["Phone", settings.phone],
        ["Timezone", settings.timezone],
        ["Working days", (settings.working_days ?? []).map((day: number) => weekdays[day] ?? day).join(", ")],
        ["Work start time", settings.work_start_time],
        ["Work end time", settings.work_end_time],
        ["Grace period (minutes)", settings.grace_period_minutes],
        ["Attendance radius (metres)", settings.attendance_radius_meters],
        ["Settings revision", settings.revision],
        ["Created at", iso(settings.created_at)],
        ["Updated at", iso(settings.updated_at)],
      ];
    },
  },

  {
    key: "user-accounts",
    label: "User accounts",
    description: "Which people can sign in, and in what role. No credential material.",
    headers: [
      "User ID", "Employee number", "Full name", "Email", "Role", "Active",
      "Created at", "Updated at",
    ],
    load: async (db) => {
      // password_hash is not in this list and must never be. The account's
      // existence, address and role are HR facts; the credential is not.
      const { rows } = await db.query(
        `SELECT u.id, COALESCE(e.employee_number, '') AS employee_number,
                COALESCE(e.full_name, '') AS full_name,
                u.email, u.role, u.is_active, u.created_at, u.updated_at
         FROM public.users u
         LEFT JOIN public.employees e ON e.id = u.employee_id
         ORDER BY u.id`,
      );
      return rows.map((row) => [
        Number(row.id), row.employee_number, row.full_name, row.email, row.role,
        row.is_active, iso(row.created_at), iso(row.updated_at),
      ]);
    },
  },

  {
    key: "attendance",
    label: "Attendance",
    description: "Attendance records with their verification state. No coordinates.",
    headers: [
      "Attendance ID", "Employee number", "Full name", "Date", "Check in", "Check out",
      "Status", "Late minutes", "Verification method", "Verification state",
      "Manually entered", "Administrator note", "Created at", "Updated at",
    ],
    load: async (db) => {
      // Named columns, not *: coordinates, accuracy and distance stay in the
      // database, and a column added to `attendance` later cannot leak here.
      const { rows } = await db.query(
        `SELECT a.id, COALESCE(e.employee_number, '') AS employee_number,
                COALESCE(e.full_name, '') AS full_name,
                a.attendance_date::text AS attendance_date,
                a.check_in_time, a.check_out_time, a.status, a.late_minutes,
                a.verification_method, a.verification_status, a.is_manual,
                a.admin_note, a.created_at, a.updated_at
         FROM public.attendance a
         LEFT JOIN public.employees e ON e.id = a.employee_id
         ORDER BY a.id`,
      );
      return rows.map((row) => [
        Number(row.id), row.employee_number, row.full_name, row.attendance_date,
        row.check_in_time, row.check_out_time, row.status,
        row.late_minutes === null ? "" : Number(row.late_minutes),
        row.verification_method, row.verification_status, row.is_manual,
        row.admin_note, iso(row.created_at), iso(row.updated_at),
      ]);
    },
  },

  {
    key: "leave-requests",
    label: "Leave requests",
    description: "Every leave request and its outcome, with the working days snapshotted at submission.",
    headers: [
      "Request ID", "Employee number", "Full name", "Leave type", "Start date", "End date",
      "Working days", "Leave year", "Status", "Reason", "Administrator comment",
      "Reviewed by", "Reviewed at", "Cancelled at", "Created at", "Updated at",
    ],
    load: async (db) => {
      const { rows } = await db.query(
        `SELECT l.id, COALESCE(e.employee_number, '') AS employee_number,
                COALESCE(e.full_name, '') AS full_name, l.leave_type,
                l.start_date::text AS start_date, l.end_date::text AS end_date,
                l.working_days, l.leave_year, l.status, l.reason, l.admin_comment,
                COALESCE(reviewer.email, '') AS reviewed_by,
                l.reviewed_at, l.cancelled_at, l.created_at, l.updated_at
         FROM public.leave_requests l
         LEFT JOIN public.employees e ON e.id = l.employee_id
         LEFT JOIN public.users reviewer ON reviewer.id = l.reviewed_by
         ORDER BY l.id`,
      );
      return rows.map((row) => [
        Number(row.id), row.employee_number, row.full_name, row.leave_type,
        row.start_date, row.end_date,
        row.working_days === null ? "" : Number(row.working_days),
        row.leave_year === null ? "" : Number(row.leave_year),
        row.status, row.reason, row.admin_comment, row.reviewed_by,
        iso(row.reviewed_at), iso(row.cancelled_at),
        iso(row.created_at), iso(row.updated_at),
      ]);
    },
  },

  {
    key: "leave-entitlements",
    label: "Leave entitlements",
    description: "The stored grant per employee, leave year and type.",
    headers: [
      "Entitlement ID", "Employee number", "Full name", "Leave year", "Leave type",
      "Entitled days", "Carried forward", "Adjustment", "Source", "Note",
      "Created at", "Updated at",
    ],
    load: async (db) => {
      const { rows } = await db.query(
        `SELECT le.id, COALESCE(e.employee_number, '') AS employee_number,
                COALESCE(e.full_name, '') AS full_name, le.leave_year, le.leave_type,
                le.entitled_days, le.carried_forward_days, le.adjustment_days,
                le.source, le.note, le.created_at, le.updated_at
         FROM public.leave_entitlements le
         LEFT JOIN public.employees e ON e.id = le.employee_id
         ORDER BY le.id`,
      );
      return rows.map((row) => [
        Number(row.id), row.employee_number, row.full_name, Number(row.leave_year),
        row.leave_type, Number(row.entitled_days), Number(row.carried_forward_days),
        Number(row.adjustment_days), row.source, row.note,
        iso(row.created_at), iso(row.updated_at),
      ]);
    },
  },

  {
    key: "leave-balances",
    label: "Leave balances",
    description: "Balances for the current leave year, derived by the same rule the leave pages use.",
    headers: [
      "Employee number", "Full name", "Department", "Leave year", "Leave type",
      "Entitled", "Used", "Pending", "Remaining", "Available", "Deducts balance", "Paid",
    ],
    load: async (db, context) => {
      // Derived, not stored. It reuses getBalancesForEmployees, so an exported
      // balance cannot disagree with the one shown on the leave page, and it is
      // two set-based queries rather than one per employee.
      const { rows: employees } = await db.query(
        `SELECT e.id, e.employee_number, e.full_name, COALESCE(d.name, '') AS department_name
         FROM public.employees e
         LEFT JOIN public.departments d ON d.id = e.department_id
         WHERE e.employment_status IN ('active', 'probation')
         ORDER BY e.employee_number`,
      );

      const balances = await getBalancesForEmployees(
        db, employees.map((employee) => Number(employee.id)), context.leaveYear,
      );

      const output: unknown[][] = [];
      for (const employee of employees) {
        for (const balance of balances.get(Number(employee.id)) ?? []) {
          output.push([
            employee.employee_number, employee.full_name, employee.department_name,
            context.leaveYear, balance.leaveType, balance.entitledDays, balance.usedDays,
            balance.pendingDays, balance.remainingDays, balance.availableDays,
            balance.deductsBalance, balance.isPaid,
          ]);
        }
      }
      return output;
    },
  },

  {
    key: "leave-policies",
    label: "Leave policies",
    description: "The company's leave rules, needed to interpret the balances.",
    headers: [
      "Leave type", "Default annual days", "Deducts balance", "Paid", "Active",
      "Created at", "Updated at",
    ],
    load: async (db) => {
      const { rows } = await db.query(
        `SELECT leave_type, default_annual_days, deducts_balance, is_paid, active,
                created_at, updated_at
         FROM public.leave_policies ORDER BY leave_type`,
      );
      return rows.map((row) => [
        row.leave_type, Number(row.default_annual_days), row.deducts_balance,
        row.is_paid, row.active, iso(row.created_at), iso(row.updated_at),
      ]);
    },
  },

  {
    key: "compensation",
    label: "Compensation",
    description: "Salary history. Amounts are exact text rendered from integer sen.",
    headers: [
      "Compensation ID", "Employee number", "Full name", "Basic salary (MYR)",
      "Allowance (MYR)", "Overtime rate (MYR)", "Effective from", "Effective to",
      "Note", "Created at", "Updated at",
    ],
    load: async (db) => {
      const { rows } = await db.query(
        `SELECT c.id, COALESCE(e.employee_number, '') AS employee_number,
                COALESCE(e.full_name, '') AS full_name,
                c.basic_salary_sen::text, c.allowance_sen::text, c.overtime_rate_sen::text,
                c.effective_from::text AS effective_from, c.effective_to::text AS effective_to,
                c.note, c.created_at, c.updated_at
         FROM public.employee_compensation c
         LEFT JOIN public.employees e ON e.id = c.employee_id
         ORDER BY c.id`,
      );
      return rows.map((row) => [
        Number(row.id), row.employee_number, row.full_name,
        money(row.basic_salary_sen), money(row.allowance_sen), money(row.overtime_rate_sen),
        row.effective_from, row.effective_to, row.note,
        iso(row.created_at), iso(row.updated_at),
      ]);
    },
  },

  {
    key: "payroll-periods",
    label: "Payroll periods",
    description: "Each payroll period and how far through the process it reached.",
    headers: [
      "Period ID", "Year", "Month", "Start date", "End date", "Status", "Working days",
      "Note", "Calculated at", "Reviewed at", "Approved at", "Approved by",
      "Paid at", "Paid by", "Created at", "Updated at",
    ],
    load: async (db) => {
      const { rows } = await db.query(
        `SELECT p.id::text, p.period_year, p.period_month,
                p.start_date::text AS start_date, p.end_date::text AS end_date,
                p.status, p.working_days, p.note,
                p.calculated_at, p.reviewed_at, p.approved_at, p.paid_at,
                COALESCE(approver.email, '') AS approved_by,
                COALESCE(payer.email, '') AS paid_by,
                p.created_at, p.updated_at
         FROM public.payroll_periods p
         LEFT JOIN public.users approver ON approver.id = p.approved_by
         LEFT JOIN public.users payer ON payer.id = p.paid_by
         ORDER BY p.period_year, p.period_month, p.id`,
      );
      return rows.map((row) => [
        row.id, Number(row.period_year), Number(row.period_month),
        row.start_date, row.end_date, row.status,
        row.working_days === null ? "" : Number(row.working_days), row.note,
        iso(row.calculated_at), iso(row.reviewed_at), iso(row.approved_at), row.approved_by,
        iso(row.paid_at), row.paid_by, iso(row.created_at), iso(row.updated_at),
      ]);
    },
  },

  {
    key: "payroll-records",
    label: "Payroll records",
    description: "One row per employee per period, as issued. Amounts are exact text from integer sen.",
    headers: [
      "Record ID", "Period ID", "Period", "Employee number", "Full name", "Department",
      "Job title", "Basic salary (MYR)", "Allowance (MYR)", "Overtime rate (MYR)",
      "Overtime hours", "Unpaid leave days", "Working days",
      "Gross (MYR)", "Deductions (MYR)", "Net (MYR)", "Calculated at",
    ],
    load: async (db) => {
      // The employee number, name, department and job title stored on the record
      // are the ones snapshotted when payroll ran. They are read back as stored
      // rather than re-joined, so a later transfer cannot rewrite an issued
      // payslip.
      const { rows } = await db.query(
        `SELECT r.id::text, r.period_id::text,
                p.period_year, p.period_month,
                r.employee_number, r.full_name, r.department_name, r.job_title,
                r.basic_salary_sen::text, r.allowance_sen::text, r.overtime_rate_sen::text,
                r.overtime_hours, r.unpaid_leave_days, r.working_days,
                r.gross_sen::text, r.deductions_sen::text, r.net_sen::text, r.calculated_at
         FROM public.payroll_records r
         JOIN public.payroll_periods p ON p.id = r.period_id
         ORDER BY r.id`,
      );
      return rows.map((row) => [
        row.id, row.period_id,
        `${row.period_year}-${String(row.period_month).padStart(2, "0")}`,
        row.employee_number, row.full_name, row.department_name, row.job_title,
        money(row.basic_salary_sen), money(row.allowance_sen), money(row.overtime_rate_sen),
        Number(row.overtime_hours), Number(row.unpaid_leave_days), Number(row.working_days),
        money(row.gross_sen), money(row.deductions_sen), money(row.net_sen),
        iso(row.calculated_at),
      ]);
    },
  },

  {
    key: "payroll-items",
    label: "Payroll line items",
    description: "The individual earnings and deductions behind each payroll record.",
    headers: [
      "Item ID", "Record ID", "Period", "Employee number", "Type", "Code", "Label",
      "Amount (MYR)", "Manual", "Statutory", "Note", "Created at",
    ],
    load: async (db) => {
      const { rows } = await db.query(
        `SELECT i.id::text, i.record_id::text,
                p.period_year, p.period_month, r.employee_number,
                i.item_type, i.code, i.label, i.amount_sen::text,
                i.is_manual, i.is_statutory, i.note, i.created_at
         FROM public.payroll_items i
         JOIN public.payroll_records r ON r.id = i.record_id
         JOIN public.payroll_periods p ON p.id = r.period_id
         ORDER BY i.id`,
      );
      return rows.map((row) => [
        row.id, row.record_id,
        `${row.period_year}-${String(row.period_month).padStart(2, "0")}`,
        row.employee_number, row.item_type, row.code, row.label,
        money(row.amount_sen), row.is_manual, row.is_statutory, row.note,
        iso(row.created_at),
      ]);
    },
  },

  {
    key: "audit-events",
    label: "Audit events",
    description: "The append-only administrative history. Already redacted when written.",
    headers: [
      "Event ID", "Occurred at", "Actor", "Actor role", "Action", "Area",
      "Target", "Summary", "What changed", "Outcome",
    ],
    load: async (db) => {
      // Reading only. The audit table is append-only in the database, and this
      // export has no path that writes to it.
      const { rows } = await db.query(
        `SELECT id::text, occurred_at, actor_label, actor_role, action, entity_type,
                COALESCE(entity_id, '') AS entity_id, summary,
                COALESCE(changes::text, '') AS changes, outcome
         FROM public.audit_events ORDER BY id`,
      );
      return rows.map((row) => [
        row.id, iso(row.occurred_at), row.actor_label, row.actor_role, row.action,
        row.entity_type, row.entity_id, row.summary, row.changes, row.outcome,
      ]);
    },
  },

  {
    key: "import-history",
    label: "Import history",
    description: "What was imported and when. The uploaded file contents are not included.",
    headers: [
      "Job ID", "File name", "Import type", "Status", "Initiated by", "Total rows",
      "New", "Updates", "Unchanged", "Conflicts", "Invalid", "Warnings",
      "Created", "Updated", "Error", "Started at", "Completed at",
    ],
    load: async (db) => {
      // source_rows, source_headers and column_mapping are not selected: they
      // hold the uploaded content and its shape, and a workforce upload can
      // carry a temporary password column. import_job_rows is excluded entirely
      // for the same reason.
      const { rows } = await db.query(
        `SELECT j.id::text, j.file_name, j.import_type, j.status,
                COALESCE(u.email, '') AS initiated_by,
                j.total_rows, j.new_rows, j.update_rows, j.unchanged_rows,
                j.conflict_rows, j.invalid_rows, j.warning_rows,
                j.created_count, j.updated_count, j.error_message,
                j.created_at, j.completed_at
         FROM public.import_jobs j
         LEFT JOIN public.users u ON u.id = j.initiated_by
         ORDER BY j.id`,
      );
      return rows.map((row) => [
        row.id, row.file_name, row.import_type, row.status, row.initiated_by,
        Number(row.total_rows ?? 0), Number(row.new_rows ?? 0), Number(row.update_rows ?? 0),
        Number(row.unchanged_rows ?? 0), Number(row.conflict_rows ?? 0),
        Number(row.invalid_rows ?? 0), Number(row.warning_rows ?? 0),
        Number(row.created_count ?? 0), Number(row.updated_count ?? 0),
        row.error_message, iso(row.created_at), iso(row.completed_at),
      ]);
    },
  },
];

export const datasetsByKey = new Map(datasets.map((dataset) => [dataset.key, dataset]));

export async function loadDataset(
  dataset: Dataset, context: ExportContext, db: Db = pool,
): Promise<unknown[][]> {
  return dataset.load(db, context);
}
