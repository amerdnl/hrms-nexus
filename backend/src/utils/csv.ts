/**
 * CSV writing for report exports.
 *
 * Two separate concerns are handled here, and conflating them is the usual way
 * exports go wrong:
 *
 * 1. **RFC 4180 quoting** so the file parses back correctly.
 * 2. **Formula-injection neutralisation** so the file is not dangerous to open.
 *
 * Quoting alone does NOT make a cell safe: Excel, LibreOffice and Sheets all
 * evaluate a *quoted* field that begins with "=" as a formula once the quotes
 * are stripped by the parser. Neutralisation therefore happens before quoting,
 * not instead of it.
 */

/**
 * Leading characters a spreadsheet treats as the start of a formula. Tab and
 * carriage return are included because they can be used to slip a formula past
 * a naive first-character check.
 */
const formulaLeaders = new Set(["=", "+", "-", "@", "\t", "\r"]);

/** A value we are willing to leave alone even though it may start with "-". */
const plainNumber = /^-?\d+(?:\.\d+)?$/;

/**
 * Makes one piece of text safe to place in a spreadsheet cell, without quoting.
 *
 * Exported because XLSX needs exactly this rule and nothing else: a workbook
 * cell has no RFC 4180 quoting, but it has the same formula problem. Keeping the
 * decision in one place means a CSV export and an XLSX export cannot disagree
 * about what counts as dangerous.
 */
export function neutralizeFormula(text: string): string {
  // A formula can also be hidden behind leading whitespace, so the check looks
  // at the first non-space character rather than only at index 0.
  const firstMeaningful = text.trimStart().charAt(0);
  if (formulaLeaders.has(firstMeaningful) && !plainNumber.test(text)) {
    // A leading apostrophe is the spreadsheet convention for "this is text".
    return `'${text}`;
  }
  return text;
}

/**
 * Renders one value as a CSV field: neutralised, then quoted if it needs it.
 *
 * A leading "-" is only dangerous when it is not simply a negative number, so
 * "-272.73" is written as-is and "-2+3+cmd|' /C calc'!A0" is neutralised. That
 * distinction matters: prefixing every negative amount would make every payroll
 * deduction in the file read as text.
 */
export function csvField(value: unknown): string {
  if (value === null || value === undefined) return "";

  let text = typeof value === "string" ? value : String(value);
  if (text === "") return "";

  text = neutralizeFormula(text);

  const needsQuotes = /[",\r\n]/.test(text) || text !== text.trim();
  if (!needsQuotes) return text;

  return `"${text.replaceAll('"', '""')}"`;
}

export function csvRow(values: readonly unknown[]): string {
  return values.map(csvField).join(",");
}

/**
 * An export large enough to exhaust memory is refused rather than truncated: a
 * silently short report is worse than a clear refusal, because the reader
 * cannot tell that rows are missing.
 */
export const MAX_EXPORT_ROWS = 10_000;

export class ExportTooLargeError extends Error {
  constructor(public readonly rowCount: number) {
    super(
      `This export would contain ${rowCount} rows, which is over the ${MAX_EXPORT_ROWS} row limit. ` +
        "Narrow the date range or filter by department.",
    );
    this.name = "ExportTooLargeError";
  }
}

/**
 * Builds a complete CSV document.
 *
 * The UTF-8 byte order mark is deliberate: without it Excel on Windows decodes
 * the file as the local code page and mangles any non-ASCII name.
 */
export function buildCsv(headers: readonly string[], rows: readonly (readonly unknown[])[]): string {
  if (rows.length > MAX_EXPORT_ROWS) throw new ExportTooLargeError(rows.length);

  const lines = [csvRow(headers), ...rows.map(csvRow)];
  // CRLF is what RFC 4180 specifies and what Excel expects.
  return `﻿${lines.join("\r\n")}\r\n`;
}

/** A filename that cannot escape the header it is written into. */
export function csvFilename(base: string, suffix?: string): string {
  const safeBase = base.replace(/[^A-Za-z0-9_-]/g, "");
  const safeSuffix = (suffix ?? "").replace(/[^A-Za-z0-9_-]/g, "");
  return safeSuffix ? `${safeBase}-${safeSuffix}.csv` : `${safeBase}.csv`;
}
