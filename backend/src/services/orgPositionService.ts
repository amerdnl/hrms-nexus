/**
 * Maintaining the organisation chart: creating positions, filling and emptying
 * them, and recording who reports to whom.
 *
 * WHAT A POSITION IS HERE. The chart is drawn from employees rows, so a position
 * is one of those - but it is not always a person. `position_kind` says what the
 * row is (a person employed here, a seat, an outside firm) and `occupancy` says
 * whether the seat is taken. Keeping them apart is the point: an administrator
 * can record that a post is filled without naming anybody, and nothing in here
 * will invent an occupant to make a column look complete.
 *
 * WHAT THIS DELIBERATELY DOES NOT DO. It never creates a user account, never
 * writes pay, attendance or leave, and never touches anything outside the
 * employees row, its notes and its extra reporting lines. Changing the chart is
 * not a way to give somebody a login.
 */
import type { PoolClient } from "pg";
import pool from "../config/db.js";
import { VISIBLE_STATUSES } from "../auth/policy.js";

export class OrgPositionError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly fields?: Record<string, string>,
  ) {
    super(message);
    this.name = "OrgPositionError";
  }
}

export type PositionKind = "staff" | "vacant" | "external";
export type Occupancy = "vacant" | "filled" | "filled_unnamed";

export interface PositionInput {
  title: string;
  departmentId: number | null;
  positionKind: PositionKind;
  occupancy: Occupancy;
  /** Only meaningful when the seat is filled by somebody who has been named. */
  occupantName: string | null;
  managerId: number | null;
  additionalManagerIds: number[];
  notes: string | null;
}

const KINDS: PositionKind[] = ["staff", "vacant", "external"];
const OCCUPANCIES: Occupancy[] = ["vacant", "filled", "filled_unnamed"];

/** Validates the caller's input and returns it cleaned, or throws with fields. */
export function parsePosition(body: Record<string, unknown>): PositionInput {
  const fields: Record<string, string> = {};

  const title = typeof body.title === "string" ? body.title.trim() : "";
  if (!title) fields.title = "A position needs a title.";
  else if (title.length > 150) fields.title = "Keep the title to 150 characters or fewer.";

  const positionKind = String(body.positionKind ?? "vacant") as PositionKind;
  if (!KINDS.includes(positionKind)) fields.positionKind = "Choose a valid position type.";

  const occupancy = String(body.occupancy ?? "vacant") as Occupancy;
  if (!OCCUPANCIES.includes(occupancy)) fields.occupancy = "Choose whether the position is filled or vacant.";

  const occupantName = typeof body.occupantName === "string" && body.occupantName.trim()
    ? body.occupantName.trim()
    : null;
  if (occupantName !== null && occupantName.length > 150) {
    fields.occupantName = "Keep the name to 150 characters or fewer.";
  }
  // The one rule that stops a chart edit inventing a colleague: naming somebody
  // is what makes a row a person, so it cannot be done without saying so.
  if (occupancy === "filled" && occupantName === null) {
    fields.occupantName = "Name whoever holds this position, or mark it filled without details.";
  }
  if (occupancy !== "filled" && occupantName !== null) {
    fields.occupantName = "Only a position filled by a named person carries a name.";
  }
  if (occupancy === "filled" && positionKind !== "staff") {
    fields.positionKind = "A position held by a named person is a member of staff.";
  }

  const notes = typeof body.notes === "string" && body.notes.trim() ? body.notes.trim() : null;
  if (notes !== null && notes.length > 2000) fields.notes = "Keep notes to 2000 characters or fewer.";

  const asId = (value: unknown): number | null => {
    if (value === null || value === undefined || value === "") return null;
    const id = Number(value);
    return Number.isInteger(id) && id > 0 ? id : Number.NaN;
  };

  const managerId = asId(body.managerId);
  if (Number.isNaN(managerId)) fields.managerId = "Choose a valid manager.";

  const raw = Array.isArray(body.additionalManagerIds) ? body.additionalManagerIds : [];
  const additional: number[] = [];
  for (const entry of raw) {
    const id = asId(entry);
    if (id === null || Number.isNaN(id)) {
      fields.additionalManagerIds = "Choose valid people for the additional reporting lines.";
      break;
    }
    if (!additional.includes(id)) additional.push(id);
  }
  if (managerId !== null && additional.includes(managerId)) {
    fields.additionalManagerIds = "That person is already the primary manager.";
  }

  if (Object.keys(fields).length > 0) {
    throw new OrgPositionError(422, "validation_failed", "Check the position details.", fields);
  }

  return {
    title,
    departmentId: asId(body.departmentId) || null,
    positionKind,
    occupancy,
    occupantName,
    managerId: managerId ?? null,
    additionalManagerIds: additional,
    notes,
  };
}

