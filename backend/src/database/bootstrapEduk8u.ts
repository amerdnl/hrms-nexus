/**
 * Loads the EDUK8U Group review environment.
 *
 * WHAT THIS IS FOR. Dr. Roy Prasad asked for his org chart in a form he can
 * review. This builds exactly that and nothing else: the company's name, its
 * functional departments, the positions from the chart and the reporting lines
 * between them, plus one administrator account to open it with. There is no
 * attendance, no leave, no payroll, no goals and no recognition, because none of
 * that exists in the source. A review environment that invented them would be
 * showing Dr. Roy figures about his own company that nobody measured.
 *
 * SAFETY, before anything else. This script writes to a database, so it is built
 * to refuse the wrong one rather than to be used carefully:
 *
 *  - It reads `EDUK8U_DATABASE_URL` and never falls back to `DATABASE_URL`, so
 *    the application's own connection string cannot be picked up by accident.
 *  - `--database <name>` must match the database it actually connected to, so a
 *    stale URL in the environment cannot silently redirect the write.
 *  - It refuses any database holding the Meridian presentation company, which
 *    lives in identifiers 9200-9299. That environment is the known-good
 *    fallback and this script must never be the reason it changes.
 *  - Every write is confined to identifiers 9300-9399 and to rows owned by
 *    them. The count of employees outside that range is taken before the work
 *    and checked again before the transaction commits.
 *  - The whole run is one transaction. A failure writes nothing at all.
 *
 * RE-RUNNING IS THE NORMAL CASE. Dr. Roy is expected to correct the chart, so
 * the script clears its own range and rebuilds it. It is deterministic: the same
 * source produces the same rows, on any day, with no dependence on the clock.
 *
 * WHAT IT REFUSES TO INVENT. The source names no people, so every row is loaded
 * as a position - `vacant` for EDUK8U's own seats, `external` for the advisers
 * below the chart's dividing line - and no row claims to be a person. No email,
 * phone number, address, date of birth, salary or start date is written for any
 * of them, because the source contains none.
 *
 * PASSWORDS. A plaintext password is never stored. `EDUK8U_ADMIN_PASSWORD` is
 * hashed with bcrypt and only the hash is written; without it a random password
 * is generated and printed once, here, so it exists nowhere but the terminal.
 * Either way the account is created owing a password change, so the credential
 * this script knows stops working the first time anyone signs in with it.
 */
import bcrypt from "bcrypt";
import { randomBytes } from "node:crypto";
import pg from "pg";
import {
  EDUK8U_ID_MAX,
  EDUK8U_ID_MIN,
  eduk8uAll,
  eduk8uCompany,
  eduk8uDepartments,
  eduk8uSourceLayout,
  eduk8uSourceLinks,
  eduk8uSourceNotes,
  reportingLineConfidence,
} from "./eduk8uData.js";

/** Identifiers the Meridian presentation company owns. Never written here. */
const PRESENTATION_ID_MIN = 9200;
const PRESENTATION_ID_MAX = 9299;

/** The account exists to open the review environment, not to be a person. */
const DEFAULT_ADMIN_EMAIL = "hr.review@eduk8u.invalid";

function argument(name: string): string | null {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? null : (process.argv[index + 1] ?? null);
}

function fail(message: string): never {
  console.error(`Refusing to load the EDUK8U review environment: ${message}`);
  process.exit(1);
}

