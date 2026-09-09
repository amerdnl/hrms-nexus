import type { Request, Response } from "express";
import type { PoolClient } from "pg";
import pool from "../config/db.js";
import {
  applyImport,
  buildTemplateCsv,
  jobColumns,
  loadImportContext,
  missingDepartments,
  persistRows,
  writeSummary,
  type ImportJob,
} from "../services/importService.js";
import { parseIdParam } from "../utils/employeeValidation.js";
import {
  importFieldLabels,
  importFields,
  requiredImportFields,
  suggestMapping,
  validateMapping,
} from "../utils/importMapping.js";
import { classifyRows, summarize } from "../utils/importValidation.js";
import { readSpreadsheet, SpreadsheetError } from "../utils/spreadsheet.js";

const SAMPLE_ROWS = 5;

function databaseUnavailable(response: Response, error: unknown, action: string): void {
  console.error(`Import ${action} failed:`, error);
  response.status(503).json({
    success: false,
    message: "The database is temporarily unavailable. Please try again.",
  });
}

async function safeRollback(client: PoolClient): Promise<void> {
  try {
    await client.query("ROLLBACK");
  } catch {
    // The transaction is already lost; the caller's response still stands.
  }
}

async function loadJob(client: PoolClient, id: number, lock = false): Promise<ImportJob | null> {
  const result = await client.query<ImportJob>(
    `SELECT ${jobColumns}, source_rows FROM public.import_jobs WHERE id = $1${lock ? " FOR UPDATE" : ""}`,
    [id],
  );
  return result.rows[0] ?? null;
}

/** Field catalogue and the downloadable template the workflow starts from. */
export function getImportTemplate(request: Request, response: Response): void {
  if (request.query.format !== undefined && request.query.format !== "csv") {
    response.status(400).json({ success: false, message: "Only the csv template format is available." });
    return;
  }

  response.setHeader("Content-Type", "text/csv; charset=utf-8");
  response.setHeader("Content-Disposition", 'attachment; filename="hr-nexus-employee-import-template.csv"');
  response.status(200).send(buildTemplateCsv());
}

export function getImportFields(_request: Request, response: Response): void {
  response.status(200).json({
    success: true,
    data: importFields.map((field) => ({
      field,
      label: importFieldLabels[field],
      required: requiredImportFields.includes(field),
    })),
  });
}

/**
 * Step one: read the uploaded file, keep its cells, and suggest a mapping.
 * Nothing is validated against employee data yet and nothing is written to the
 * workforce; the admin confirms the mapping first.
 */
export async function createImportJob(request: Request, response: Response): Promise<void> {
  const file = request.file!;
  let sheet;

  try {
    sheet = await readSpreadsheet(file.buffer, file.originalname);
  } catch (error) {
    if (error instanceof SpreadsheetError) {
      response.status(400).json({ success: false, message: error.message });
      return;
    }
    console.error("Import file could not be read:", error);
    response.status(400).json({ success: false, message: "The file could not be read." });
    return;
  }

  const suggestion = suggestMapping(sheet.headers);

  try {
    const created = await pool.query<ImportJob>(
      `INSERT INTO public.import_jobs
         (file_name, import_type, initiated_by, status, source_headers, source_rows, total_rows)
       VALUES ($1, 'employees', $2, 'pending', $3::jsonb, $4::jsonb, $5)
       RETURNING ${jobColumns}`,
      [
        file.originalname.slice(0, 255),
        request.user!.id,
        JSON.stringify(sheet.headers),
        JSON.stringify(sheet.rows),
        sheet.rows.length,
      ],
    );

    response.status(201).json({
      success: true,
      message: "File read successfully. Confirm the column mapping to continue.",
      data: {
        job: created.rows[0],
        headers: sheet.headers,
        sample: sheet.rows.slice(0, SAMPLE_ROWS),
        suggested_mapping: suggestion.mapping,
        unmatched_headers: suggestion.unmatchedHeaders,
        ambiguous_fields: suggestion.ambiguousFields,
        ignored_password_headers: suggestion.ignoredPasswordHeaders,
      },
    });
  } catch (error) {
    databaseUnavailable(response, error, "job creation");
  }
}

/**
 * Step two: apply the confirmed mapping, validate every row against live data
 * and store the preview. Still no write to the workforce.
 */
