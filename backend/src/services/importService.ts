import bcrypt from "bcrypt";
import { randomBytes } from "node:crypto";
import type { PoolClient } from "pg";
import { isEmployeeAccountActive } from "../utils/employeeValidation.js";
import {
  importFields,
  readRow,
  type ColumnMapping,
  type ImportField,
} from "../utils/importMapping.js";
import { setCompensation } from "./payrollService.js";
import {
  classifyRows,
  normalizeEmail,
  normalizeKey,
  summarize,
  type ExistingEmployee,
  type ImportContext,
  type ImportSummary,
  type RowResult,
} from "../utils/importValidation.js";

export type ImportJobStatus =
  | "pending" | "validating" | "ready" | "importing" | "completed" | "failed";

export interface ImportJob {
  id: string;
  file_name: string;
  import_type: string;
  initiated_by: number;
  status: ImportJobStatus;
  source_headers: string[];
  source_rows: string[][];
  column_mapping: ColumnMapping | null;
  total_rows: number;
  new_rows: number;
  update_rows: number;
  unchanged_rows: number;
  conflict_rows: number;
  invalid_rows: number;
  warning_rows: number;
  created_count: number;
  updated_count: number;
  error_message: string | null;
  created_at: string;
  completed_at: string | null;
}

/** Columns returned to callers; source_rows is large and stays server-side. */
export const jobColumns = `id, file_name, import_type, initiated_by, status,
  source_headers, column_mapping, total_rows, new_rows, update_rows, unchanged_rows,
  conflict_rows, invalid_rows, warning_rows, created_count, updated_count,
  error_message, created_at, completed_at`;

/**
 * Snapshot of everything a row is judged against.
 *
 * Loaded inside the import transaction as well as for preview, so a confirmed
 * import is validated against the database as it is at the moment of writing.
 */
export async function loadImportContext(client: PoolClient): Promise<ImportContext> {
  const departments = await client.query<{ id: number; name: string }>(
    "SELECT id, name FROM public.departments",
  );
  const employees = await client.query<ExistingEmployee>(
    `SELECT e.id, e.employee_number, e.full_name, e.job_title, e.department_id,
            e.employment_status, e.employment_date, e.date_of_birth, e.gender,
            e.phone, e.address, e.emergency_contact_name, e.emergency_contact_phone,
            u.id AS user_id, u.email
     FROM public.employees e
     LEFT JOIN public.users u ON u.employee_id = e.id`,
  );
  const accounts = await client.query<{ id: number; email: string; employee_id: number | null }>(
    "SELECT id, email, employee_id FROM public.users",
  );

  return {
    departments: new Map(
      departments.rows.map((row) => [normalizeKey(row.name), { id: row.id, name: row.name }]),
    ),
    employeesByNumber: new Map(
      employees.rows.map((row) => [normalizeKey(row.employee_number), row]),
    ),
    accountsByEmail: new Map(
      accounts.rows.map((row) => [
        normalizeEmail(row.email),
        { userId: row.id, employeeId: row.employee_id },
      ]),
    ),
  };
}

/** Department names referenced by the file that do not exist yet. */
export function missingDepartments(
  rows: string[][],
  mapping: ColumnMapping,
  context: ImportContext,
): string[] {
  const missing = new Map<string, string>();
  for (const row of rows) {
    const name = readRow(row, mapping).department;
    if (!name) continue;
    const key = normalizeKey(name);
    if (!context.departments.has(key) && !missing.has(key)) missing.set(key, name);
  }
  return [...missing.values()];
}

/** Replaces a job's stored per-row outcomes with a freshly computed set. */
export async function persistRows(
  client: PoolClient,
  jobId: string,
  results: RowResult[],
): Promise<void> {
  await client.query("DELETE FROM public.import_job_rows WHERE job_id = $1", [jobId]);
  if (results.length === 0) return;

  // One multi-row insert; a per-row round trip would dominate a large import.
  const values: unknown[] = [];
  const tuples = results.map((result, index) => {
    const base = index * 7;
    values.push(
      jobId,
      result.rowNumber,
      result.classification,
      result.employeeId,
      result.values === null ? null : JSON.stringify(result.values),
      JSON.stringify(result.issues),
      result.changedFields,
    );
    return `($${base + 1},$${base + 2},$${base + 3},$${base + 4},$${base + 5}::jsonb,$${base + 6}::jsonb,$${base + 7}::text[])`;
  });

  await client.query(
    `INSERT INTO public.import_job_rows
       (job_id, row_number, classification, employee_id, row_data, issues, changed_fields)
     VALUES ${tuples.join(",")}`,
    values,
  );
}

