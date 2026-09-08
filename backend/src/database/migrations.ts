import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import type { Pool, PoolClient } from "pg";

export const MIGRATION_LOCK = [1213353560, 1296648018] as const;
export const defaultMigrationDirectory = new URL("../../migrations/", import.meta.url);

export interface Migration {
  version: string;
  filename: string;
  checksum: string;
  sql: string;
}

export class MigrationError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message);
    this.name = "MigrationError";
  }
}

// Find top-level statements without treating quoted function bodies, strings or
// comments as transaction commands. Migration files are reviewed code, not a SQL sandbox.
export function checkTransactionBoundaries(sql: string): void {
  let i = 0;
  let firstWord = true;
  const forbidden = new Set([
    "BEGIN", "START", "COMMIT", "END", "ROLLBACK", "ABORT", "SAVEPOINT",
    "RELEASE", "PREPARE", "SET", "RESET", "DISCARD",
  ]);
  while (i < sql.length) {
    if (/\s/.test(sql[i]!)) { i++; continue; }
    if (sql.startsWith("--", i)) {
      const end = sql.indexOf("\n", i);
      i = end < 0 ? sql.length : end + 1;
      continue;
    }
    if (sql.startsWith("/*", i)) {
      let depth = 1;
      i += 2;
      while (depth && i < sql.length) {
        if (sql.startsWith("/*", i)) { depth++; i += 2; }
        else if (sql.startsWith("*/", i)) { depth--; i += 2; }
        else i++;
      }
      if (depth) throw new MigrationError("Unterminated SQL comment", "INVALID_SQL");
      continue;
    }
    const quote = sql[i];
    if (quote === "'" || quote === '"') {
      // SQL escape strings E'...' use backslashes; normal strings use doubled quotes.
      const escapeString = quote === "'" && /[eE]/.test(sql[i - 1] ?? "") &&
        !/[\w$]/.test(sql[i - 2] ?? "");
      i++;
      let closed = false;
      while (i < sql.length) {
        if (escapeString && sql[i] === "\\") { i += 2; continue; }
        if (sql[i] === quote) {
          if (sql[i + 1] === quote) { i += 2; continue; }
          i++; closed = true; break;
        }
        i++;
      }
      if (!closed) throw new MigrationError("Unterminated SQL quote", "INVALID_SQL");
      firstWord = false;
      continue;
    }
    const dollar = sql.slice(i).match(/^\$(?:[A-Za-z_][A-Za-z_0-9]*)?\$/)?.[0];
    if (dollar) {
      const end = sql.indexOf(dollar, i + dollar.length);
      if (end < 0) throw new MigrationError("Unterminated SQL dollar quote", "INVALID_SQL");
      i = end + dollar.length;
      firstWord = false;
      continue;
    }
    if (sql[i] === ";") { firstWord = true; i++; continue; }
    const word = sql.slice(i).match(/^[A-Za-z_][A-Za-z_0-9]*/)?.[0];
    if (word) {
      if (firstWord && forbidden.has(word.toUpperCase())) {
        throw new MigrationError(`Migration cannot control transactions or session settings: ${word}`, "TRANSACTION_CONTROL");
      }
      firstWord = false;
      i += word.length;
    } else {
      firstWord = false;
      i++;
    }
  }
}

export async function loadMigrations(directory: string | URL = defaultMigrationDirectory): Promise<Migration[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const names = entries.filter((entry) => entry.name.endsWith(".sql")).map((entry) => {
    if (!entry.isFile() || !/^\d{4}_[a-z0-9_]+\.sql$/.test(entry.name)) {
      throw new MigrationError(`Invalid migration filename: ${entry.name}`, "INVALID_FILENAME");
    }
    return entry.name;
  }).sort();
  const migrations: Migration[] = [];
  for (const [index, filename] of names.entries()) {
    const version = filename.slice(0, 4);
    if (Number(version) !== index + 1) {
      throw new MigrationError("Migrations must be consecutive from 0001, with no duplicate versions", "INVALID_ORDER");
    }
    const file = typeof directory === "string" ? path.join(directory, filename) : new URL(filename, directory);
    const bytes = await readFile(file);
    const sql = bytes.toString("utf8");
    checkTransactionBoundaries(sql);
    migrations.push({ version, filename, sql, checksum: createHash("sha256").update(bytes).digest("hex") });
  }
  return migrations;
}

interface AppliedMigration { version: string; filename: string; checksum: string }

async function readHistory(client: PoolClient): Promise<AppliedMigration[]> {
  const exists = await client.query("SELECT to_regclass('public.schema_migrations') AS name");
  if (!exists.rows[0].name) return [];
  const result = await client.query<AppliedMigration>(
    "SELECT version, filename, checksum FROM public.schema_migrations ORDER BY version",
  );
  return result.rows;
}

