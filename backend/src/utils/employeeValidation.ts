// Server-side employee contract. The frontend forms are convenience only; every
// bound, type, date and status below is enforced here regardless of the client.

export const employmentStatuses = [
  "active",
  "probation",
  "inactive",
  "resigned",
  "terminated",
] as const;

export type EmploymentStatus = (typeof employmentStatuses)[number];

// Statuses that keep a linked sign-in usable. findSessionUserById enforces the
// same set, so account activity stays derivable from employment status alone.
export const eligibleEmploymentStatuses: readonly EmploymentStatus[] = [
  "active",
  "probation",
];

export function isEmployeeAccountActive(status: string): boolean {
  return eligibleEmploymentStatuses.includes(status as EmploymentStatus);
}

// bcrypt silently ignores bytes past 72, so a longer password would not be the
// password that is actually checked at login.
const PASSWORD_MIN = 8;
const PASSWORD_MAX_BYTES = 72;

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const phonePattern = /^\+?[\d ().-]+$/;
const datePattern = /^\d{4}-\d{2}-\d{2}$/;

type Errors = Record<string, string>;

export interface EmployeeFieldValues {
  employee_number?: string;
  full_name?: string;
  email?: string;
  temporary_password?: string;
  phone?: string | null;
  address?: string | null;
  date_of_birth?: string | null;
  gender?: string | null;
  emergency_contact_name?: string | null;
  emergency_contact_phone?: string | null;
  job_title?: string | null;
  department_id?: number;
  employment_date?: string | null;
  employment_status?: EmploymentStatus;
  /** Direct manager's employee id; null clears it, absent leaves it unchanged. */
  manager_id?: number | null;
}

export type ValidationResult =
  | { valid: true; data: EmployeeFieldValues }
  | { valid: false; errors: Errors };

const createFields = [
  "employee_number", "full_name", "email", "temporary_password", "phone", "address",
  "date_of_birth", "gender", "emergency_contact_name", "emergency_contact_phone",
  "job_title", "department_id", "employment_date", "employment_status",
  "manager_id",
];

// employee_number and temporary_password are deliberately absent: the business
// identifier is immutable after creation and passwords use the password workflow.
const updateFields = [
  "full_name", "email", "phone", "address", "date_of_birth", "gender",
  "emergency_contact_name", "emergency_contact_phone", "job_title",
  "department_id", "employment_date", "employment_status", "manager_id",
];

function hasControlCharacters(value: string): boolean {
  return [...value].some((character) => {
    const code = character.charCodeAt(0);
    return (code < 32 && ![9, 10, 13].includes(code)) || code === 127;
  });
}

/** A real calendar date in `YYYY-MM-DD`, rejecting values like 2026-02-31. */
function parseCalendarDate(value: string): string | null {
  if (!datePattern.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10) === value ? value : null;
}

function shiftYears(isoDate: string, years: number): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCFullYear(date.getUTCFullYear() + years);
  return date.toISOString().slice(0, 10);
}

/**
 * Shared field reader.
 *
 * Absent means "leave unchanged" so a partial client cannot silently wipe data it
 * never displayed; `null` and `""` are the explicit clear. Required fields must be
 * present and non-empty in both modes.
 */
