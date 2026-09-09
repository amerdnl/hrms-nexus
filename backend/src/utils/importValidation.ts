import {
  employmentStatuses,
  type EmploymentStatus,
} from "./employeeValidation.js";
import {
  importFieldLabels,
  readRow,
  requiredImportFields,
  type ColumnMapping,
  type ImportField,
} from "./importMapping.js";

/**
 * Row outcomes, per the master brief's upsert model.
 *
 * `invalid` and `conflict` are never applied. `unchanged` is skipped. `new` and
 * `update` are the only rows a confirmed import writes, and `update` requires
 * explicit confirmation from the admin.
 */
export type RowClassification = "new" | "update" | "unchanged" | "conflict" | "invalid";

export interface RowIssue {
  field: ImportField | null;
  level: "error" | "warning";
  message: string;
}

export interface EmployeeValues {
  employee_number: string;
  full_name: string;
  email: string;
  department_id: number;
  job_title: string | null;
  employment_status: EmploymentStatus;
  employment_date: string | null;
  date_of_birth: string | null;
  gender: string | null;
  phone: string | null;
  address: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  /** Days carried in from a previous system. Absent when the column is unmapped. */
  opening_annual_days: number | null;
  opening_medical_days: number | null;
  opening_emergency_days: number | null;
}

export interface ExistingEmployee {
  id: number;
  employee_number: string;
  full_name: string;
  job_title: string | null;
  department_id: number | null;
  employment_status: string;
  employment_date: string | null;
  date_of_birth: string | null;
  gender: string | null;
  phone: string | null;
  address: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  user_id: number | null;
  email: string | null;
}

export interface ImportContext {
  /** Normalized department name -> id, and the exact stored name for warnings. */
  departments: Map<string, { id: number; name: string }>;
  /** Normalized employee number -> current record. */
  employeesByNumber: Map<string, ExistingEmployee>;
  /** Normalized email -> the account that already holds it. */
  accountsByEmail: Map<string, { userId: number; employeeId: number | null }>;
}

export interface RowResult {
  /** 1-based index among data rows; the spreadsheet line is this plus the header. */
  rowNumber: number;
  classification: RowClassification;
  issues: RowIssue[];
  values: EmployeeValues | null;
  employeeId: number | null;
  /** Fields that differ from the stored record, for `update` rows. */
  changedFields: ImportField[];
}

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const phonePattern = /^\+?[\d ().-]+$/;

/** Spreadsheet wording mapped onto the supported lifecycle set. */
const statusSynonyms: Record<string, EmploymentStatus> = {
  active: "active", confirmed: "active", permanent: "active", "full time": "active",
  fulltime: "active", employed: "active", current: "active",
  probation: "probation", probationary: "probation", "on probation": "probation",
  trainee: "probation", intern: "probation",
  inactive: "inactive", suspended: "inactive", "on hold": "inactive", dormant: "inactive",
  resigned: "resigned", resignation: "resigned", left: "resigned", quit: "resigned",
  terminated: "terminated", dismissed: "terminated", fired: "terminated",
  "contract ended": "terminated",
};

export const normalizeKey = (value: string) => value.trim().toLowerCase().replace(/\s+/g, " ");
export const normalizeEmail = (value: string) => value.trim().toLowerCase();

function hasControlCharacters(value: string): boolean {
  return [...value].some((character) => {
    const code = character.charCodeAt(0);
    return (code < 32 && ![9, 10, 13].includes(code)) || code === 127;
  });
}

/**
 * Accepts ISO `YYYY-MM-DD` plus day-first `DD/MM/YYYY` and `DD-MM-YYYY`.
 *
 * Day-first is deliberate and documented in the template: the alternative is
 * silently reading 03/04/2024 as two different dates depending on the file.
 */
function parseImportDate(raw: string): string | null {
  const value = raw.trim();
  let year: number;
  let month: number;
  let day: number;

  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  const dayFirst = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(value);

  if (iso) {
    [, year, month, day] = [0, Number(iso[1]), Number(iso[2]), Number(iso[3])];
  } else if (dayFirst) {
    [, day, month, year] = [0, Number(dayFirst[1]), Number(dayFirst[2]), Number(dayFirst[3])];
  } else {
    return null;
  }

  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    return null;
  }
  return parsed.toISOString().slice(0, 10);
}

/** Stored dates may arrive as Date objects or strings; compare on the calendar day. */
function toDateString(value: unknown): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

interface FieldChecks {
  max: number;
  label: string;
}

