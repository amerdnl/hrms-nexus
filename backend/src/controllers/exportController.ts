/**
 * Company data export endpoints.
 *
 * Every route here is administrator-only, enforced by the router rather than by
 * anything in this file, so a download URL is never a weaker door than the API
 * the data also flows through. Nothing accepts an employee, department or other
 * target identifier: a company export is the whole company, so there is no
 * parameter for a caller to point somewhere it should not go.
 *
 * The only write these endpoints perform is the audit entry recording that an
 * export happened. The entry names the datasets and their row counts; it never
 * stores the exported content, which would put a second copy of every salary in
 * the audit table.
 */
import type { Request, Response } from "express";
import pool from "../config/db.js";
import {
  actorFromUser, recordAudit,
} from "../services/auditService.js";
import {
  datasets, datasetsByKey, loadDataset, type Dataset, type ExportContext,
} from "../services/exportService.js";
import { getZonedNow } from "../utils/attendanceVerification.js";
import { buildCsv, csvFilename, ExportTooLargeError, MAX_EXPORT_ROWS } from "../utils/csv.js";
import {
  buildWorkbook, MAX_WORKBOOK_ROWS, WorkbookTooLargeError, xlsxFilename, type SheetSpec,
} from "../utils/xlsx.js";

function unavailable(response: Response, error: unknown, action: string): void {
  console.error(`Export ${action} failed:`, error);
  response.status(503).json({
    success: false,
    message: "The database is temporarily unavailable. Please try again.",
  });
}

function tooLarge(response: Response, error: unknown): boolean {
  if (error instanceof ExportTooLargeError || error instanceof WorkbookTooLargeError) {
    response.status(413).json({ success: false, message: error.message });
    return true;
  }
  return false;
}

/** The company's own calendar date, not the database server's. */
async function companyToday(): Promise<string> {
  const settings = await pool.query<{ timezone: string }>(
    "SELECT timezone FROM public.company_settings WHERE id = 1",
  );
  try {
    return getZonedNow(settings.rows[0]?.timezone ?? "UTC").date;
  } catch {
    return getZonedNow("UTC").date;
  }
}

async function exportContext(): Promise<ExportContext> {
  return { leaveYear: Number((await companyToday()).slice(0, 4)) };
}

/**
 * Records that an export was taken.
 *
 * Deliberately best-effort in the same way every other audit call is: the write
 * is contained by a SAVEPOINT inside `recordAudit`, and a failure to record must
 * not deny an administrator their own company's data.
 */
async function auditExport(
  request: Request, format: "CSV" | "XLSX",
  entries: readonly { key: string; rows: number }[],
): Promise<void> {
  const total = entries.reduce((sum, entry) => sum + entry.rows, 0);
  const names = entries.map((entry) => entry.key).join(", ");

  await recordAudit({
    actor: actorFromUser(request.user, request.user?.email),
    action: "DATA_EXPORTED",
    entityType: "export",
    entityId: format.toLowerCase(),
    summary: `Exported ${entries.length} dataset${entries.length === 1 ? "" : "s"} `
      + `as ${format} (${total} row${total === 1 ? "" : "s"})`,
    // Counts and names only. The exported rows themselves are never recorded.
    changes: { format, datasets: names, rows: total },
  });
}

function sendFile(
  response: Response, filename: string, contentType: string, body: string | Buffer,
): void {
  response.setHeader("Content-Type", contentType);
  response.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  // Stops a browser from sniffing the body into something executable.
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.status(200).send(body);
}

// ------------------------------------------------------------------ listing

export async function listDatasets(_request: Request, response: Response): Promise<void> {
  response.status(200).json({
    success: true,
    data: {
      datasets: datasets.map((dataset) => ({
        key: dataset.key,
        label: dataset.label,
        description: dataset.description,
        columns: dataset.headers.length,
      })),
      maxRowsPerDataset: MAX_EXPORT_ROWS,
      maxRowsPerWorkbook: MAX_WORKBOOK_ROWS,
    },
  });
}

// ---------------------------------------------------------------------- CSV

export async function exportDatasetCsv(request: Request, response: Response): Promise<void> {
  const dataset: Dataset | undefined = datasetsByKey.get(String(request.params.key));
  if (!dataset) {
    response.status(404).json({ success: false, message: "Unknown export dataset." });
    return;
  }

  try {
    const rows = await loadDataset(dataset, await exportContext());
    const csv = buildCsv(dataset.headers, rows);
    await auditExport(request, "CSV", [{ key: dataset.key, rows: rows.length }]);
    sendFile(response, csvFilename(dataset.key), "text/csv; charset=utf-8", csv);
  } catch (error) {
    if (tooLarge(response, error)) return;
    unavailable(response, error, `${dataset.key} CSV`);
  }
}

// --------------------------------------------------------------------- XLSX

export async function exportWorkbook(request: Request, response: Response): Promise<void> {
  try {
    const context = await exportContext();
    const sheets: SheetSpec[] = [];
    const counts: { key: string; rows: number }[] = [];

    // Sequential rather than concurrent: the workbook is one consistent picture
    // of the company, and fifteen parallel scans would compete with live traffic
    // for no benefit on a file that is written once.
    for (const dataset of datasets) {
      const rows = await loadDataset(dataset, context);
      if (rows.length > MAX_EXPORT_ROWS) throw new ExportTooLargeError(rows.length);

      sheets.push({
        name: dataset.label,
        headers: dataset.headers,
        rows,
        emptyNote: "No records.",
      });
      counts.push({ key: dataset.key, rows: rows.length });
    }

    const workbook = await buildWorkbook(sheets);
    await auditExport(request, "XLSX", counts);
    sendFile(
      response,
      xlsxFilename("hr-nexus-company-export", (await companyToday()).replaceAll("-", "")),
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      workbook,
    );
  } catch (error) {
    if (tooLarge(response, error)) return;
    unavailable(response, error, "company workbook");
  }
}