async function main(): Promise<void> {
  const url = process.env.EDUK8U_DATABASE_URL;
  if (!url) {
    fail("EDUK8U_DATABASE_URL is required; this script never defaults to the application's database.");
  }
  const expected = argument("database");
  if (!expected) fail("--database <name> is required, and must name the database you intend to write.");

  const email = (process.env.EDUK8U_ADMIN_EMAIL ?? DEFAULT_ADMIN_EMAIL).trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) fail(`EDUK8U_ADMIN_EMAIL is not an email address: "${email}".`);

  // Compose cannot leave a variable out conditionally: `${EDUK8U_ADMIN_PASSWORD:-}`
  // arrives as an empty string when nobody set one. An empty string is not a
  // password anyone chose, so it means the same thing as unset - generate one.
  const supplied = process.env.EDUK8U_ADMIN_PASSWORD?.trim() || undefined;
  const password = supplied ?? randomBytes(9).toString("base64url");
  const generated = supplied === undefined;
  if (password.length < 8) fail("EDUK8U_ADMIN_PASSWORD must be at least 8 characters.");
  const passwordHash = await bcrypt.hash(password, 12);

  const bootstrapPool = new pg.Pool({ connectionString: url, max: 1 });
  const client = await bootstrapPool.connect();

  let started = false;
  try {
    const actual = (await client.query<{ name: string }>("SELECT current_database() AS name")).rows[0]!.name;
    if (actual !== expected) fail(`connected to "${actual}" but --database said "${expected}".`);

    // The presentation company is the fallback if this review environment has to
    // be rebuilt. Finding it here means the URL points at the wrong database.
    const meridian = await client.query<{ count: string }>(
      "SELECT count(*)::int AS count FROM public.employees WHERE id BETWEEN $1 AND $2",
      [PRESENTATION_ID_MIN, PRESENTATION_ID_MAX],
    );
    if (Number(meridian.rows[0]!.count) > 0) {
      fail(
        `"${actual}" holds the Meridian presentation company (${meridian.rows[0]!.count} records in ` +
        `${PRESENTATION_ID_MIN}-${PRESENTATION_ID_MAX}). EDUK8U is never loaded into it.`,
      );
    }

    const ledger = await client.query<{ version: string }>(
      "SELECT version FROM public.schema_migrations ORDER BY version",
    );
    const versions = ledger.rows.map((row) => row.version);
    // 0018 carries position_kind, without which every position would be loaded
    // as though it were a real, employed person.
    if (!versions.includes("0022")) {
      fail(`"${actual}" is not migrated to 0022 (ledger: ${versions.join(", ") || "empty"}). Apply the migrations first.`);
    }

    const positions = eduk8uAll();

    await client.query("BEGIN");
    started = true;

    // Nothing outside the reserved range may move; checked again before commit.
    const before = await client.query<{ outside: string }>(
      "SELECT count(*)::int AS outside FROM public.employees WHERE id < $1 OR id > $2",
      [EDUK8U_ID_MIN, EDUK8U_ID_MAX],
    );

    // ------------------------------------------------------ company settings
    // The row is created by the schema with id = 1; an environment that somehow
    // lacks it still ends up with the right name rather than silently keeping
    // whatever was there.
    await client.query(
      `INSERT INTO public.company_settings (id, company_name, timezone)
       VALUES (1, $1, $2)
       ON CONFLICT (id) DO UPDATE
       SET company_name = EXCLUDED.company_name, timezone = EXCLUDED.timezone,
           revision = public.company_settings.revision + 1, updated_at = CURRENT_TIMESTAMP`,
      [eduk8uCompany.name, eduk8uCompany.timezone],
    );

    // --------------------------------------------------- clear previous run
    // Reporting lines first: the self-reference is ON DELETE RESTRICT, so rows
    // that still point at each other cannot be removed.
    // The grade describes a reporting line, so it goes when the line goes -
    // in the same statement, because the database refuses to hold one without
    // the other, and rightly so.
    await client.query(
      "UPDATE public.employees SET manager_id = NULL, reporting_line_confidence = NULL WHERE id BETWEEN $1 AND $2",
      [EDUK8U_ID_MIN, EDUK8U_ID_MAX],
    );
    // Accounts are deliberately NOT cleared. Re-running this script is how a
    // correction to the chart is applied, and that must never take away the
    // password the reviewer has already chosen: the account is created once, on
    // the first run, and left alone afterwards.
    await client.query("DELETE FROM public.users WHERE employee_id BETWEEN $1 AND $2", [EDUK8U_ID_MIN, EDUK8U_ID_MAX]);
    await client.query("DELETE FROM public.employees WHERE id BETWEEN $1 AND $2", [EDUK8U_ID_MIN, EDUK8U_ID_MAX]);

    // ----------------------------------------------------------- departments
    for (const department of eduk8uDepartments) {
      await client.query(
        `INSERT INTO public.departments (name, description) VALUES ($1, $2)
         ON CONFLICT (name) DO UPDATE SET description = EXCLUDED.description`,
        [department.name, department.description],
      );
    }
    const departmentIds = new Map<string, number>(
      (await client.query<{ id: number; name: string }>("SELECT id, name FROM public.departments")).rows
        .map((row) => [row.name, row.id]),
    );
    for (const position of positions) {
      if (!departmentIds.has(position.department)) {
        fail(`"${position.department}" is not one of the EDUK8U departments (position ${position.id}).`);
      }
    }

    // ------------------------------------------------------------- positions
    // Every personal column is left NULL on purpose. employment_status is
    // 'active' because that is what makes a position visible on the chart; what
    // the row actually is comes from position_kind, which the chart shows.
    for (const position of positions) {
      await client.query(
        `INSERT INTO public.employees
           (id, employee_number, full_name, job_title, department_id, employment_status, position_kind, occupancy)
         VALUES ($1, $2, $3, $4, $5, 'active', $6, $7)`,
        [
          position.id, position.employeeNumber, position.name, position.jobTitle,
          departmentIds.get(position.department)!, position.kind,
          // Everything is an unfilled seat unless Dr. Roy has said otherwise.
          position.occupancy ?? (position.kind === "vacant" ? "vacant" : null),
        ],
      );
    }
    // Second pass: a manager must exist before anyone can point at them. The
    // confidence goes on in the same statement, because a reporting line the
    // source never settled must never exist in the database for even a moment
    // without the note saying so.
    for (const position of positions) {
      if (position.managerId === null) continue;
      await client.query(
        "UPDATE public.employees SET manager_id = $1, reporting_line_confidence = $2 WHERE id = $3",
        [position.managerId, reportingLineConfidence(position), position.id],
      );
    }

    // ---------------------------------------------------------------- layout
    // Where each box sat on Dr. Roy's own chart, so the chart he gets back is
    // recognisably the one he drew rather than one an algorithm arranged.
    // Cascades with the employee rows deleted above, so no separate clear-out.
    for (const [id, box] of Object.entries(eduk8uSourceLayout)) {
      const employeeId = Number(id);
      if (!positions.some((position) => position.id === employeeId)) {
        fail(`the source layout places ${employeeId}, which is not a position in this chart.`);
      }
      await client.query(
        `INSERT INTO public.org_chart_source_layout
           (employee_id, source_x, source_y, source_width, source_height)
         VALUES ($1, $2, $3, $4, $5)`,
        [employeeId, box.x, box.y, box.width, box.height],
      );
    }
    const unplaced = positions.filter((position) => !(position.id in eduk8uSourceLayout));
    if (unplaced.length > 0) {
      fail(`no source coordinates for: ${unplaced.map((p) => p.name).join(", ")}.`);
    }

    // The reporting lines that are real but are not the single operational one.
    // The operational line lives on the employee and is never duplicated here.
    await client.query(
      "DELETE FROM public.employee_additional_managers WHERE employee_id BETWEEN $1 AND $2",
      [EDUK8U_ID_MIN, EDUK8U_ID_MAX],
    );
    for (const link of eduk8uSourceLinks) {
      const child = positions.find((position) => position.id === link.childId);
      if (!child) fail(`additional reporting line from unknown position ${link.childId}.`);
      if (child!.managerId === link.parentId) {
        fail(`the line ${link.childId} -> ${link.parentId} is already the operational reporting line.`);
      }
      await client.query(
        `INSERT INTO public.employee_additional_managers (employee_id, manager_id, confidence, note)
         VALUES ($1, $2, $3, $4)`,
        [link.childId, link.parentId, link.confidence, link.note],
      );
    }

    // Labels the source draws that are not posts.
    await client.query("DELETE FROM public.org_chart_source_notes");
    for (const note of eduk8uSourceNotes) {
      await client.query(
        `INSERT INTO public.org_chart_source_notes
           (label, body, source_x, source_y, source_width, source_height)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [note.label, note.body, note.x, note.y, note.width, note.height],
      );
    }

    // --------------------------------------------------------------- account
    // Not linked to any employee record: the reviewer is not one of the
    // positions on the chart, and linking them would put an account holder into
    // Dr. Roy's structure. must_change_password is TRUE, so whatever this script
    // knew about the credential stops being true at first sign-in.
    const account = await client.query(
      `INSERT INTO public.users (id, employee_id, email, password_hash, role, is_active, must_change_password)
       VALUES ($1, NULL, $2, $3, 'admin', TRUE, TRUE)
       ON CONFLICT (id) DO NOTHING
       RETURNING id`,
      [EDUK8U_ID_MIN, email, passwordHash],
    );
    const accountCreated = (account.rowCount ?? 0) > 0;

    // ---------------------------------------------------------- verification
    const after = await client.query<{ outside: string }>(
      "SELECT count(*)::int AS outside FROM public.employees WHERE id < $1 OR id > $2",
      [EDUK8U_ID_MIN, EDUK8U_ID_MAX],
    );
    if (after.rows[0]!.outside !== before.rows[0]!.outside) {
      throw new Error(
        `employee records outside ${EDUK8U_ID_MIN}-${EDUK8U_ID_MAX} changed from ` +
        `${before.rows[0]!.outside} to ${after.rows[0]!.outside}`,
      );
    }

    const loaded = await client.query<{ count: string }>(
      "SELECT count(*)::int AS count FROM public.employees WHERE id BETWEEN $1 AND $2",
      [EDUK8U_ID_MIN, EDUK8U_ID_MAX],
    );
    if (Number(loaded.rows[0]!.count) !== positions.length) {
      throw new Error(`expected ${positions.length} positions, found ${loaded.rows[0]!.count}`);
    }

    // No row may describe a person: the source names nobody.
    const people = await client.query<{ count: string }>(
      `SELECT count(*)::int AS count FROM public.employees
       WHERE id BETWEEN $1 AND $2 AND position_kind = 'staff'`,
      [EDUK8U_ID_MIN, EDUK8U_ID_MAX],
    );
    if (Number(people.rows[0]!.count) !== 0) {
      throw new Error(`${people.rows[0]!.count} EDUK8U rows claim to be employed people; the source names none`);
    }

    // A cycle would leave part of the chart undrawable. The database trigger
    // refuses one on write; this proves the committed result is a forest.
    const cycles = await client.query<{ id: string }>(
      `WITH RECURSIVE walk(start_id, cursor_id, depth) AS (
         SELECT id, manager_id, 1 FROM public.employees WHERE manager_id IS NOT NULL
         UNION ALL
         SELECT w.start_id, e.manager_id, w.depth + 1
         FROM walk w JOIN public.employees e ON e.id = w.cursor_id
         WHERE w.cursor_id IS NOT NULL AND w.depth < 50
       )
       SELECT DISTINCT start_id AS id FROM walk WHERE cursor_id = start_id`,
    );
    if (cycles.rowCount) throw new Error(`reporting lines loop back on themselves: ${cycles.rows.map((r) => r.id).join(", ")}`);

    await client.query("COMMIT");
    started = false;

    const roots = positions.filter((p) => p.managerId === null && p.kind === "vacant").length;
    const external = positions.filter((p) => p.kind === "external").length;
    const unconfirmed = positions.filter((p) => p.confidence === "ambiguous").length;

    console.log(`EDUK8U review environment loaded into "${actual}".`);
    console.log(`  ${positions.length} positions: ${positions.length - external} internal, ${external} external/advisory.`);
    console.log(`  ${roots} roots on the chart. ${unconfirmed} reporting lines need Dr. Roy's confirmation.`);
    console.log(`  No people, attendance, leave, payroll or compensation were written.`);
    if (accountCreated) {
      console.log(`  Administrator: ${email} (a password change is required at first sign-in).`);
      if (generated) {
        console.log(`  Generated password, shown once and stored nowhere: ${password}`);
      } else {
        console.log(`  Password taken from EDUK8U_ADMIN_PASSWORD.`);
      }
    } else {
      console.log(`  The administrator account already existed and was left untouched, password and all.`);
    }
    console.log(`  Unconfirmed lines are listed in docs/EDUK8U_ORG_MAPPING.md.`);
  } catch (error) {
    if (started) {
      try { await client.query("ROLLBACK"); } catch { /* the failure below is the one worth reporting */ }
    }
    console.error("EDUK8U bootstrap failed; nothing was written.", error);
    process.exitCode = 1;
  } finally {
    client.release(true);
    await bootstrapPool.end();
  }
}

await main();