function readFields(
  input: unknown,
  mode: "create" | "update",
): ValidationResult {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { valid: false, errors: { _form: "Send an employee object." } };
  }

  const value = input as Record<string, unknown>;
  const allowed = mode === "create" ? createFields : updateFields;
  const errors: Errors = {};
  const data: EmployeeFieldValues = {};

  // An unsupported field must not return success while being ignored.
  const unsupported = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unsupported.length > 0) {
    errors._form = `The request contains unsupported fields: ${unsupported.sort().join(", ")}.`;
  }

  const supplied = (field: string) => Object.hasOwn(value, field);

  /** Required, non-empty, bounded text. */
  function requiredText(field: string, max: number): string | undefined {
    if (!supplied(field)) {
      errors[field] = "This field is required.";
      return undefined;
    }
    const raw = value[field];
    if (typeof raw !== "string") {
      errors[field] = "Enter text.";
      return undefined;
    }
    const cleaned = raw.trim();
    if (!cleaned || cleaned.length > max || hasControlCharacters(cleaned)) {
      errors[field] = `Enter 1–${max} characters without control characters.`;
      return undefined;
    }
    return cleaned;
  }

  /** Optional, clearable, bounded text. Returns undefined when unchanged. */
  function optionalText(field: string, max: number): string | null | undefined {
    if (!supplied(field)) return undefined;
    const raw = value[field];
    if (raw === null) return null;
    if (typeof raw !== "string") {
      errors[field] = "Enter text, or null to clear this field.";
      return undefined;
    }
    const cleaned = raw.trim();
    if (!cleaned) return null;
    if (cleaned.length > max || hasControlCharacters(cleaned)) {
      errors[field] = `Enter up to ${max} characters without control characters.`;
      return undefined;
    }
    return cleaned;
  }

  function optionalDate(
    field: string,
    label: string,
    earliest: string,
    latest: string,
  ): string | null | undefined {
    const raw = optionalText(field, 10);
    if (raw === undefined || raw === null) return raw;
    const parsed = parseCalendarDate(raw);
    if (!parsed) {
      errors[field] = "Enter a real date in YYYY-MM-DD format.";
      return undefined;
    }
    if (parsed < earliest || parsed > latest) {
      errors[field] = label;
      return undefined;
    }
    return parsed;
  }

  if (mode === "create") {
    const employeeNumber = requiredText("employee_number", 50);
    if (employeeNumber !== undefined) data.employee_number = employeeNumber;

    if (!supplied("temporary_password")) {
      errors.temporary_password = "This field is required.";
    } else if (typeof value.temporary_password !== "string") {
      errors.temporary_password = "Enter a password.";
    } else {
      const password = value.temporary_password;
      if (
        password.length < PASSWORD_MIN ||
        Buffer.byteLength(password, "utf8") > PASSWORD_MAX_BYTES ||
        password.trim().length === 0
      ) {
        errors.temporary_password = `Enter a password of at least ${PASSWORD_MIN} characters and at most ${PASSWORD_MAX_BYTES} bytes.`;
      } else {
        data.temporary_password = password;
      }
    }
  }

  const fullName = requiredText("full_name", 150);
  if (fullName !== undefined) data.full_name = fullName;

  // Optional on update so an unchanged email can be omitted, as the edit form does.
  if (mode === "create" || supplied("email")) {
    const email = requiredText("email", 254);
    if (email !== undefined) {
      if (!emailPattern.test(email)) {
        errors.email = "Enter a valid email address.";
      } else {
        data.email = email;
      }
    }
  }

  for (const [field, max] of [
    ["phone", 30],
    ["emergency_contact_phone", 30],
  ] as const) {
    const phone = optionalText(field, max);
    if (phone === undefined) continue;
    if (phone !== null && (!phonePattern.test(phone) || !/\d/.test(phone))) {
      errors[field] = "Enter a phone number using digits, spaces, +, (), dots or hyphens.";
      continue;
    }
    data[field] = phone;
  }

  for (const [field, max] of [
    ["address", 2000],
    ["gender", 20],
    ["emergency_contact_name", 150],
    ["job_title", 100],
  ] as const) {
    const text = optionalText(field, max);
    if (text !== undefined) data[field] = text;
  }

  const today = new Date().toISOString().slice(0, 10);
  const birth = optionalDate(
    "date_of_birth",
    "Enter a date of birth between 1900-01-01 and today.",
    "1900-01-01",
    today,
  );
  if (birth !== undefined) data.date_of_birth = birth;

  const employmentDate = optionalDate(
    "employment_date",
    "Enter an employment date between 1900-01-01 and five years from today.",
    "1900-01-01",
    shiftYears(today, 5),
  );
  if (employmentDate !== undefined) data.employment_date = employmentDate;

  // Department assignment is required by both create and update so headcounts,
  // department filters and reports cannot silently lose an employee.
  if (!supplied("department_id")) {
    errors.department_id = "Select a department.";
  } else {
    const raw = value.department_id;
    const parsed =
      typeof raw === "number"
        ? raw
        : typeof raw === "string" && /^\d+$/.test(raw.trim())
          ? Number(raw.trim())
          : Number.NaN;
    if (!Number.isSafeInteger(parsed) || parsed <= 0) {
      errors.department_id = "Select a department.";
    } else {
      data.department_id = parsed;
    }
  }

  // Optional in both modes: absent leaves the reporting line alone, null clears
  // it. Whether the manager exists, is employed and would not create a loop is
  // decided against the database by the controller and the 0010 trigger.
  if (supplied("manager_id")) {
    const raw = value.manager_id;
    if (raw === null || raw === "") {
      data.manager_id = null;
    } else {
      const parsed =
        typeof raw === "number"
          ? raw
          : typeof raw === "string" && /^\d+$/.test(raw.trim())
            ? Number(raw.trim())
            : Number.NaN;
      if (!Number.isSafeInteger(parsed) || parsed <= 0) {
        errors.manager_id = "Choose a manager from the list, or none.";
      } else {
        data.manager_id = parsed;
      }
    }
  }

  if (supplied("employment_status")) {
    const status = value.employment_status;
    if (typeof status !== "string" || !employmentStatuses.includes(status as EmploymentStatus)) {
      errors.employment_status = `Employment status must be one of: ${employmentStatuses.join(", ")}.`;
    } else {
      data.employment_status = status as EmploymentStatus;
    }
  } else if (mode === "create") {
    data.employment_status = "active";
  } else {
    errors.employment_status = "Select an employment status.";
  }

  if (Object.keys(errors).length > 0) return { valid: false, errors };
  return { valid: true, data };
}

