/**
 * XLSX writing for the company data export.
 *
 * The concerns here mirror `csv.ts`, but the failure modes differ:
 *
 * 1. **Formula injection.** A workbook string cell is not re-parsed as a
 *    formula by Excel, so this is less acute than in CSV — but the same file is
 *    routinely re-saved as CSV, and other readers are less careful. The same
 *    neutralisation rule is therefore applied, imported from `csv.ts` rather
 *    than restated, so the two exports cannot disagree about what is dangerous.
 *    No cell is ever assigned a formula object.
 *
 * 2. **Floating point.** Money arrives already rendered as exact text by
 *    `formatSenExact`, from integer sen via BigInt. It is written as a string
 *    and never converted to a JavaScript number, because `1234567 / 100` is not
 *    exactly representable in IEEE-754 and a payroll file must not round.
 *    Whole numbers that are safe integers are written as numeric cells, which
 *    is exact by definition and keeps ids and counts sortable.
 *
 * 3. **Nothing hidden.** Every sheet is explicitly visible. A reader must be
 *    able to see everything the file contains.
 *
 * The output is .xlsx, which cannot carry macros; no macro-enabled format is
 * produced anywhere in this project.
 */
import ExcelJS from "exceljs";
import { neutralizeFormula } from "./csv.js";

export interface SheetSpec {
  /** Becomes the tab name. Sanitised to what Excel actually permits. */
  name: string;
  headers: readonly string[];
  rows: readonly (readonly unknown[])[];
  /** Shown above the table when the sheet is empty, instead of a bare header. */
  emptyNote?: string;
}

/**
 * A whole-workbook ceiling, separate from the per-dataset one.
 *
 * A caller could stay under the per-dataset limit on every sheet and still ask
 * for a file too large to build, so the total is bounded as well.
 */
export const MAX_WORKBOOK_ROWS = 100_000;

export class WorkbookTooLargeError extends Error {
  constructor(public readonly rowCount: number) {
    super(
      `This export would contain ${rowCount} rows in total, which is over the ` +
        `${MAX_WORKBOOK_ROWS} row limit for one workbook. Export the datasets ` +
        "individually as CSV instead.",
    );
    this.name = "WorkbookTooLargeError";
  }
}

/** Characters Excel refuses in a sheet name, plus its 31-character limit. */
export function sheetName(name: string): string {
  const cleaned = name.replace(/[[\]:*?/\\]/g, " ").trim();
  return (cleaned === "" ? "Sheet" : cleaned).slice(0, 31);
}

/**
 * Writes one value into one cell.
 *
 * Anything not a safe integer becomes neutralised text. That includes every
 * money amount, which reaches here already formatted exactly.
 */
function writeCell(cell: ExcelJS.Cell, value: unknown): void {
  if (value === null || value === undefined || value === "") return;

  if (typeof value === "number") {
    // Safe integers are exact in IEEE-754; anything else would be a rounded
    // approximation, so it is written as text rather than quietly altered.
    if (Number.isSafeInteger(value)) {
      cell.value = value;
      return;
    }
    cell.value = neutralizeFormula(String(value));
    return;
  }

  if (typeof value === "boolean") {
    cell.value = value ? "yes" : "no";
    return;
  }

  cell.value = neutralizeFormula(typeof value === "string" ? value : String(value));
}

export async function buildWorkbook(sheets: readonly SheetSpec[]): Promise<Buffer> {
  const total = sheets.reduce((sum, sheet) => sum + sheet.rows.length, 0);
  if (total > MAX_WORKBOOK_ROWS) throw new WorkbookTooLargeError(total);

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "HR Nexus";
  workbook.created = new Date();

  const used = new Set<string>();

  for (const spec of sheets) {
    // Excel refuses duplicate tab names; a collision after truncation would
    // otherwise throw halfway through building the file.
    let name = sheetName(spec.name);
    let attempt = 2;
    while (used.has(name.toLowerCase())) {
      const suffix = ` (${attempt})`;
      name = `${name.slice(0, 31 - suffix.length)}${suffix}`;
      attempt += 1;
    }
    used.add(name.toLowerCase());

    const sheet = workbook.addWorksheet(name, {
      // Stated rather than left to default: nothing in this file is hidden.
      state: "visible",
      views: [{ state: "frozen", ySplit: 1 }],
    });

    const headerRow = sheet.addRow([...spec.headers]);
    headerRow.font = { bold: true };

    for (const row of spec.rows) {
      const added = sheet.addRow([]);
      row.forEach((value, index) => writeCell(added.getCell(index + 1), value));
    }

    if (spec.rows.length === 0 && spec.emptyNote) {
      // An empty sheet says so in words. A header row alone is ambiguous: it
      // could mean "no records" or "this failed to load".
      writeCell(sheet.addRow([]).getCell(1), spec.emptyNote);
    }

    spec.headers.forEach((header, index) => {
      sheet.getColumn(index + 1).width = Math.min(Math.max(header.length + 4, 12), 40);
    });
  }

  const written = await workbook.xlsx.writeBuffer();
  return Buffer.from(written);
}

/** A filename that cannot escape the header it is written into. */
export function xlsxFilename(base: string, suffix?: string): string {
  const safeBase = base.replace(/[^A-Za-z0-9_-]/g, "");
  const safeSuffix = (suffix ?? "").replace(/[^A-Za-z0-9_-]/g, "");
  return safeSuffix ? `${safeBase}-${safeSuffix}.xlsx` : `${safeBase}.xlsx`;
}
