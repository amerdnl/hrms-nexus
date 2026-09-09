/**
 * Column mapping for workforce imports.
 *
 * Companies should not have to rename spreadsheet columns before importing, so
 * headers are matched against known aliases. Automatic mapping is a suggestion
 * only: the admin confirms or corrects it before anything is validated.
 */

export const importFields = [
  "employee_number",
  "full_name",
  "email",
  "department",
  "job_title",
  "employment_status",
  "employment_date",
  "date_of_birth",
  "gender",
  "phone",
  "address",
  "emergency_contact_name",
  "emergency_contact_phone",
  "opening_annual_days",
  "opening_medical_days",
  "opening_emergency_days",
] as const;

export type ImportField = (typeof importFields)[number];

/** Fields a row cannot be imported without. */
export const requiredImportFields: readonly ImportField[] = [
  "employee_number",
  "full_name",
  "email",
  "department",
];

export const importFieldLabels: Record<ImportField, string> = {
  employee_number: "Employee number",
  full_name: "Full name",
  email: "Email",
  department: "Department",
  job_title: "Job title",
  employment_status: "Employment status",
  employment_date: "Employment date",
  date_of_birth: "Date of birth",
  gender: "Gender",
  phone: "Phone",
  address: "Address",
  emergency_contact_name: "Emergency contact name",
  emergency_contact_phone: "Emergency contact phone",
  opening_annual_days: "Opening annual leave balance",
  opening_medical_days: "Opening medical leave balance",
  opening_emergency_days: "Opening emergency leave balance",
};

/**
 * Accepted spreadsheet headings per field. Compared after normalisation, so
 * case, punctuation and spacing differences do not need their own entries.
 */
const aliases: Record<ImportField, string[]> = {
  employee_number: [
    "employee number", "employee no", "employee id", "employee code",
    "staff id", "staff no", "staff number", "staff code", "emp id", "emp no", "id",
    "payroll number", "payroll id", "worker id",
  ],
  full_name: [
    "full name", "employee name", "staff name", "name", "worker name",
    "complete name", "legal name",
  ],
  email: [
    "email", "email address", "work email", "company email", "e mail",
    "official email", "business email",
  ],
  department: [
    "department", "dept", "division", "unit", "business unit", "team",
    "department name", "section",
  ],
  job_title: [
    "job title", "position", "role", "designation", "title", "job position",
    "job role", "occupation",
  ],
  employment_status: [
    "employment status", "status", "employee status", "staff status",
    "employment type", "work status",
  ],
  employment_date: [
    "employment date", "date joined", "join date", "joining date", "hire date",
    "date of hire", "start date", "commencement date", "date employed",
  ],
  date_of_birth: [
    "date of birth", "dob", "birth date", "birthdate", "born",
  ],
  gender: ["gender", "sex"],
  phone: [
    "phone", "phone number", "mobile", "mobile number", "contact number",
    "contact no", "telephone", "tel", "handphone", "hp",
  ],
  address: ["address", "home address", "residential address", "mailing address"],
  emergency_contact_name: [
    "emergency contact name", "emergency contact", "emergency name",
    "next of kin", "next of kin name", "kin name",
  ],
  emergency_contact_phone: [
    "emergency contact phone", "emergency contact number", "emergency phone",
    "emergency number", "next of kin phone", "next of kin contact", "kin phone",
  ],
  // Days already available to the employee in the system being migrated from.
  opening_annual_days: [
    "opening annual leave balance", "annual leave balance", "annual leave brought forward",
    "annual balance", "al balance", "annual leave remaining", "opening annual",
  ],
  opening_medical_days: [
    "opening medical leave balance", "medical leave balance", "medical balance",
    "sick leave balance", "ml balance", "medical leave remaining", "opening medical",
  ],
  opening_emergency_days: [
    "opening emergency leave balance", "emergency leave balance", "emergency balance",
    "el balance", "emergency leave remaining", "opening emergency",
  ],
};

/**
 * Passwords are deliberately not importable. Every new account gets a generated
 * temporary password returned once at confirmation, so no plaintext credential
 * is ever parsed from a spreadsheet or written to the import history.
 */
export const rejectedPasswordHeaders = [
  "password", "temporary password", "temp password", "initial password",
  "default password", "passcode", "pin",
].map((header) => header.replace(/\s+/g, " "));