export async function setImportMapping(request: Request, response: Response): Promise<void> {
  const id = parseIdParam(request.params.id);
  if (id === null) {
    response.status(400).json({ success: false, message: "Invalid import job ID" });
    return;
  }

  let client: PoolClient;
  try {
    client = await pool.connect();
  } catch (error) {
    databaseUnavailable(response, error, "mapping");
    return;
  }

  try {
    await client.query("BEGIN");
    const job = await loadJob(client, id, true);

    if (!job) {
      await safeRollback(client);
      response.status(404).json({ success: false, message: "Import job not found" });
      return;
    }
    if (job.status === "completed" || job.status === "importing") {
      await safeRollback(client);
      response.status(409).json({
        success: false,
        message: "This import has already been applied. Start a new import to change the mapping.",
      });
      return;
    }

    const mapping = validateMapping(request.body?.mapping, job.source_headers.length);
    if (!mapping.valid) {
      await safeRollback(client);
      response.status(400).json({
        success: false,
        message: "Check the column mapping.",
        errors: mapping.errors,
      });
      return;
    }

    const context = await loadImportContext(client);
    const results = classifyRows(job.source_rows, mapping.mapping, context);
    const summary = summarize(results);

    await client.query(
      "UPDATE public.import_jobs SET column_mapping = $2::jsonb WHERE id = $1",
      [job.id, JSON.stringify(mapping.mapping)],
    );
    await persistRows(client, job.id, results);
    await writeSummary(client, job.id, summary, "ready");
    await client.query("COMMIT");

    response.status(200).json({
      success: true,
      message: "Validation complete. Review the preview before importing.",
      data: {
        summary,
        missing_departments: missingDepartments(job.source_rows, mapping.mapping, context),
        mapping: mapping.mapping,
      },
    });
  } catch (error) {
    await safeRollback(client);
    databaseUnavailable(response, error, "validation");
  } finally {
    client.release();
  }
}

export async function getImportJob(request: Request, response: Response): Promise<void> {
  const id = parseIdParam(request.params.id);
  if (id === null) {
    response.status(400).json({ success: false, message: "Invalid import job ID" });
    return;
  }

  try {
    const result = await pool.query(
      `SELECT ${jobColumns}, source_headers FROM public.import_jobs WHERE id = $1`,
      [id],
    );
    if (result.rows.length === 0) {
      response.status(404).json({ success: false, message: "Import job not found" });
      return;
    }
    response.status(200).json({ success: true, data: result.rows[0] });
  } catch (error) {
    databaseUnavailable(response, error, "job lookup");
  }
}

/** Paginated preview rows, optionally narrowed to one classification. */
export async function getImportJobRows(request: Request, response: Response): Promise<void> {
  const id = parseIdParam(request.params.id);
  if (id === null) {
    response.status(400).json({ success: false, message: "Invalid import job ID" });
    return;
  }

  const classifications = ["new", "update", "unchanged", "conflict", "invalid"];
  const classification = request.query.classification;
  if (classification !== undefined && classification !== "" &&
      (typeof classification !== "string" || !classifications.includes(classification))) {
    response.status(400).json({ success: false, message: "Unknown classification filter." });
    return;
  }

  const page = Number(request.query.page ?? 1);
  const pageSize = Number(request.query.page_size ?? 25);
  if (!Number.isSafeInteger(page) || page < 1 || !Number.isSafeInteger(pageSize) ||
      pageSize < 1 || pageSize > 100) {
    response.status(400).json({ success: false, message: "Invalid page or page_size." });
    return;
  }

  const filters: unknown[] = [id];
  let where = "WHERE job_id = $1";
  if (typeof classification === "string" && classification !== "") {
    filters.push(classification);
    where += ` AND classification = $${filters.length}`;
  }
  filters.push(pageSize, (page - 1) * pageSize);

  try {
    const rows = await pool.query(
      `SELECT row_number, classification, employee_id, row_data, issues, changed_fields, applied,
              count(*) OVER() AS total_count
       FROM public.import_job_rows ${where}
       ORDER BY row_number
       LIMIT $${filters.length - 1} OFFSET $${filters.length}`,
      filters,
    );

    const total = Number(rows.rows[0]?.total_count ?? 0);
    response.status(200).json({
      success: true,
      data: rows.rows.map(({ total_count: _ignored, ...row }) => row),
      pagination: {
        page, page_size: pageSize, total,
        page_count: Math.max(1, Math.ceil(total / pageSize)),
      },
    });
  } catch (error) {
    databaseUnavailable(response, error, "row lookup");
  }
}

/**
 * Step three: apply the import in one transaction.
 *
 * Updating existing employees and creating missing departments each require an
 * explicit opt-in, so a confirmation can never quietly rewrite existing records.
 */
