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
import type { Server } from "node:http";
import jwt from "jsonwebtoken";
import pg from "pg";
import { runMigrations } from "../src/database/migrations.js";
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
    await runMigrations(db, { mode: "apply", database });

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

/** Standard fixture password hash: unusable for sign-in, fine for token tests. */
export const UNUSABLE_HASH = "unusable-lab-hash";