/** Lower-cased, punctuation-free, single-spaced, so "Staff-ID" matches "staff id". */
export function normalizeHeader(header: string): string {
  return header
    .toLowerCase()
    .replace(/[_\-.()[\]/\\]+/g, " ")
    .replace(/[^a-z0-9 ]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

const aliasLookup = new Map<string, ImportField>();
for (const field of importFields) {
  // The canonical name is always accepted, alongside its aliases.
  aliasLookup.set(normalizeHeader(field), field);
  for (const alias of aliases[field]) aliasLookup.set(normalizeHeader(alias), field);
}

/** A mapping is column index -> field; unmapped columns are simply absent. */
export type ColumnMapping = Partial<Record<ImportField, number>>;

export interface MappingSuggestion {
  mapping: ColumnMapping;
  /** Headers that matched no known field, reported so nothing looks silently dropped. */
  unmatchedHeaders: string[];
  /** Fields whose alias matched more than one column; the admin must choose. */
  ambiguousFields: ImportField[];
  /** Credential-looking columns, ignored on purpose rather than merely unmatched. */
  ignoredPasswordHeaders: string[];
  /** Their column indexes, so their cells can be redacted before being stored. */
  ignoredPasswordColumns: number[];
}

/** Blanks credential columns so a spreadsheet password is never persisted. */
export function redactColumns(rows: string[][], columns: number[]): string[][] {
  if (columns.length === 0) return rows;
  const redacted = new Set(columns);
  return rows.map((row) => row.map((value, index) => (redacted.has(index) ? "" : value)));
}

export function suggestMapping(headers: string[]): MappingSuggestion {
  const mapping: ColumnMapping = {};
  const matchCounts = new Map<ImportField, number>();
  const unmatchedHeaders: string[] = [];
  const ignoredPasswordHeaders: string[] = [];
  const ignoredPasswordColumns: number[] = [];

  headers.forEach((header, index) => {
    const normalized = normalizeHeader(header);
    if (!normalized) return;

    if (rejectedPasswordHeaders.includes(normalized)) {
      ignoredPasswordHeaders.push(header);
      ignoredPasswordColumns.push(index);
      return;
    }

    const field = aliasLookup.get(normalized);
    if (!field) {
      unmatchedHeaders.push(header);
      return;
    }

    matchCounts.set(field, (matchCounts.get(field) ?? 0) + 1);
    // First match wins; a duplicate is surfaced as ambiguous rather than guessed at.
    if (mapping[field] === undefined) mapping[field] = index;
  });

  const ambiguousFields = [...matchCounts.entries()]
    .filter(([, count]) => count > 1)
    .map(([field]) => field);

  return {
    mapping, unmatchedHeaders, ambiguousFields,
    ignoredPasswordHeaders, ignoredPasswordColumns,
  };
}

export interface MappingValidation {
  valid: boolean;
  errors: string[];
}

/** Checks a mapping the admin submitted against the file it belongs to. */
export function validateMapping(
  mapping: unknown,
  columnCount: number,
): { valid: true; mapping: ColumnMapping } | { valid: false; errors: string[] } {
  if (!mapping || typeof mapping !== "object" || Array.isArray(mapping)) {
    return { valid: false, errors: ["Send a column mapping object."] };
  }

  const value = mapping as Record<string, unknown>;
  const errors: string[] = [];
  const result: ColumnMapping = {};
  const used = new Map<number, ImportField>();

  for (const [key, column] of Object.entries(value)) {
    if (!importFields.includes(key as ImportField)) {
      errors.push(`Unknown field in mapping: ${key}.`);
      continue;
    }
    if (column === null || column === undefined || column === "") continue;

    const index = typeof column === "number" ? column : Number(column);
    if (!Number.isSafeInteger(index) || index < 0 || index >= columnCount) {
      errors.push(`${importFieldLabels[key as ImportField]} is mapped to a column that does not exist.`);
      continue;
    }

    const already = used.get(index);
    if (already) {
      errors.push(
        `Column ${index + 1} is mapped to both ${importFieldLabels[already]} and ${importFieldLabels[key as ImportField]}.`,
      );
      continue;
    }

    used.set(index, key as ImportField);
    result[key as ImportField] = index;
  }

  for (const field of requiredImportFields) {
    if (result[field] === undefined) {
      errors.push(`${importFieldLabels[field]} must be mapped to a column.`);
    }
  }

  if (errors.length > 0) return { valid: false, errors };
  return { valid: true, mapping: result };
}

/** Pulls one row's mapped values out by column position. */
export function readRow(row: string[], mapping: ColumnMapping): Partial<Record<ImportField, string>> {
  const values: Partial<Record<ImportField, string>> = {};
  for (const field of importFields) {
    const index = mapping[field];
    if (index === undefined) continue;
    const value = (row[index] ?? "").trim();
    if (value !== "") values[field] = value;
  }
  return values;
}