/**
 * The name the chart shows. A named occupant is the person; anything else is the
 * position itself, which is why the title is used and no name is invented.
 */
const displayName = (input: PositionInput) =>
  input.occupancy === "filled" && input.occupantName ? input.occupantName : input.title;

async function assertManagersExist(client: PoolClient, ids: number[]): Promise<void> {
  if (ids.length === 0) return;
  const found = await client.query<{ id: string }>(
    "SELECT id FROM public.employees WHERE id = ANY($1::int[]) AND employment_status = ANY($2::text[])",
    [ids, VISIBLE_STATUSES],
  );
  if (found.rowCount !== ids.length) {
    throw new OrgPositionError(422, "unknown_manager", "One of the chosen managers is not on the chart.", {
      managerId: "That person is not on the chart.",
    });
  }
}

/**
 * Refuses an extra reporting line that would loop back on itself.
 *
 * The database's own trigger guards employees.manager_id, but it cannot see
 * this table, and a chart whose lines form a ring cannot be drawn.
 */
async function assertNoLoop(client: PoolClient, employeeId: number, managerIds: number[]): Promise<void> {
  if (managerIds.length === 0) return;
  const result = await client.query<{ id: string }>(
    `WITH RECURSIVE above(id, depth) AS (
       SELECT unnest($2::int[])::bigint, 1
       UNION
       SELECT COALESCE(a.manager_id, e.manager_id)::bigint, above.depth + 1
       FROM above
       JOIN public.employees e ON e.id = above.id
       LEFT JOIN LATERAL (
         SELECT manager_id FROM public.employee_additional_managers WHERE employee_id = above.id LIMIT 1
       ) a ON TRUE
       WHERE above.depth < 60 AND COALESCE(a.manager_id, e.manager_id) IS NOT NULL
     )
     SELECT id FROM above WHERE id = $1 LIMIT 1`,
    [employeeId, managerIds],
  );
  if (result.rowCount) {
    throw new OrgPositionError(409, "reporting_loop", "That reporting line would loop back on itself.", {
      additionalManagerIds: "This person is already above the one you chose.",
    });
  }
}

async function replaceAdditionalManagers(
  client: PoolClient,
  employeeId: number,
  managerIds: number[],
): Promise<void> {
  await assertManagersExist(client, managerIds);
  await assertNoLoop(client, employeeId, managerIds);
  await client.query("DELETE FROM public.employee_additional_managers WHERE employee_id = $1", [employeeId]);
  for (const managerId of managerIds) {
    await client.query(
      `INSERT INTO public.employee_additional_managers (employee_id, manager_id, confidence)
       VALUES ($1, $2, 'confirmed')`,
      [employeeId, managerId],
    );
  }
}

/** The next free identifier, kept clear of any reserved demonstration range. */
async function nextPositionId(client: PoolClient): Promise<number> {
  const result = await client.query<{ next: string }>(
    "SELECT COALESCE(MAX(id), 0) + 1 AS next FROM public.employees",
  );
  return Number(result.rows[0]!.next);
}

export async function createPosition(
  client: PoolClient,
  input: PositionInput,
): Promise<{ id: number; fullName: string }> {
  if (input.managerId !== null) await assertManagersExist(client, [input.managerId]);
  const id = await nextPositionId(client);
  const number = `POS-${String(id).padStart(4, "0")}`;

  // Every personal column is left alone. A position created on the org chart
  // carries a title and a place in the structure, and nothing about a person.
  await client.query(
    `INSERT INTO public.employees
       (id, employee_number, full_name, job_title, department_id, employment_status,
        position_kind, occupancy, position_notes, manager_id)
     VALUES ($1, $2, $3, $4, $5, 'active', $6, $7, $8, $9)`,
    [
      id, number, displayName(input),
      input.occupancy === "filled" ? input.title : null,
      input.departmentId, input.positionKind, input.occupancy, input.notes, input.managerId,
    ],
  );
  await replaceAdditionalManagers(client, id, input.additionalManagerIds);

  // A company whose chart is laid out by hand needs somewhere to put the new
  // card, or it would be created and then be invisible. Just below its manager,
  // which is where somebody adding a direct report is looking.
  const usesLayout = await client.query<{ count: string }>(
    "SELECT count(*)::int AS count FROM public.org_chart_source_layout",
  );
  if (Number(usesLayout.rows[0]!.count) > 0) {
    const anchor = input.managerId === null ? null : (await client.query<{ x: string; y: string }>(
      "SELECT source_x AS x, source_y AS y FROM public.org_chart_source_layout WHERE employee_id = $1",
      [input.managerId],
    )).rows[0] ?? null;
    const x = anchor ? Number(anchor.x) : 0.2;
    const y = anchor ? Number(anchor.y) + 1.3 : 0.2;
    await client.query(
      `INSERT INTO public.org_chart_source_layout (employee_id, source_x, source_y, source_width, source_height)
       VALUES ($1, $2, $3, 1.34, 0.6) ON CONFLICT (employee_id) DO NOTHING`,
      [id, x, y],
    );
  }
  return { id, fullName: displayName(input) };
}