const textLimits: Partial<Record<ImportField, FieldChecks>> = {
  employee_number: { max: 50, label: importFieldLabels.employee_number },
  full_name: { max: 150, label: importFieldLabels.full_name },
  email: { max: 254, label: importFieldLabels.email },
  job_title: { max: 100, label: importFieldLabels.job_title },
  gender: { max: 20, label: importFieldLabels.gender },
  phone: { max: 30, label: importFieldLabels.phone },
  address: { max: 2000, label: importFieldLabels.address },
  emergency_contact_name: { max: 150, label: importFieldLabels.emergency_contact_name },
  emergency_contact_phone: { max: 30, label: importFieldLabels.emergency_contact_phone },
};

/**
 * Validates and classifies every row against the current database state and
 * against the rest of the file.
 *
 * Nothing here writes: the result is the preview the admin confirms, and the
 * same classification is recomputed inside the import transaction.
 */
export function classifyRows(
  rows: string[][],
  mapping: ColumnMapping,
  context: ImportContext,
): RowResult[] {
  const results: RowResult[] = [];
  // First occurrence wins; later duplicates in the same file are the error.
  const seenNumbers = new Map<string, number>();
  const seenEmails = new Map<string, number>();
  const today = new Date().toISOString().slice(0, 10);

  rows.forEach((row, index) => {
    const rowNumber = index + 1;
    const raw = readRow(row, mapping);
    const issues: RowIssue[] = [];
    const error = (field: ImportField | null, message: string) =>
      issues.push({ field, level: "error", message });
    const warn = (field: ImportField | null, message: string) =>
      issues.push({ field, level: "warning", message });

    for (const field of requiredImportFields) {
      if (!raw[field]) error(field, `${importFieldLabels[field]} is required.`);
    }

    for (const [field, limit] of Object.entries(textLimits) as Array<[ImportField, FieldChecks]>) {
      const value = raw[field];
      if (value === undefined) continue;
      if (value.length > limit.max) {
        error(field, `${limit.label} must be ${limit.max} characters or fewer.`);
      } else if (hasControlCharacters(value)) {
        error(field, `${limit.label} contains control characters.`);
      }
    }

    const email = raw.email ? normalizeEmail(raw.email) : "";
    if (raw.email && !emailPattern.test(raw.email)) {
      error("email", "Email is not a valid address.");
    }

    for (const field of ["phone", "emergency_contact_phone"] as const) {
      const value = raw[field];
      if (value && (!phonePattern.test(value) || !/\d/.test(value))) {
        error(field, `${importFieldLabels[field]} is not a valid phone number.`);
      }
    }

    let departmentId: number | null = null;
    if (raw.department) {
      const match = context.departments.get(normalizeKey(raw.department));
      if (!match) {
        error("department", `Department "${raw.department}" does not exist. Create it first, then re-import.`);
      } else {
        departmentId = match.id;
        if (match.name !== raw.department) {
          warn("department", `Matched existing department "${match.name}".`);
        }
      }
    }

    let status: EmploymentStatus = "active";
    if (raw.employment_status) {
      const resolved = statusSynonyms[normalizeKey(raw.employment_status)];
      if (!resolved) {
        error(
          "employment_status",
          `Employment status "${raw.employment_status}" is not recognised. Use one of: ${employmentStatuses.join(", ")}.`,
        );
      } else {
        status = resolved;
      }
    }

    const dates: Partial<Record<"employment_date" | "date_of_birth", string | null>> = {};
    for (const field of ["employment_date", "date_of_birth"] as const) {
      const value = raw[field];
      if (!value) {
        dates[field] = null;
        continue;
      }
      const parsed = parseImportDate(value);
      if (!parsed) {
        error(field, `${importFieldLabels[field]} "${value}" is not a valid date. Use YYYY-MM-DD or DD/MM/YYYY.`);
        continue;
      }
      dates[field] = parsed;
    }

    if (dates.date_of_birth) {
      if (dates.date_of_birth > today) {
        error("date_of_birth", "Date of birth is in the future.");
      } else if (dates.date_of_birth > `${Number(today.slice(0, 4)) - 16}${today.slice(4)}`) {
        warn("date_of_birth", "Employee appears to be under 16 years old.");
      }
    }
    if (dates.employment_date && dates.employment_date > today) {
      warn("employment_date", "Employment date is in the future.");
    }

    // Opening balances are what the employee has left in the system being
    // migrated from, so they become carry-forward rather than a fresh grant.
    const openingDays: Record<string, number | null> = {
      opening_annual_days: null, opening_medical_days: null, opening_emergency_days: null,
    };
    for (const field of ["opening_annual_days", "opening_medical_days", "opening_emergency_days"] as const) {
      const value = raw[field];
      if (value === undefined) continue;
      const parsed = Number(value);
      if (!/^\d+(\.\d+)?$/.test(value) || !Number.isFinite(parsed) || parsed < 0 || parsed > 366) {
        error(field, `${importFieldLabels[field]} must be a number of days from 0 to 366.`);
        continue;
      }
      openingDays[field] = Math.round(parsed * 10) / 10;
    }

    // Duplicates inside the file itself, before comparing against the database.
    const numberKey = raw.employee_number ? normalizeKey(raw.employee_number) : "";
    if (numberKey) {
      const first = seenNumbers.get(numberKey);
      if (first !== undefined) {
        error("employee_number", `Employee number is repeated; it first appears on row ${first}.`);
      } else {
        seenNumbers.set(numberKey, rowNumber);
      }
    }
    if (email) {
      const first = seenEmails.get(email);
      if (first !== undefined) {
        error("email", `Email is repeated; it first appears on row ${first}.`);
      } else {
        seenEmails.set(email, rowNumber);
      }
    }

    const existing = numberKey ? context.employeesByNumber.get(numberKey) : undefined;

    if (issues.some((issue) => issue.level === "error")) {
      results.push({ rowNumber, classification: "invalid", issues, values: null, employeeId: null, changedFields: [] });
      return;
    }

    // The email must not already belong to a different person's account. This is
    // the case the normalized unique index enforces at the database level.
    // For a new employee any existing account holding the email is a conflict; for
    // an existing one, only an account that is not their own. Comparing against a
    // null employee link would let a standalone admin's address through.
    const account = context.accountsByEmail.get(email);
    if (account && (existing ? account.employeeId !== existing.id : true)) {
      issues.push({
        field: "email",
        level: "error",
        message: account.employeeId === null
          ? "This email already belongs to an administrator account."
          : "This email already belongs to a different employee.",
      });
      results.push({ rowNumber, classification: "conflict", issues, values: null, employeeId: existing?.id ?? null, changedFields: [] });
      return;
    }

    const values: EmployeeValues = {
      employee_number: raw.employee_number!.trim(),
      full_name: raw.full_name!.trim(),
      email: raw.email!.trim(),
      department_id: departmentId!,
      job_title: raw.job_title ?? null,
      employment_status: status,
      employment_date: dates.employment_date ?? null,
      date_of_birth: dates.date_of_birth ?? null,
      gender: raw.gender ?? null,
      phone: raw.phone ?? null,
      address: raw.address ?? null,
      emergency_contact_name: raw.emergency_contact_name ?? null,
      emergency_contact_phone: raw.emergency_contact_phone ?? null,
      opening_annual_days: openingDays.opening_annual_days ?? null,
      opening_medical_days: openingDays.opening_medical_days ?? null,
      opening_emergency_days: openingDays.opening_emergency_days ?? null,
    };

    if (!existing) {
      results.push({ rowNumber, classification: "new", issues, values, employeeId: null, changedFields: [] });
      return;
    }

    // Only mapped columns are compared, so an import that omits a column never
    // looks like it is clearing that column.
    const changedFields: ImportField[] = [];
    const compare = (field: ImportField, incoming: string | null, current: string | null) => {
      if (mapping[field] === undefined) return;
      if ((incoming ?? "") !== (current ?? "")) changedFields.push(field);
    };

    compare("full_name", values.full_name, existing.full_name);
    compare("job_title", values.job_title, existing.job_title);
    compare("employment_status", values.employment_status, existing.employment_status);
    compare("gender", values.gender, existing.gender);
    compare("phone", values.phone, existing.phone);
    compare("address", values.address, existing.address);
    compare("emergency_contact_name", values.emergency_contact_name, existing.emergency_contact_name);
    compare("emergency_contact_phone", values.emergency_contact_phone, existing.emergency_contact_phone);
    compare("employment_date", values.employment_date, toDateString(existing.employment_date));
    compare("date_of_birth", values.date_of_birth, toDateString(existing.date_of_birth));
    if (mapping.department !== undefined && values.department_id !== existing.department_id) {
      changedFields.push("department");
    }
    if (mapping.email !== undefined && normalizeEmail(values.email) !== normalizeEmail(existing.email ?? "")) {
      changedFields.push("email");
    }

    results.push({
      rowNumber,
      classification: changedFields.length > 0 ? "update" : "unchanged",
      issues,
      values,
      employeeId: existing.id,
      changedFields,
    });
  });

  return results;
}

export interface ImportSummary {
  total: number;
  new: number;
  update: number;
  unchanged: number;
  conflict: number;
  invalid: number;
  warnings: number;
}

export function summarize(results: RowResult[]): ImportSummary {
  const summary: ImportSummary = {
    total: results.length, new: 0, update: 0, unchanged: 0, conflict: 0, invalid: 0, warnings: 0,
  };
  for (const result of results) {
    summary[result.classification] += 1;
    if (result.issues.some((issue) => issue.level === "warning")) summary.warnings += 1;
  }
  return summary;
}