function verifyHistory(migrations: Migration[], applied: AppliedMigration[]): void {
  for (const [index, row] of applied.entries()) {
    const file = migrations[index];
    if (!file || file.version !== row.version || file.filename !== row.filename || file.checksum !== row.checksum) {
      throw new MigrationError(`Applied migration ${row.version} is missing, reordered, renamed or has a checksum mismatch`, "HISTORY_MISMATCH");
    }
  }
}

export async function runMigrations(
  pool: Pool,
  options: { mode: "status" | "apply"; database: string; directory?: string | URL },
) {
  if (!options.database) throw new MigrationError("An explicit database name is required", "TARGET_REQUIRED");
  const migrations = await loadMigrations(options.directory);
  const client = await pool.connect();
  let locked = false;
  let inTransaction = false;
  try {
    const identity = await client.query<{ database: string }>("SELECT current_database() AS database");
    if (identity.rows[0]?.database !== options.database) {
      throw new MigrationError("Connected database does not match the explicitly selected target", "TARGET_MISMATCH");
    }
    const lock = await client.query<{ acquired: boolean }>(
      "SELECT pg_try_advisory_lock($1::integer, $2::integer) AS acquired", [...MIGRATION_LOCK],
    );
    if (!lock.rows[0]?.acquired) throw new MigrationError("Another migration process holds the lock; retry after it completes", "MIGRATION_BUSY");
    locked = true;
    const applied = await readHistory(client);
    verifyHistory(migrations, applied);
    const newlyApplied: string[] = [];
    if (options.mode === "apply") {
      for (const migration of migrations.slice(applied.length)) {
        let commitAttempted = false;
        await client.query("BEGIN");
        inTransaction = true;
        await client.query("SET LOCAL lock_timeout = '5s'");
        await client.query("SET LOCAL statement_timeout = '60s'");
        await client.query("SET LOCAL search_path = pg_catalog, public");
        await client.query("SET LOCAL standard_conforming_strings = on");
        try {
          await client.query(`CREATE TABLE IF NOT EXISTS public.schema_migrations (
            version VARCHAR(4) PRIMARY KEY CHECK (version ~ '^[0-9]{4}$'),
            filename TEXT NOT NULL UNIQUE,
            checksum VARCHAR(64) NOT NULL CHECK (checksum ~ '^[0-9a-f]{64}$'),
            applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
          )`);
          await client.query(migration.sql);
          await client.query(
            "INSERT INTO public.schema_migrations (version, filename, checksum) VALUES ($1, $2, $3)",
            [migration.version, migration.filename, migration.checksum],
          );
          commitAttempted = true;
          await client.query("COMMIT");
          inTransaction = false;
          newlyApplied.push(migration.version);
        } catch (error) {
          if (commitAttempted) {
            throw new MigrationError(`Migration ${migration.version} commit acknowledgement failed; run status to determine whether it committed before retrying.`, "COMMIT_UNKNOWN");
          }
          const code = (error as { code?: string }).code ?? "MIGRATION_FAILED";
          throw new MigrationError(`Migration ${migration.version} failed (${code}); its transaction is rolled back. Earlier migrations remain applied.`, code);
        }
      }
    }
    const baseline = await client.query(
      "SELECT to_regclass('public.attendance') IS NOT NULL AND to_regclass('public.employees') IS NOT NULL AS available",
    );
    const exceptions = baseline.rows[0].available
      ? (await client.query(
          `SELECT a.id::text, a.employee_id::text, a.attendance_date::text
           FROM public.attendance a
           WHERE NOT EXISTS (SELECT 1 FROM public.employees e WHERE e.id = a.employee_id)
           ORDER BY a.id`,
        )).rows
      : null;
    const attendanceForeignKey = (await client.query(
      `SELECT convalidated AS validated, confdeltype AS "deleteAction", confupdtype AS "updateAction"
       FROM pg_constraint WHERE conrelid = to_regclass('public.attendance')
         AND conname = 'attendance_employee_id_fkey' AND contype = 'f'`,
    )).rows[0] ?? null;
    return {
      database: options.database,
      newlyApplied,
      orphanAttendance: exceptions,
      attendanceForeignKey,
      migrations: migrations.map(({ version, filename, checksum }, index) => ({
        version, filename, checksum,
        status: index < applied.length || newlyApplied.includes(version) ? "applied" : "pending",
      })),
    };
  } finally {
    try {
      if (inTransaction) await client.query("ROLLBACK");
      if (locked) await client.query("SELECT pg_advisory_unlock($1::integer, $2::integer)", [...MIGRATION_LOCK]);
    } catch {
      // Preserve the migration outcome, especially COMMIT_UNKNOWN. A disconnected
      // session cannot be cleaned up with SQL; destruction below aborts any open
      // transaction and releases its advisory lock without returning it to the pool.
    } finally {
      // Dedicated session disposal also releases locks if rollback/unlock failed.
      client.release(true);
    }
  }
}