export interface PositionBefore {
  id: number;
  full_name: string;
  job_title: string | null;
  department_id: string | null;
  position_kind: string;
  occupancy: string | null;
  position_notes: string | null;
  manager_id: string | null;
  employee_number: string;
}

export async function loadPosition(client: PoolClient, id: number): Promise<PositionBefore> {
  const result = await client.query<PositionBefore>(
    `SELECT id, full_name, job_title, department_id, position_kind, occupancy,
            position_notes, manager_id, employee_number
     FROM public.employees WHERE id = $1 FOR UPDATE`,
    [id],
  );
  const row = result.rows[0];
  if (!row) throw new OrgPositionError(404, "not_found", "That position is not on the chart.");
  return row;
}

export async function updatePosition(
  client: PoolClient,
  id: number,
  input: PositionInput,
): Promise<{ fullName: string }> {
  if (input.managerId !== null) {
    if (input.managerId === id) {
      throw new OrgPositionError(422, "self_manager", "A position cannot report to itself.", {
        managerId: "Choose someone other than this position.",
      });
    }
    await assertManagersExist(client, [input.managerId]);
  }

  await client.query(
    `UPDATE public.employees
     SET full_name = $2, job_title = $3, department_id = $4, position_kind = $5,
         occupancy = $6, position_notes = $7, manager_id = $8,
         reporting_line_confidence = CASE WHEN $8::int IS NULL THEN NULL ELSE 'confirmed' END,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $1`,
    [
      id, displayName(input),
      input.occupancy === "filled" ? input.title : null,
      input.departmentId, input.positionKind, input.occupancy, input.notes, input.managerId,
    ],
  );
  await replaceAdditionalManagers(client, id, input.additionalManagerIds);
  return { fullName: displayName(input) };
}

/**
 * Takes a position off the chart without destroying its history.
 *
 * Archiving rather than deleting, because employees rows are referenced from
 * ten other tables and because a post that existed is a fact about the
 * organisation. An archived position leaves the chart because the chart only
 * draws active and probation records.
 */
export async function archivePosition(client: PoolClient, id: number): Promise<void> {
  const reports = await client.query<{ count: string }>(
    `SELECT count(*)::int AS count FROM public.employees
     WHERE manager_id = $1 AND employment_status = ANY($2::text[])`,
    [id, VISIBLE_STATUSES],
  );
  if (Number(reports.rows[0]!.count) > 0) {
    throw new OrgPositionError(
      409, "has_reports",
      "Move the positions reporting to this one before archiving it.",
    );
  }
  await client.query(
    `UPDATE public.employees
     SET employment_status = 'inactive', updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
    [id],
  );
  await client.query("DELETE FROM public.employee_additional_managers WHERE employee_id = $1", [id]);
}

/** Everyone a position also reports to, for the chart. */
export async function additionalManagers(
  db: Pick<PoolClient, "query"> = pool,
): Promise<Array<{ employeeId: number; managerId: number; confidence: string }>> {
  const result = await db.query(
    `SELECT a.employee_id, a.manager_id, a.confidence
     FROM public.employee_additional_managers a
     JOIN public.employees e ON e.id = a.employee_id
     JOIN public.employees m ON m.id = a.manager_id
     WHERE e.employment_status = ANY($1::text[]) AND m.employment_status = ANY($1::text[])
     ORDER BY a.employee_id, a.manager_id`,
    [VISIBLE_STATUSES],
  );
  return result.rows.map((row) => ({
    employeeId: Number(row.employee_id),
    managerId: Number(row.manager_id),
    confidence: row.confidence,
  }));
}