export async function writeSummary(
  client: PoolClient,
  jobId: string,
  summary: ImportSummary,
  status: ImportJobStatus,
): Promise<void> {
  await client.query(
    `UPDATE public.import_jobs
     SET status = $2, total_rows = $3, new_rows = $4, update_rows = $5,
         unchanged_rows = $6, conflict_rows = $7, invalid_rows = $8, warning_rows = $9
     WHERE id = $1`,
    [
      jobId, status, summary.total, summary.new, summary.update,
      summary.unchanged, summary.conflict, summary.invalid, summary.warnings,
    ],
  );
}

/** URL-safe, 128 bits of entropy, comfortably inside bcrypt's 72-byte input limit. */
function generatePassword(): string {
  return randomBytes(16).toString("base64url");
}

export interface AppliedCredential {
  employee_number: string;
  full_name: string;
  email: string;
  temporary_password: string;
}

export interface ApplyResult {
  summary: ImportSummary;
  created: number;
  updated: number;
  /** Returned once, never persisted and never logged. */
  credentials: AppliedCredential[];
  createdDepartments: string[];
  /** Entitlement rows written from mapped opening-balance columns. */
  openingBalanceGrants: number;
  /** New salary rows opened from mapped compensation columns. */
  compensationRecords: number;
}

export interface ApplyOptions {
  applyUpdates: boolean;
  createMissingDepartments: boolean;
}

/** Employee columns an update may write. Money and leave live in their own tables. */
type UpdatableEmployeeColumn =
  | "full_name" | "job_title" | "employment_status" | "employment_date"
  | "date_of_birth" | "gender" | "phone" | "address"
  | "emergency_contact_name" | "emergency_contact_phone";

const updatableColumns: UpdatableEmployeeColumn[] = [
  "full_name", "job_title", "employment_status", "employment_date",
  "date_of_birth", "gender", "phone", "address",
  "emergency_contact_name", "emergency_contact_phone",
];

/**
 * Applies a validated import inside one transaction.
 *
 * The caller owns BEGIN/COMMIT so a failure anywhere — a concurrent duplicate,
 * a vanished department — rolls back every row rather than leaving a partial
 * workforce behind. Rows are re-classified here against live data, so a preview
 * that has gone stale cannot be applied on its stale terms.
 */
