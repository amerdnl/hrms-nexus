import assert from "node:assert/strict";
import { test } from "node:test";
import ExcelJS from "exceljs";
import {
  MAX_IMPORT_ROWS,
  SpreadsheetError,
  parseCsv,
  readSpreadsheet,
} from "../src/utils/spreadsheet.js";
import {
  normalizeHeader,
  redactColumns,
  suggestMapping,
  validateMapping,
  readRow,
} from "../src/utils/importMapping.js";
import {
  classifyRows,
  summarize,
  type ExistingEmployee,
  type ImportContext,
} from "../src/utils/importValidation.js";

// ---------------------------------------------------------------- CSV parsing

test("CSV parser handles quotes, embedded separators and both line endings", () => {
  const csv = 'a,b,c\r\n1,"two, with comma",3\n4,"line\nbreak","say ""hi"""\r\n';
  assert.deepEqual(parseCsv(csv), [
    ["a", "b", "c"],
    ["1", "two, with comma", "3"],
    ["4", "line\nbreak", 'say "hi"'],
  ]);
});

test("CSV parser strips a byte order mark and keeps a final unterminated row", () => {
  assert.deepEqual(parseCsv("﻿name,email\nAisyah,a@example.invalid"), [
    ["name", "email"],
    ["Aisyah", "a@example.invalid"],
  ]);
});

test("CSV parser preserves empty fields and rejects an unclosed quote", () => {
  assert.deepEqual(parseCsv("a,,c"), [["a", "", "c"]]);
  assert.throws(() => parseCsv('a,"unclosed'), SpreadsheetError);
});

test("readSpreadsheet rejects empty, header-only and oversized files", async () => {
  const cases: Array<[string, RegExp]> = [
    ["", /empty or has no header row/i],
    ["employee number,full name\n", /no data rows/i],
    ["\n\n", /empty or has no header row/i],
  ];
  for (const [content, expected] of cases) {
    await assert.rejects(
      readSpreadsheet(Buffer.from(content), "staff.csv"),
      (error: Error) => expected.test(error.message),
      content,
    );
  }

  const tooMany = ["number", ...Array.from({ length: MAX_IMPORT_ROWS + 1 }, (_, i) => `E${i}`)].join("\n");
  await assert.rejects(readSpreadsheet(Buffer.from(tooMany), "staff.csv"), /limit is/i);
});

test("readSpreadsheet drops blank lines and pads short rows", async () => {
  const sheet = await readSpreadsheet(
    Buffer.from("Staff ID,Name,Dept\n\nE1,Aisyah,Engineering\nE2,Daniel\n"),
    "staff.csv",
  );
  assert.deepEqual(sheet.headers, ["Staff ID", "Name", "Dept"]);
  assert.deepEqual(sheet.rows, [
    ["E1", "Aisyah", "Engineering"],
    ["E2", "Daniel", ""],
  ]);
});

test("readSpreadsheet reads a real XLSX workbook, including dates and formulas", async () => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Staff");
  sheet.addRow(["Staff ID", "Employee Name", "Date Joined", "Division"]);
  sheet.addRow(["E1", "Aisyah Rahman", new Date(Date.UTC(2024, 2, 1)), "Engineering"]);
  sheet.addRow(["E2", { formula: "CONCATENATE(\"Daniel\",\" Tan\")", result: "Daniel Tan" }, "2023-11-15", "Finance"]);
  const buffer = Buffer.from(await workbook.xlsx.writeBuffer());

  const parsed = await readSpreadsheet(buffer, "staff.xlsx");
  assert.deepEqual(parsed.headers, ["Staff ID", "Employee Name", "Date Joined", "Division"]);
  assert.deepEqual(parsed.rows[0], ["E1", "Aisyah Rahman", "2024-03-01", "Engineering"]);
  // A formula cell contributes its computed value, not its expression.
  assert.deepEqual(parsed.rows[1], ["E2", "Daniel Tan", "2023-11-15", "Finance"]);
});

test("a corrupt workbook is reported rather than thrown as an internal error", async () => {
  await assert.rejects(
    readSpreadsheet(Buffer.from("this is definitely not a workbook"), "staff.xlsx"),
    SpreadsheetError,
  );
});

// -------------------------------------------------------------- Column mapping

test("headers are normalized before matching", () => {
  assert.equal(normalizeHeader("  Staff-ID  "), "staff id");
  assert.equal(normalizeHeader("E-Mail_Address"), "e mail address");
  assert.equal(normalizeHeader("Dept."), "dept");
});

