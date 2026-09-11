/**
 * The shared laboratory harness for V3 suites.
 *
 * Every V2 integration suite carried its own copy of the same forty lines:
 * clone a database from the retained baseline, apply the migration chain, point
 * the application at the clone, boot Express on an ephemeral port, sign tokens,
 * and drop the clone afterwards. V3 adds a suite per milestone, so the pattern
 * lives here once.
 *
 * SAFETY. The only permitted host is the isolated, internal Docker laboratory.
 * There is no DATABASE_URL fallback and no way to point this at the source
 * database: the host is a constant, and every database it touches is a clone it
 * created itself, named with a random suffix it then uses to clean up.
 *
 * Because `src/config/db.ts` reads DATABASE_URL once at import, a suite may boot
 * the application against exactly one clone. `node --test` runs each file in
 * its own process, so separate suites never share a pool.
 */
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { once } from "node:events";
import { copyFile, mkdtemp, rm } from "node:fs/promises";
import type { Server } from "node:http";
import os from "node:os";
import path from "node:path";
import jwt from "jsonwebtoken";
import pg from "pg";
import { defaultMigrationDirectory, loadMigrations, runMigrations } from "../src/database/migrations.js";
import { dropLabClones } from "./labClones.js";

export const LAB_HOST = "hr-nexus-v2-migration-lab";

/** The retained baseline: 0001 applied, 0002 onward pending, five orphan rows. */
export const SETTINGS_BASELINE = "hr_nexus_v2_settings_baseline";

export interface LabContext {
  /** Direct pool on the clone, for fixtures and assertions. */
  db: pg.Pool;
  database: string;
  /** The application's origin, e.g. http://127.0.0.1:54321/api */
  origin: string;
  /** Signs a token exactly as the login endpoint does. */
  sign: (userId: number, role: "admin" | "employee", employeeId: number | null) => string;
  /** Calls the API with an optional bearer token and JSON body. */
  call: (method: string, endpoint: string, token?: string | null, body?: unknown) => Promise<Response>;
  /** Calls the API and parses JSON, returning status and body together. */
  json: <T = Record<string, unknown>>(
    method: string, endpoint: string, token?: string | null, body?: unknown,
  ) => Promise<{ status: number; body: T; text: string }>;
  /** Protected-row snapshot: the five orphan attendance rows and outside-lab employees. */
  protectedRows: () => Promise<unknown>;
}

interface StartOptions {
  /** Short label that appears in the clone's name. */
  label: string;
  /** Skip booting Express, for suites that only exercise SQL. */
  withApp?: boolean;
  /**
   * Leave the clone at the baseline so the suite can migrate in stages, e.g.
   * to prove a new migration is additive against the state just before it.
   */
  migrate?: boolean;
}

/**
 * CREATE DATABASE ... TEMPLATE refuses while another session is connected to
 * the template, which is exactly what happens when several suites start at
 * once. That was the intermittent recorded in V2. Retrying on the specific
 * SQLSTATE (55006, object in use) is the fix rather than serialising suites.
 */
async function cloneFromBaseline(admin: pg.Pool, name: string): Promise<void> {
  assert.match(name, /^hr_nexus_[a-z0-9_]+$/);
  for (let attempt = 1; ; attempt += 1) {
    try {
      await admin.query(`CREATE DATABASE "${name}" TEMPLATE "${SETTINGS_BASELINE}"`);
      return;
    } catch (error) {
      if ((error as { code?: string }).code !== "55006" || attempt >= 40) throw error;
      await new Promise((resolve) => setTimeout(resolve, 150 + Math.floor(Math.random() * 250)));
    }
  }
}

/**
 * Runs `body` against a fresh, fully migrated clone.
 *
 * A passing suite drops what it created; a failing one keeps its clone for
 * inspection, the same rule every V2 suite follows through `dropLabClones`.
 */