export const validateEmployeeCreate = (input: unknown) => readFields(input, "create");
export const validateEmployeeUpdate = (input: unknown) => readFields(input, "update");

/** Route identifiers must be positive integers before they reach SQL. */
export function parseIdParam(value: unknown): number | null {
  if (typeof value !== "string" || !/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

export interface ListQuery {
  search: string | null;
  departmentId: number | null;
  departmentName: string | null;
  employmentStatus: EmploymentStatus | null;
  jobTitle: string | null;
  page: number;
  pageSize: number;
  paginated: boolean;
}

export const MAX_PAGE_SIZE = 100;
const DEFAULT_PAGE_SIZE = 25;

/**
 * Employee list query contract.
 *
 * Pagination is opt-in: callers that need a complete set (the attendance
 * directory, department membership) keep working unchanged, and the list page
 * asks for a bounded page explicitly.
 */
export function parseEmployeeListQuery(
  query: Record<string, unknown>,
): { valid: true; data: ListQuery } | { valid: false; errors: Errors } {
  const errors: Errors = {};

  function text(field: string, max: number): string | null {
    const raw = query[field];
    if (raw === undefined || raw === "") return null;
    if (typeof raw !== "string" || raw.length > max || hasControlCharacters(raw)) {
      errors[field] = `Enter up to ${max} characters without control characters.`;
      return null;
    }
    const cleaned = raw.trim();
    return cleaned || null;
  }

  const search = text("search", 150);
  const jobTitle = text("job_title", 100);

  let departmentId: number | null = null;
  let departmentName: string | null = null;
  const department = query.department;
  if (department !== undefined && department !== "") {
    if (typeof department !== "string" && typeof department !== "number") {
      errors.department = "Select a department.";
    } else {
      const raw = String(department).trim();
      if (/^\d+$/.test(raw)) {
        const parsed = Number(raw);
        if (!Number.isSafeInteger(parsed) || parsed <= 0) {
          errors.department = "Select a department.";
        } else {
          departmentId = parsed;
        }
      } else if (raw.length > 100 || hasControlCharacters(raw)) {
        errors.department = "Enter up to 100 characters without control characters.";
      } else {
        departmentName = raw;
      }
    }
  }

  let employmentStatus: EmploymentStatus | null = null;
  const status = query.employment_status;
  if (status !== undefined && status !== "") {
    if (typeof status !== "string" || !employmentStatuses.includes(status as EmploymentStatus)) {
      errors.employment_status = `Employment status must be one of: ${employmentStatuses.join(", ")}.`;
    } else {
      employmentStatus = status as EmploymentStatus;
    }
  }

  function positiveInteger(field: string, max: number, fallback: number): number {
    const raw = query[field];
    if (raw === undefined || raw === "") return fallback;
    const parsed =
      typeof raw === "number"
        ? raw
        : typeof raw === "string" && /^\d+$/.test(raw.trim())
          ? Number(raw.trim())
          : Number.NaN;
    if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > max) {
      errors[field] = `Enter a whole number from 1 to ${max}.`;
      return fallback;
    }
    return parsed;
  }

  const page = positiveInteger("page", 1_000_000, 1);
  const pageSize = positiveInteger("page_size", MAX_PAGE_SIZE, DEFAULT_PAGE_SIZE);
  const paginated = query.page !== undefined || query.page_size !== undefined;

  if (Object.keys(errors).length > 0) return { valid: false, errors };
  return {
    valid: true,
    data: { search, departmentId, departmentName, employmentStatus, jobTitle, page, pageSize, paginated },
  };
}