test("common spreadsheet headings map to canonical fields", () => {
  const { mapping, unmatchedHeaders, ambiguousFields } = suggestMapping([
    "Staff ID", "Employee Name", "Division", "Position", "Work Email",
    "Date Joined", "Handphone", "Next of Kin", "Cost Centre",
  ]);
  assert.equal(mapping.employee_number, 0);
  assert.equal(mapping.full_name, 1);
  assert.equal(mapping.department, 2);
  assert.equal(mapping.job_title, 3);
  assert.equal(mapping.email, 4);
  assert.equal(mapping.employment_date, 5);
  assert.equal(mapping.phone, 6);
  assert.equal(mapping.emergency_contact_name, 7);
  // An unknown column is reported, never silently ignored.
  assert.deepEqual(unmatchedHeaders, ["Cost Centre"]);
  assert.deepEqual(ambiguousFields, []);
});

test("two columns claiming one field are flagged instead of guessed", () => {
  const { mapping, ambiguousFields } = suggestMapping(["Email", "Work Email", "Staff ID"]);
  assert.deepEqual(ambiguousFields, ["email"]);
  // The first match still stands as the suggestion the admin can correct.
  assert.equal(mapping.email, 0);
});

test("credential columns are identified and their cells are blanked", () => {
  const suggestion = suggestMapping(["Staff ID", "Name", "Password", "PIN", "Email"]);
  assert.deepEqual(suggestion.ignoredPasswordHeaders, ["Password", "PIN"]);
  assert.deepEqual(suggestion.ignoredPasswordColumns, [2, 3]);
  // A credential column is never treated as merely unrecognised.
  assert.deepEqual(suggestion.unmatchedHeaders, []);

  const rows = [["E1", "Aisyah", "hunter2", "1234", "a@example.invalid"]];
  assert.deepEqual(redactColumns(rows, suggestion.ignoredPasswordColumns), [
    ["E1", "Aisyah", "", "", "a@example.invalid"],
  ]);
  // Redaction never rewrites rows when there is nothing to redact.
  assert.equal(redactColumns(rows, []), rows);
});

test("mapping validation rejects unusable mappings", () => {
  const complete = { employee_number: 0, full_name: 1, email: 2, department: 3 };
  assert.equal(validateMapping(complete, 4).valid, true);

  const cases: Array<[unknown, RegExp]> = [
    [{ ...complete, department: undefined }, /Department must be mapped/i],
    [{ employee_number: 0 }, /must be mapped/i],
    [{ ...complete, salary: 3 }, /Unknown field/i],
    [{ ...complete, job_title: 9 }, /column that does not exist/i],
    [{ ...complete, job_title: 0 }, /mapped to both/i],
    ["not an object", /mapping object/i],
  ];
  for (const [mapping, expected] of cases) {
    const result = validateMapping(mapping, 4);
    assert.equal(result.valid, false, JSON.stringify(mapping));
    if (!result.valid) assert.ok(result.errors.some((e) => expected.test(e)), result.errors.join("|"));
  }
});

test("readRow extracts only mapped columns and treats blanks as absent", () => {
  const values = readRow(["E1", "  ", "Engineering"], { employee_number: 0, full_name: 1, department: 2 });
  assert.deepEqual(values, { employee_number: "E1", department: "Engineering" });
});

// ------------------------------------------------------ Validation and upsert

const baseMapping = {
  employee_number: 0, full_name: 1, email: 2, department: 3,
  job_title: 4, employment_status: 5, employment_date: 6,
};

function existing(overrides: Partial<ExistingEmployee> = {}): ExistingEmployee {
  return {
    id: 10, employee_number: "E1", full_name: "Aisyah Rahman", job_title: "Software Engineer",
    department_id: 1, employment_status: "active", employment_date: "2024-03-01",
    date_of_birth: null, gender: null, phone: null, address: null,
    emergency_contact_name: null, emergency_contact_phone: null,
    user_id: 50, email: "aisyah@example.invalid",
    ...overrides,
  };
}

function context(overrides: Partial<ImportContext> = {}): ImportContext {
  return {
    departments: new Map([
      ["engineering", { id: 1, name: "Engineering" }],
      ["finance", { id: 2, name: "Finance" }],
    ]),
    employeesByNumber: new Map(),
    accountsByEmail: new Map(),
    ...overrides,
  };
}

const row = (...values: string[]) => values;