export async function withLab(
  t: { diagnostic: (message: string) => void },
  options: StartOptions,
  body: (lab: LabContext) => Promise<void>,
): Promise<void> {
  const suffix = randomBytes(5).toString("hex");
  const admin = new pg.Pool({ host: LAB_HOST, user: "postgres", database: "postgres" });
  const database = `hr_nexus_${options.label}_${suffix}`;
  let db: pg.Pool | undefined;
  let appPool: pg.Pool | undefined;
  let server: Server | undefined;
  let completed = false;

  try {
    await cloneFromBaseline(admin, database);
    db = new pg.Pool({ host: LAB_HOST, user: "postgres", database });
    if (options.migrate !== false) await runMigrations(db, { mode: "apply", database });

    let origin = "";
    if (options.withApp !== false) {
      process.env.DATABASE_URL = `postgresql://postgres@${LAB_HOST}/${database}`;
      process.env.JWT_SECRET = randomBytes(32).toString("hex");
      const { default: app } = await import("../src/app.js");
      ({ default: appPool } = await import("../src/config/db.js"));
      server = app.listen(0, "127.0.0.1");
      await once(server, "listening");
      const address = server.address();
      assert.ok(address && typeof address !== "string");
      origin = `http://127.0.0.1:${address.port}/api`;
    }

    const pool = db;
    const call: LabContext["call"] = (method, endpoint, token, body) => fetch(`${origin}${endpoint}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      ...(body === undefined || method === "GET" ? {} : { body: JSON.stringify(body) }),
    });

    await body({
      db: pool,
      database,
      origin,
      sign: (userId, role, employeeId) => jwt.sign(
        { role, employeeId }, process.env.JWT_SECRET!, { subject: String(userId), expiresIn: "40m" },
      ),
      call,
      json: async (method, endpoint, token, requestBody) => {
        const response = await call(method, endpoint, token, requestBody);
        const text = await response.text();
        let parsed: unknown = null;
        try { parsed = text ? JSON.parse(text) : null; } catch { parsed = null; }
        return { status: response.status, body: parsed as never, text };
      },
      protectedRows: async () => ({
        orphans: (await pool.query(
          `SELECT id, employee_id, md5(to_jsonb(a)::text) AS digest FROM public.attendance a
           WHERE NOT EXISTS (SELECT 1 FROM public.employees e WHERE e.id = a.employee_id)
           ORDER BY id`,
        )).rows,
        sourceEmployees: (await pool.query(
          "SELECT id, employee_number, full_name FROM public.employees WHERE id < 1000 ORDER BY id",
        )).rows,
      }),
    });
    completed = true;
  } finally {
    if (server) { server.close(); await once(server, "close"); }
    await appPool?.end();
    await db?.end();
    await dropLabClones(admin, suffix, completed, t);
    await admin.end();
  }
}

/**
 * Applies the chain only up to and including `lastVersion`, from byte-identical
 * copies of the reviewed files, so the ledger it writes is exactly what the
 * full chain expects to find when it continues afterwards.
 */
export async function applyMigrationsUpTo(
  db: pg.Pool, database: string, lastVersion: string,
): Promise<string[]> {
  const directory = await mkdtemp(path.join(os.tmpdir(), "hr-nexus-stage-"));
  try {
    for (const migration of await loadMigrations()) {
      if (migration.version > lastVersion) break;
      await copyFile(new URL(migration.filename, defaultMigrationDirectory), path.join(directory, migration.filename));
    }
    return (await runMigrations(db, { mode: "apply", database, directory })).newlyApplied;
  } finally {
    await rm(directory, { recursive: true });
  }
}

/** Tables whose rows V2 put there and V3 must never rewrite. */
const businessTables = [
  "departments", "employees", "users", "leave_requests", "attendance", "company_settings",
  "leave_policies", "leave_entitlements", "employee_compensation", "payroll_periods",
  "payroll_records", "payroll_items", "audit_events", "import_jobs",
];

export type BusinessSnapshot = {
  columns: Record<string, string[]>;
  tables: Record<string, { count: number; digest: string }>;
  sequences: Record<string, string>;
};

/**
 * Row counts and complete content digests of every V2 business table, plus
 * business sequence positions. Pass an earlier snapshot to compare only the
 * columns that existed then, so an additive migration's new NULL column is not
 * mistaken for business drift - while any change to an existing value is.
 */
export async function businessSnapshot(db: pg.Pool, since?: BusinessSnapshot): Promise<BusinessSnapshot> {
  const columns: Record<string, string[]> = {};
  const tables: Record<string, { count: number; digest: string }> = {};
  for (const table of businessTables) {
    const present = (await db.query(
      "SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 ORDER BY ordinal_position",
      [table],
    )).rows.map((row) => row.column_name as string);
    columns[table] = since?.columns[table] ?? present;
    const added = present.filter((column) => !columns[table]!.includes(column));
    const row = (await db.query(
      `SELECT count(*)::int AS count,
              md5(COALESCE(string_agg((to_jsonb(t) - $1::text[])::text, '|' ORDER BY (to_jsonb(t) - $1::text[])::text), '')) AS digest
       FROM public.${table} t`,
      [added],
    )).rows[0];
    tables[table] = { count: row.count, digest: row.digest };
  }
  const sequences: Record<string, string> = {};
  for (const row of (await db.query(
    "SELECT sequencename, COALESCE(last_value, 0)::text AS last_value FROM pg_sequences WHERE schemaname='public' ORDER BY 1",
  )).rows) {
    if (!since || row.sequencename in since.sequences) sequences[row.sequencename] = row.last_value;
  }
  return { columns, tables, sequences };
}

/** Standard fixture password hash: unusable for sign-in, fine for token tests. */
export const UNUSABLE_HASH = "unusable-lab-hash";
