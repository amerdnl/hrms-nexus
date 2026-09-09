import ExcelJS from "exceljs";

/**
 * Uniform view of an uploaded workforce file, whatever its format.
 * Values are trimmed strings; interpretation belongs to the import validator so
 * CSV and XLSX rows are judged by exactly the same rules.
 */
export interface SheetData {
  headers: string[];
  rows: string[][];
}

export class SpreadsheetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SpreadsheetError";
  }
}

/** Guards against a spreadsheet large enough to exhaust memory during preview. */
export const MAX_IMPORT_ROWS = 5000;
export const MAX_IMPORT_COLUMNS = 60;

/**
 * RFC 4180 reader. Written here rather than pulled in as a dependency: the
 * grammar is small and this keeps CSV import working with no supply chain.
 *
 * Handles quoted fields, doubled quotes inside them, embedded newlines and
 * commas, CRLF or LF endings, and a leading byte order mark.
 */
export function parseCsv(text: string): string[][] {
  const input = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  let index = 0;
  // Distinguishes a genuinely empty trailing line from a row of empty fields.
  let fieldStarted = false;

  const endField = () => {
    row.push(field.trim());
    field = "";
    fieldStarted = false;
  };
  const endRow = () => {
    endField();
    rows.push(row);
    row = [];
  };

  while (index < input.length) {
    const character = input[index]!;

    if (quoted) {
      if (character === '"') {
        if (input[index + 1] === '"') {
          field += '"';
          index += 2;
          continue;
        }
        quoted = false;
        index += 1;
        continue;
      }
      field += character;
      index += 1;
      continue;
    }

    if (character === '"' && !fieldStarted) {
      quoted = true;
      fieldStarted = true;
      index += 1;
      continue;
    }

    if (character === ",") {
      endField();
      index += 1;
      continue;
    }

    if (character === "\r" || character === "\n") {
      endRow();
      index += character === "\r" && input[index + 1] === "\n" ? 2 : 1;
      continue;
    }

    field += character;
    fieldStarted = true;
    index += 1;
  }

  if (quoted) throw new SpreadsheetError("The file has an unclosed quoted value.");
  // A file that does not end in a newline still has a final row to emit.
  if (field !== "" || row.length > 0) endRow();

  return rows;
}

/** ExcelJS cell values are unions; reduce each to the text a person would see. */
function cellToText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) {
    // Excel dates arrive as UTC midnight; keep the calendar day, drop the clock.
    return value.toISOString().slice(0, 10);
  }
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);

  const record = value as Record<string, unknown>;
  if (typeof record.text === "string") return record.text.trim();
  if (Array.isArray(record.richText)) {
    return record.richText.map((part) => String((part as { text?: string }).text ?? "")).join("").trim();
  }
  // A formula cell carries its computed result; the formula itself is not data.
  if ("result" in record) return cellToText(record.result);
  if ("hyperlink" in record && typeof record.hyperlink === "string") return record.hyperlink.trim();
  return String(value).trim();
}

async function parseWorkbook(buffer: Buffer): Promise<string[][]> {
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  } catch {
    throw new SpreadsheetError("The file could not be read as a valid Excel workbook.");
  }

  const sheet = workbook.worksheets.find((worksheet) => worksheet.state !== "hidden")
    ?? workbook.worksheets[0];
  if (!sheet) throw new SpreadsheetError("The workbook contains no worksheets.");

  const rows: string[][] = [];
  sheet.eachRow({ includeEmpty: false }, (excelRow) => {
    const values: string[] = [];
    // cellCount is 1-based and skips nothing, so blanks keep their column position.
    for (let column = 1; column <= Math.min(excelRow.cellCount, MAX_IMPORT_COLUMNS); column += 1) {
      values.push(cellToText(excelRow.getCell(column).value));
    }
    rows.push(values);
  });

  return rows;
}

function isBlank(row: string[]): boolean {
  return row.every((value) => value === "");
}

/**
 * Reads an uploaded file into headers plus data rows, rejecting shapes that
 * cannot be imported before any of it reaches validation.
 */
export async function readSpreadsheet(
  buffer: Buffer,
  filename: string,
): Promise<SheetData> {
  const isExcel = /\.xlsx$/i.test(filename);
  let table = isExcel ? await parseWorkbook(buffer) : parseCsv(buffer.toString("utf8"));

  table = table.filter((row) => !isBlank(row));
  const headerRow = table.shift();

  if (!headerRow || isBlank(headerRow)) {
    throw new SpreadsheetError("The file is empty or has no header row.");
  }
  if (headerRow.length > MAX_IMPORT_COLUMNS) {
    throw new SpreadsheetError(`The file has more than ${MAX_IMPORT_COLUMNS} columns.`);
  }
  if (table.length === 0) {
    throw new SpreadsheetError("The file has a header row but no data rows.");
  }
  if (table.length > MAX_IMPORT_ROWS) {
    throw new SpreadsheetError(
      `The file has ${table.length} data rows; the limit is ${MAX_IMPORT_ROWS} per import.`,
    );
  }

  const headers = headerRow.map((header) => header.trim());
  if (headers.every((header) => header === "")) {
    throw new SpreadsheetError("The header row has no column names.");
  }

  // Pad short rows so every row can be indexed by column position safely.
  const rows = table.map((row) => {
    const padded = row.slice(0, headers.length);
    while (padded.length < headers.length) padded.push("");
    return padded;
  });

  return { headers, rows };
}