test("a clean row against an empty database is classified new", () => {
  const results = classifyRows(
    [row("E1", "Aisyah Rahman", "aisyah@example.invalid", "Engineering", "Software Engineer", "Active", "2024-03-01")],
    baseMapping,
    context(),
  );
  assert.equal(results[0]!.classification, "new");
  assert.deepEqual(results[0]!.issues, []);
  assert.equal(results[0]!.values?.department_id, 1);
  assert.equal(results[0]!.values?.employment_status, "active");
  assert.equal(results[0]!.values?.employment_date, "2024-03-01");
});

test("missing required fields and bad formats mark a row invalid", () => {
  const results = classifyRows(
    [
      row("", "Aisyah", "aisyah@example.invalid", "Engineering", "", "", ""),
      row("E2", "", "aisyah@example.invalid", "Engineering", "", "", ""),
      row("E3", "Daniel", "not-an-email", "Engineering", "", "", ""),
      row("E4", "Farah", "farah@example.invalid", "Nonexistent", "", "", ""),
      row("E5", "Kumar", "kumar@example.invalid", "Engineering", "", "Astronaut", ""),
      row("E6", "Mei", "mei@example.invalid", "Engineering", "", "", "2026-02-31"),
      row("E7", "Nurul", "nurul@example.invalid", "Engineering", "", "", "not-a-date"),
    ],
    baseMapping,
    context(),
  );
  assert.deepEqual(results.map((r) => r.classification), Array(7).fill("invalid"));
  assert.match(results[0]!.issues[0]!.message, /Employee number is required/i);
  assert.match(results[3]!.issues[0]!.message, /Department "Nonexistent" does not exist/i);
  assert.match(results[4]!.issues[0]!.message, /not recognised/i);
  assert.match(results[5]!.issues[0]!.message, /not a valid date/i);
});

test("employment status synonyms resolve to the supported lifecycle set", () => {
  const cases: Array<[string, string]> = [
    ["Active", "active"], ["PERMANENT", "active"], ["Full Time", "active"],
    ["Probation", "probation"], ["Intern", "probation"],
    ["Resigned", "resigned"], ["Terminated", "terminated"], ["Suspended", "inactive"],
  ];
  for (const [input, expected] of cases) {
    const results = classifyRows(
      [row("E1", "Aisyah", "a@example.invalid", "Engineering", "", input, "")],
      baseMapping,
      context(),
    );
    assert.equal(results[0]!.values?.employment_status, expected, input);
  }
});

test("dates accept ISO and day-first forms and reject impossible days", () => {
  const parse = (value: string) =>
    classifyRows([row("E1", "A", "a@example.invalid", "Engineering", "", "", value)], baseMapping, context())[0]!;

  assert.equal(parse("2024-03-01").values?.employment_date, "2024-03-01");
  // Day-first is the documented interpretation of an ambiguous slash date.
  assert.equal(parse("03/04/2024").values?.employment_date, "2024-04-03");
  assert.equal(parse("3-4-2024").values?.employment_date, "2024-04-03");
  assert.equal(parse("31/02/2024").classification, "invalid");
  assert.equal(parse("2024/03/01").classification, "invalid");
});

test("duplicates inside one file are refused, pointing at the first occurrence", () => {
  const results = classifyRows(
    [
      row("E1", "Aisyah", "aisyah@example.invalid", "Engineering", "", "", ""),
      row("E1", "Aisyah Again", "other@example.invalid", "Engineering", "", "", ""),
      row("E9", "Someone", "AISYAH@example.invalid", "Engineering", "", "", ""),
    ],
    baseMapping,
    context(),
  );
  assert.equal(results[0]!.classification, "new");
  assert.equal(results[1]!.classification, "invalid");
  assert.match(results[1]!.issues[0]!.message, /repeated; it first appears on row 1/i);
  // Case-different repeats are the same identity, matching the database index.
  assert.equal(results[2]!.classification, "invalid");
  assert.match(results[2]!.issues[0]!.message, /repeated; it first appears on row 1/i);
});