export async function confirmImportJob(request: Request, response: Response): Promise<void> {
  const id = parseIdParam(request.params.id);
  if (id === null) {
    response.status(400).json({ success: false, message: "Invalid import job ID" });
    return;
  }

  const body = (request.body ?? {}) as Record<string, unknown>;
  const unsupported = Object.keys(body).filter(
    (key) => !["apply_updates", "create_missing_departments"].includes(key),
  );
  if (unsupported.length > 0) {
    response.status(400).json({
      success: false,
      message: `The request contains unsupported fields: ${unsupported.sort().join(", ")}.`,
    });
    return;
  }
  for (const key of ["apply_updates", "create_missing_departments"]) {
    if (body[key] !== undefined && typeof body[key] !== "boolean") {
      response.status(400).json({ success: false, message: `${key} must be true or false.` });
      return;
    }
  }

  let client: PoolClient;
  try {
    client = await pool.connect();
  } catch (error) {
    databaseUnavailable(response, error, "confirmation");
    return;
  }

  let jobId: string | null = null;

  try {
    await client.query("BEGIN");
    const job = await loadJob(client, id, true);

    if (!job) {
      await safeRollback(client);
      response.status(404).json({ success: false, message: "Import job not found" });
      return;
    }
    jobId = job.id;

    if (job.status === "completed") {
      await safeRollback(client);
      response.status(409).json({
        success: false,
        message: "This import has already been applied.",
      });
      return;
    }
    if (job.status !== "ready" || !job.column_mapping) {
      await safeRollback(client);
      response.status(409).json({
        success: false,
        message: "Confirm the column mapping and review the preview before importing.",
      });
      return;
    }

    await client.query("UPDATE public.import_jobs SET status = 'importing' WHERE id = $1", [job.id]);

    const result = await applyImport(client, job, {
      applyUpdates: body.apply_updates === true,
      createMissingDepartments: body.create_missing_departments === true,
    });

    await client.query("COMMIT");

    response.status(200).json({
      success: true,
      message: `Import complete: ${result.created} created, ${result.updated} updated.`,
      data: {
        summary: result.summary,
        created: result.created,
        updated: result.updated,
        created_departments: result.createdDepartments,
        // Shown once so the administrator can distribute them; never stored.
        credentials: result.credentials,
      },
    });
  } catch (error) {
    await safeRollback(client);
    const code = (error as { code?: string }).code;
    const message = code === "23505"
      ? "The import conflicts with records that changed since the preview. Re-validate and try again."
      : "The import failed and no records were changed. Re-validate and try again.";

    // Recorded in its own statement: the transaction that failed is already gone.
    if (jobId) {
      try {
        await client.query(
          `UPDATE public.import_jobs
           SET status = 'failed', completed_at = CURRENT_TIMESTAMP, error_message = $2
           WHERE id = $1`,
          [jobId, message],
        );
      } catch {
        // The response below still reports the failure accurately.
      }
    }

    console.error("Import apply failed:", error);
    response.status(code === "23505" ? 409 : 500).json({ success: false, message });
  } finally {
    client.release();
  }
}

export async function listImportJobs(request: Request, response: Response): Promise<void> {
  const page = Number(request.query.page ?? 1);
  const pageSize = Number(request.query.page_size ?? 20);
  if (!Number.isSafeInteger(page) || page < 1 || !Number.isSafeInteger(pageSize) ||
      pageSize < 1 || pageSize > 100) {
    response.status(400).json({ success: false, message: "Invalid page or page_size." });
    return;
  }

  try {
    const result = await pool.query(
      `SELECT j.id, j.file_name, j.import_type, j.status, j.total_rows, j.new_rows,
              j.update_rows, j.unchanged_rows, j.conflict_rows, j.invalid_rows,
              j.warning_rows, j.created_count, j.updated_count, j.error_message,
              j.created_at, j.completed_at,
              j.initiated_by, u.email AS initiated_by_email,
              count(*) OVER() AS total_count
       FROM public.import_jobs j
       LEFT JOIN public.users u ON u.id = j.initiated_by
       ORDER BY j.created_at DESC, j.id DESC
       LIMIT $1 OFFSET $2`,
      [pageSize, (page - 1) * pageSize],
    );

    const total = Number(result.rows[0]?.total_count ?? 0);
    response.status(200).json({
      success: true,
      data: result.rows.map(({ total_count: _ignored, ...row }) => row),
      pagination: {
        page, page_size: pageSize, total,
        page_count: Math.max(1, Math.ceil(total / pageSize)),
      },
    });
  } catch (error) {
    databaseUnavailable(response, error, "history lookup");
  }
}
