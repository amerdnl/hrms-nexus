import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildCsv,
  csvField,
  csvFilename,
  csvRow,
  ExportTooLargeError,
  MAX_EXPORT_ROWS,
} from "../src/utils/csv.js";
import { parseCsv } from "../src/utils/spreadsheet.js";

test("a formula is neutralised so opening the file cannot execute it", () => {
  // The classic payloads. Each must not survive as a leading formula character.
  for (const payload of [
    "=1+1",
    "=cmd|' /C calc'!A0",
    "+1+1",
    "@SUM(A1:A9)",
    "-2+3+cmd|' /C calc'!A0",
    "=HYPERLINK(\"http://evil.invalid\",\"click\")",
  ]) {
    const field = csvField(payload);
    const unquoted = field.startsWith('"') ? field.slice(1, -1).replaceAll('""', '"') : field;
    assert.equal(unquoted.charAt(0), "'", `${payload} was not neutralised`);
  }
});

test("neutralisation survives the quoting, not the other way round", () => {
  // A quoted formula is still a formula once the parser strips the quotes, so
  // the apostrophe must be inside the quotes.
  const field = csvField('=1+1,"x"');
  assert.ok(field.startsWith('"\'='), field);
  assert.deepEqual(parseCsv(field), [["'=1+1,\"x\""]]);
});

test("a formula hidden behind leading whitespace is still caught", () => {
  // Quoting is not required here (no comma, quote or newline); what matters is
  // that the value can no longer be read as a formula.
  assert.equal(csvField("   =1+1"), "'   =1+1");
  assert.equal(csvField("\t=1+1"), "'\t=1+1");
});

test("a negative number is left readable rather than turned into text", () => {
  // Prefixing every negative would make every payroll deduction read as a string.
  assert.equal(csvField("-272.73"), "-272.73");
  assert.equal(csvField("-1"), "-1");
  assert.equal(csvField(-272.73), "-272.73");
});

test("ordinary values are written unchanged", () => {
  assert.equal(csvField("Aisyah Rahman"), "Aisyah Rahman");
  assert.equal(csvField("PAY-1"), "PAY-1");
  assert.equal(csvField(2977.27), "2977.27");
  assert.equal(csvField(0), "0");
  assert.equal(csvField(null), "");
  assert.equal(csvField(undefined), "");
});

test("RFC 4180 quoting round-trips through the reader", () => {
  const row = ["Plain", 'He said "hi"', "comma, inside", "line\nbreak"];
  const parsed = parseCsv(csvRow(row));
  assert.deepEqual(parsed, [row]);
});

test("padding is quoted on the way out, even though the import reader trims", () => {
  // The writer must not lose the spaces; parseCsv trims deliberately because
  // import values are documented as trimmed, so it is not the check to use here.
  assert.equal(csvField(" padded "), '" padded "');
});

test("a document carries a byte order mark, CRLF endings and its header", () => {
  const csv = buildCsv(["Name", "Amount"], [["Aisyah", "2977.27"]]);
  assert.equal(csv.charCodeAt(0), 0xfeff, "Excel needs the BOM to read UTF-8");
  assert.ok(csv.includes("\r\n"));

  const parsed = parseCsv(csv);
  assert.deepEqual(parsed[0], ["Name", "Amount"]);
  assert.deepEqual(parsed[1], ["Aisyah", "2977.27"]);
});

test("an oversized export is refused rather than silently truncated", () => {
  const rows = Array.from({ length: MAX_EXPORT_ROWS + 1 }, (_, index) => [index]);
  assert.throws(() => buildCsv(["n"], rows), ExportTooLargeError);
  // The boundary itself is allowed.
  assert.doesNotThrow(() => buildCsv(["n"], rows.slice(0, MAX_EXPORT_ROWS)));
});

test("a filename cannot carry quotes or paths into the response header", () => {
  assert.equal(csvFilename("payroll-report", "2026-09"), "payroll-report-2026-09.csv");
  assert.equal(csvFilename('evil"; drop', "../../etc"), "evildrop-etc.csv");
  assert.equal(csvFilename("workforce-report"), "workforce-report.csv");
});