export async function applyImport(
  client: PoolClient,
  job: ImportJob,
  options: ApplyOptions,
): Promise<ApplyResult> {
  const mapping = job.column_mapping!;
  const createdDepartments: string[] = [];

  if (options.createMissingDepartments) {
    const context = await loadImportContext(client);
    for (const name of missingDepartments(job.source_rows, mapping, context)) {
      // ON CONFLICT covers a name created concurrently between preview and now.
      await client.query(
        `INSERT INTO public.departments (name, description)
         VALUES ($1, $2) ON CONFLICT (name) DO NOTHING`,
        [name, "Created by workforce import"],
      );
      createdDepartments.push(name);
    }
  }

  const context = await loadImportContext(client);
  const results = classifyRows(job.source_rows, mapping, context);
  const summary = summarize(results);

  const toCreate = results.filter((result) => result.classification === "new");
  const toUpdate = options.applyUpdates
    ? results.filter((result) => result.classification === "update")
    : [];

  // Hashing is deliberately done before any row is written: bcrypt is slow, and
  // running it inside the write loop would hold row locks for its duration.
  const passwords = toCreate.map(() => generatePassword());
  const hashes = await Promise.all(passwords.map((password) => bcrypt.hash(password, 12)));

  const credentials: AppliedCredential[] = [];

  for (const [index, result] of toCreate.entries()) {
    const values = result.values!;
    const inserted = await client.query<{ id: number }>(
      `INSERT INTO public.employees (
         employee_number, full_name, phone, address, date_of_birth, gender,
         emergency_contact_name, emergency_contact_phone, job_title,
         department_id, employment_date, employment_status
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       RETURNING id`,
      [
        values.employee_number, values.full_name, values.phone, values.address,
        values.date_of_birth, values.gender, values.emergency_contact_name,
        values.emergency_contact_phone, values.job_title, values.department_id,
        values.employment_date, values.employment_status,
      ],
    );

    const employeeId = inserted.rows[0]!.id;
    // Account activity follows employment status, exactly as manual creation does.
    // must_change_password is TRUE without exception: this password was generated
    // here and handed to an administrator to pass on, so the employee has never
    // chosen it and someone else has seen it.
    await client.query(
      `INSERT INTO public.users
         (employee_id, email, password_hash, role, is_active, must_change_password)
       VALUES ($1,$2,$3,'employee',$4,TRUE)`,
      [employeeId, values.email, hashes[index], isEmployeeAccountActive(values.employment_status)],
    );

    result.employeeId = employeeId;
    credentials.push({
      employee_number: values.employee_number,
      full_name: values.full_name,
      email: values.email,
      temporary_password: passwords[index]!,
    });
  }

  for (const result of toUpdate) {
    const values = result.values!;
    const assignments: string[] = [];
    const parameters: unknown[] = [];

    for (const column of updatableColumns) {
      if (mapping[column] === undefined) continue;
      parameters.push(values[column]);
      assignments.push(`${column} = $${parameters.length}`);
    }
    if (mapping.department !== undefined) {
      parameters.push(values.department_id);
      assignments.push(`department_id = $${parameters.length}`);
    }

    if (assignments.length > 0) {
      parameters.push(result.employeeId);
      await client.query(
        `UPDATE public.employees SET ${assignments.join(", ")}, updated_at = CURRENT_TIMESTAMP
         WHERE id = $${parameters.length}`,
        parameters,
      );
    }

    if (mapping.email !== undefined) {
      await client.query(
        "UPDATE public.users SET email = $1, updated_at = CURRENT_TIMESTAMP WHERE employee_id = $2",
        [values.email, result.employeeId],
      );
    }

    // Employment status changes must carry the linked account with them.
    if (mapping.employment_status !== undefined) {
      await client.query(
        "UPDATE public.users SET is_active = $1, updated_at = CURRENT_TIMESTAMP WHERE employee_id = $2",
        [isEmployeeAccountActive(values.employment_status), result.employeeId],
      );
    }
  }

  // Opening balances are what the employee had left in the previous system, so
  // they are recorded as carry-forward for the current leave year rather than a
  // fresh grant. An existing grant is replaced only for the types the file maps.
  type OpeningField =
    | "opening_annual_days" | "opening_medical_days" | "opening_emergency_days";
  const openingByType: Array<[OpeningField, string]> = [
    ["opening_annual_days", "annual"],
    ["opening_medical_days", "medical"],
    ["opening_emergency_days", "emergency"],
  ];
  const mapsOpeningBalances = openingByType.some(([field]) => mapping[field] !== undefined);
  let openingBalanceGrants = 0;

  if (mapsOpeningBalances) {
    const leaveYear = Number(
      (await client.query<{ year: string }>(
        `SELECT to_char(CURRENT_TIMESTAMP AT TIME ZONE COALESCE(
           (SELECT timezone FROM public.company_settings WHERE id = 1), 'UTC'), 'YYYY') AS year`,
      )).rows[0]!.year,
    );

    for (const result of [...toCreate, ...toUpdate]) {
      if (result.employeeId === null) continue;
      for (const [field, leaveType] of openingByType) {
        if (mapping[field] === undefined) continue;
        const days = result.values?.[field] ?? null;
        if (days === null) continue;

        await client.query(
          `INSERT INTO public.leave_entitlements
             (employee_id, leave_year, leave_type, entitled_days, carried_forward_days, source, note)
           VALUES ($1, $2, $3, 0, $4, 'opening_balance', 'Imported opening balance')
           ON CONFLICT (employee_id, leave_year, leave_type) DO UPDATE SET
             entitled_days = 0,
             carried_forward_days = EXCLUDED.carried_forward_days,
             source = 'opening_balance',
             note = EXCLUDED.note,
             updated_at = CURRENT_TIMESTAMP`,
          [result.employeeId, leaveYear, leaveType, days],
        );
        openingBalanceGrants += 1;
      }
    }
  }

  // Compensation from a file opens a NEW salary row rather than editing history.
  // A row is written only when the file actually maps a money column and the
  // amounts differ from what is already effective, so re-importing an unchanged
  // spreadsheet never disturbs salary history.
  const mapsCompensation = mapping.basic_salary !== undefined
    || mapping.allowance !== undefined
    || mapping.overtime_rate !== undefined;
  let compensationRecords = 0;

  if (mapsCompensation) {
    const today = (await client.query<{ today: string }>(
      `SELECT to_char(CURRENT_TIMESTAMP AT TIME ZONE COALESCE(
         (SELECT timezone FROM public.company_settings WHERE id = 1), 'UTC'), 'YYYY-MM-DD') AS today`,
    )).rows[0]!.today;

    for (const result of [...toCreate, ...toUpdate]) {
      if (result.employeeId === null || result.values === null) continue;
      const values = result.values;
      if (values.basic_salary_sen === null
        && values.allowance_sen === null
        && values.overtime_rate_sen === null) continue;

      const current = (await client.query<{
        basic_salary_sen: string; allowance_sen: string; overtime_rate_sen: string;
      }>(
        `SELECT basic_salary_sen, allowance_sen, overtime_rate_sen
         FROM public.employee_compensation
         WHERE employee_id = $1 AND effective_from <= $2::date
           AND (effective_to IS NULL OR effective_to >= $2::date)
         ORDER BY effective_from DESC LIMIT 1`,
        [result.employeeId, today],
      )).rows[0];

      // Unmapped columns keep whatever is already in force.
      const basic = values.basic_salary_sen ?? Number(current?.basic_salary_sen ?? 0);
      const allowance = values.allowance_sen ?? Number(current?.allowance_sen ?? 0);
      const overtime = values.overtime_rate_sen ?? Number(current?.overtime_rate_sen ?? 0);

      const unchanged = current
        && Number(current.basic_salary_sen) === basic
        && Number(current.allowance_sen) === allowance
        && Number(current.overtime_rate_sen) === overtime;
      if (unchanged) continue;

      // A new hire's salary starts on their employment date where known.
      const effectiveFrom = !current && values.employment_date ? values.employment_date : today;

      await setCompensation(client, {
        employeeId: result.employeeId,
        basicSalarySen: basic,
        allowanceSen: allowance,
        overtimeRateSen: overtime,
        effectiveFrom,
        note: "Imported from a workforce file",
        createdBy: job.initiated_by,
      });
      compensationRecords += 1;
    }
  }

  const applied = new Set([...toCreate, ...toUpdate].map((result) => result.rowNumber));
  await persistRows(client, job.id, results);
  if (applied.size > 0) {
    await client.query(
      "UPDATE public.import_job_rows SET applied = TRUE WHERE job_id = $1 AND row_number = ANY($2::int[])",
      [job.id, [...applied]],
    );
  }

  await client.query(
    `UPDATE public.import_jobs
     SET status = 'completed', completed_at = CURRENT_TIMESTAMP,
         total_rows = $2, new_rows = $3, update_rows = $4, unchanged_rows = $5,
         conflict_rows = $6, invalid_rows = $7, warning_rows = $8,
         created_count = $9, updated_count = $10
     WHERE id = $1`,
    [
      job.id, summary.total, summary.new, summary.update, summary.unchanged,
      summary.conflict, summary.invalid, summary.warnings, toCreate.length, toUpdate.length,
    ],
  );

  return {
    summary,
    created: toCreate.length,
    updated: toUpdate.length,
    credentials,
    createdDepartments,
    openingBalanceGrants,
    compensationRecords,
  };
}

/** CSV template whose headings are the canonical field names. */
export function buildTemplateCsv(): string {
  const example: Record<ImportField, string> = {
    employee_number: "EMP-001",
    full_name: "Aisyah Rahman",
    email: "aisyah.rahman@example.com",
    department: "Engineering",
    job_title: "Software Engineer",
    employment_status: "active",
    employment_date: "2024-03-01",
    date_of_birth: "1995-06-15",
    gender: "Female",
    phone: "+60 12-345 6789",
    address: "12 Jalan Example, Kuala Lumpur",
    basic_salary: "3500.00",
    allowance: "250.00",
    overtime_rate: "20.00",
    opening_annual_days: "8",
    opening_medical_days: "10",
    opening_emergency_days: "2",
    emergency_contact_name: "Nurul Rahman",
    emergency_contact_phone: "+60 12-987 6543",
  };

  const escape = (value: string) =>
    /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;

  return [
    importFields.join(","),
    importFields.map((field) => escape(example[field])).join(","),
  ].join("\r\n") + "\r\n";
}