test("an email owned by someone else is a conflict, not an overwrite", () => {
  const shared = context({
    employeesByNumber: new Map([["e1", existing()]]),
    accountsByEmail: new Map([
      ["aisyah@example.invalid", { userId: 50, employeeId: 10 }],
      ["admin@example.invalid", { userId: 1, employeeId: null }],
      ["daniel@example.invalid", { userId: 51, employeeId: 11 }],
    ]),
  });

  const results = classifyRows(
    [
      row("E1", "Aisyah Rahman", "daniel@example.invalid", "Engineering", "Software Engineer", "Active", "2024-03-01"),
      row("E2", "New Person", "admin@example.invalid", "Engineering", "", "", ""),
      row("E1", "Aisyah Rahman", "AISYAH@EXAMPLE.INVALID", "Engineering", "Software Engineer", "Active", "2024-03-01"),
    ],
    baseMapping,
    shared,
  );

  assert.equal(results[0]!.classification, "conflict");
  assert.match(results[0]!.issues.at(-1)!.message, /different employee/i);
  assert.equal(results[1]!.classification, "conflict");
  assert.match(results[1]!.issues.at(-1)!.message, /administrator account/i);
  // Row 3 is a repeat of E1 within the file, so it is invalid before conflict checks.
  assert.equal(results[2]!.classification, "invalid");
});

test("an existing employee is update or unchanged based on mapped columns only", () => {
  const withExisting = context({
    employeesByNumber: new Map([["e1", existing()]]),
    accountsByEmail: new Map([["aisyah@example.invalid", { userId: 50, employeeId: 10 }]]),
  });

  const identical = classifyRows(
    [row("E1", "Aisyah Rahman", "aisyah@example.invalid", "Engineering", "Software Engineer", "Active", "2024-03-01")],
    baseMapping,
    withExisting,
  )[0]!;
  assert.equal(identical.classification, "unchanged");
  assert.deepEqual(identical.changedFields, []);
  assert.equal(identical.employeeId, 10);

  const changed = classifyRows(
    [row("E1", "Aisyah Rahman", "aisyah@example.invalid", "Finance", "Senior Engineer", "Probation", "2024-03-01")],
    baseMapping,
    withExisting,
  )[0]!;
  assert.equal(changed.classification, "update");
  assert.deepEqual(changed.changedFields.sort(), ["department", "employment_status", "job_title"]);

  // A column absent from the mapping is never treated as a change to empty.
  const narrow = classifyRows(
    [row("E1", "Aisyah Rahman", "aisyah@example.invalid", "Engineering")],
    { employee_number: 0, full_name: 1, email: 2, department: 3 },
    withExisting,
  )[0]!;
  assert.equal(narrow.classification, "unchanged");
});

test("warnings do not block a row and are counted separately", () => {
  const future = new Date(Date.now() + 90 * 86_400_000).toISOString().slice(0, 10);
  const results = classifyRows(
    [row("E1", "Aisyah", "a@example.invalid", "ENGINEERING", "", "", future)],
    baseMapping,
    context(),
  );
  assert.equal(results[0]!.classification, "new");
  const messages = results[0]!.issues.map((issue) => issue.message).join(" | ");
  assert.match(messages, /Matched existing department "Engineering"/i);
  assert.match(messages, /Employment date is in the future/i);
  assert.ok(results[0]!.issues.every((issue) => issue.level === "warning"));

  assert.deepEqual(summarize(results), {
    total: 1, new: 1, update: 0, unchanged: 0, conflict: 0, invalid: 0, warnings: 1,
  });
});

test("summary counts every classification for a mixed file", () => {
  const mixed = context({
    employeesByNumber: new Map([["e1", existing()], ["e2", existing({ id: 11, employee_number: "E2", full_name: "Daniel Tan", email: "daniel@example.invalid", user_id: 51 })]]),
    accountsByEmail: new Map([
      ["aisyah@example.invalid", { userId: 50, employeeId: 10 }],
      ["daniel@example.invalid", { userId: 51, employeeId: 11 }],
      ["admin@example.invalid", { userId: 1, employeeId: null }],
    ]),
  });

  const results = classifyRows(
    [
      row("E1", "Aisyah Rahman", "aisyah@example.invalid", "Engineering", "Software Engineer", "Active", "2024-03-01"),
      row("E2", "Daniel Tan", "daniel@example.invalid", "Finance", "Software Engineer", "Active", "2024-03-01"),
      row("E3", "Farah Ibrahim", "farah@example.invalid", "Engineering", "Analyst", "Active", "2024-05-01"),
      row("E4", "Bad Row", "nope", "Engineering", "", "", ""),
      row("E5", "Clashing", "admin@example.invalid", "Engineering", "", "", ""),
    ],
    baseMapping,
    mixed,
  );

  assert.deepEqual(summarize(results), {
    total: 5, new: 1, update: 1, unchanged: 1, conflict: 1, invalid: 1, warnings: 0,
  });
});
