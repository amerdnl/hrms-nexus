/**
 * The company directory, social profiles and the org chart.
 *
 * Everything here is the SOCIAL layer from the permission matrix, and nothing
 * more: name, photo, job title, department, reporting line, work email, About,
 * skills, join date, and a phone number only when its owner chose to share it.
 * Each query names its columns, so a sensitive column added to `employees`
 * later cannot leak here by accident. Date of birth, address, gender,
 * emergency contacts, pay, attendance, leave and account state are never
 * selected.
 *
 * Only the working company is visible: active and probation employees. A former
 * employee is HR history, reachable by HR through the admin record.
 */
import type { Pool, PoolClient } from "pg";
import pool from "../config/db.js";
import { VISIBLE_STATUSES, type Relation } from "../auth/policy.js";

type Db = Pick<PoolClient, "query"> | Pool;

/** Escapes LIKE wildcards so a search for "50%" means the characters, not a pattern. */
export function likePattern(term: string): string {
  return `%${term.replace(/[\\%_]/g, (character) => `\\${character}`)}%`;
}

/**
 * What an employees row describes, from employees.position_kind. `staff` is a
 * person employed here and is what every ordinary record carries; `vacant` is a
 * position on the org chart that nobody holds, whose name is the position label;
 * `external` is a consultant or firm who appears on the chart without being
 * employed here. The interface shows the two exceptions so a placeholder is
 * never read as a colleague.
 */
export type PositionKind = "staff" | "vacant" | "external";

/**
 * How well established an employee's reporting line is, when something has
 * graded it (employees.reporting_line_confidence, migration 0019). Null is the
 * ordinary case: nobody graded it, so the chart shows the line plainly.
 * `unconfirmed` means the source the chart was transcribed from does not settle
 * the line, and the chart says so rather than asserting it.
 */
export type ReportingLineConfidence = "confirmed" | "inferred" | "unconfirmed";

const toConfidence = (value: unknown): ReportingLineConfidence | null =>
  value === "confirmed" || value === "inferred" || value === "unconfirmed" ? value : null;

const toPositionKind = (value: unknown): PositionKind =>
  value === "vacant" || value === "external" ? value : "staff";

export interface PersonCard {
  id: number;
  fullName: string;
  jobTitle: string | null;
  departmentId: number | null;
  departmentName: string | null;
  profileImage: string | null;
  skills: string[];
  positionKind: PositionKind;
}

export interface DirectoryPage {
  people: PersonCard[];
  total: number;
  page: number;
  pageSize: number;
  departments: Array<{ id: number; name: string; people: number }>;
}

const toCard = (row: {
  id: string | number; full_name: string; job_title: string | null;
  department_id: string | number | null; department_name: string | null;
  profile_image: string | null; skills?: string[] | null; position_kind?: string | null;
}): PersonCard => ({
  id: Number(row.id),
  fullName: row.full_name,
  jobTitle: row.job_title,
  departmentId: row.department_id === null ? null : Number(row.department_id),
  departmentName: row.department_name,
  profileImage: row.profile_image,
  skills: row.skills ?? [],
  positionKind: toPositionKind(row.position_kind),
});

export async function directory(
  query: { search: string | null; departmentId: number | null; page: number; pageSize: number },
  db: Db = pool,
): Promise<DirectoryPage> {
  const parameters: unknown[] = [VISIBLE_STATUSES];
  const clauses: string[] = ["e.employment_status = ANY($1::text[])"];

  if (query.search) {
    parameters.push(likePattern(query.search));
    const p = `$${parameters.length}`;
    // Skills are searchable: "who knows payroll?" is exactly what a directory
    // is for.
    clauses.push(`(e.full_name ILIKE ${p} OR e.job_title ILIKE ${p} OR d.name ILIKE ${p}
      OR EXISTS (SELECT 1 FROM unnest(p.skills) AS skill WHERE skill ILIKE ${p}))`);
  }
  if (query.departmentId !== null) {
    parameters.push(query.departmentId);
    clauses.push(`e.department_id = $${parameters.length}`);
  }

  parameters.push(query.pageSize, (query.page - 1) * query.pageSize);
  const result = await db.query(
    `SELECT e.id, e.full_name, e.job_title, e.department_id, d.name AS department_name,
            e.profile_image, e.position_kind, p.skills, count(*) OVER () AS total
     FROM public.employees e
     LEFT JOIN public.departments d ON d.id = e.department_id
     LEFT JOIN public.employee_profiles p ON p.employee_id = e.id
     WHERE ${clauses.join(" AND ")}
     ORDER BY e.full_name, e.id
     LIMIT $${parameters.length - 1} OFFSET $${parameters.length}`,
    parameters,
  );

  let total = Number(result.rows[0]?.total ?? 0);
  if (result.rows.length === 0 && query.page > 1) {
    // count(*) OVER () vanishes with the rows on a page past the end.
    total = Number((await db.query(
      `SELECT count(*)::int AS total FROM public.employees e
       LEFT JOIN public.departments d ON d.id = e.department_id
       LEFT JOIN public.employee_profiles p ON p.employee_id = e.id
       WHERE ${clauses.join(" AND ")}`,
      parameters.slice(0, -2),
    )).rows[0]?.total ?? 0);
  }

  const departments = await db.query(
    `SELECT d.id, d.name, count(e.id)::int AS people
     FROM public.departments d
     JOIN public.employees e ON e.department_id = d.id AND e.employment_status = ANY($1::text[])
     GROUP BY d.id, d.name ORDER BY d.name`,
    [VISIBLE_STATUSES],
  );

  return {
    people: result.rows.map(toCard),
    total,
    page: query.page,
    pageSize: query.pageSize,
    departments: departments.rows.map((row) => ({ id: Number(row.id), name: row.name, people: row.people })),
  };
}

export interface PersonLink {
  id: number;
  fullName: string;
  jobTitle: string | null;
  profileImage: string | null;
}

/**
 * Which other areas the relation may open for this person. Advisory for the
 * page, which uses it to avoid firing requests it knows will be refused; every
 * one of those areas authorises again on its own.
 */
export function layersFor(relation: Relation): string[] {
  if (relation === "self") return ["social", "self"];
  if (relation === "manager") return ["social", "team"];
  if (relation === "admin") return ["social", "hr"];
  return ["social"];
}

export interface SocialProfile {
  relation: Relation;
  layers: string[];
  person: {
    id: number;
    fullName: string;
    jobTitle: string | null;
    department: { id: number; name: string } | null;
    profileImage: string | null;
    workEmail: string | null;
    phone: string | null;
    sharesPhone: boolean;
    about: string | null;
    skills: string[];
    employmentDate: string | null;
    /** Only for the person themselves and for HR; colleagues are never told. */
    employmentStatus: string | null;
  };
  manager: PersonLink | null;
  directReports: PersonLink[];
  peers: PersonLink[];
  /** From the top of the reporting lines down to this person's manager. */
  chain: PersonLink[];
}

const toLink = (row: { id: string | number; full_name: string; job_title: string | null; profile_image: string | null }): PersonLink => ({
  id: Number(row.id), fullName: row.full_name, jobTitle: row.job_title, profileImage: row.profile_image,
});

/**
 * One person's social profile. The caller has already established the relation
 * through `relationTo`, which is also what decides a former employee is
 * visible to HR only.
 */
export async function socialProfile(
  employeeId: number,
  relation: Relation,
  db: Db = pool,
): Promise<SocialProfile | null> {
  const found = await db.query(
    `SELECT e.id, e.full_name, e.job_title, e.department_id, d.name AS department_name,
            e.profile_image, e.phone, e.employment_date::text AS employment_date,
            e.employment_status, e.manager_id,
            u.email AS work_email, p.about, p.skills, COALESCE(p.share_phone, FALSE) AS share_phone
     FROM public.employees e
     LEFT JOIN public.departments d ON d.id = e.department_id
     LEFT JOIN public.users u ON u.employee_id = e.id
     LEFT JOIN public.employee_profiles p ON p.employee_id = e.id
     WHERE e.id = $1`,
    [employeeId],
  );
  const row = found.rows[0];
  if (!row) return null;

  // Visible people only, for every link off this profile: a reporting line to
  // someone who has left does not reveal them.
  const [manager, reports, peers, chain] = await Promise.all([
    row.manager_id === null ? Promise.resolve({ rows: [] }) : db.query(
      `SELECT id, full_name, job_title, profile_image FROM public.employees
       WHERE id = $1 AND employment_status = ANY($2::text[])`,
      [row.manager_id, VISIBLE_STATUSES],
    ),
    db.query(
      `SELECT id, full_name, job_title, profile_image FROM public.employees
       WHERE manager_id = $1 AND employment_status = ANY($2::text[])
       ORDER BY full_name, id`,
      [employeeId, VISIBLE_STATUSES],
    ),
    row.manager_id === null ? Promise.resolve({ rows: [] }) : db.query(
      `SELECT id, full_name, job_title, profile_image FROM public.employees
       WHERE manager_id = $1 AND id <> $2 AND employment_status = ANY($3::text[])
       ORDER BY full_name, id LIMIT 12`,
      [row.manager_id, employeeId, VISIBLE_STATUSES],
    ),
    // Upward through visible managers only, bounded like the database guard.
    db.query(
      `WITH RECURSIVE up AS (
         SELECT m.id, m.full_name, m.job_title, m.profile_image, m.manager_id, 1 AS depth
         FROM public.employees e JOIN public.employees m ON m.id = e.manager_id
         WHERE e.id = $1 AND m.employment_status = ANY($2::text[])
         UNION ALL
         SELECT m.id, m.full_name, m.job_title, m.profile_image, m.manager_id, up.depth + 1
         FROM up JOIN public.employees m ON m.id = up.manager_id
         WHERE up.depth < 100 AND m.employment_status = ANY($2::text[])
       )
       SELECT id, full_name, job_title, profile_image FROM up ORDER BY depth DESC`,
      [employeeId, VISIBLE_STATUSES],
    ),
  ]);

  const seesStatus = relation === "self" || relation === "admin";
  return {
    relation,
    layers: layersFor(relation),
    person: {
      id: Number(row.id),
      fullName: row.full_name,
      jobTitle: row.job_title,
      department: row.department_id === null ? null : { id: Number(row.department_id), name: row.department_name },
      profileImage: row.profile_image,
      workEmail: row.work_email ?? null,
      // Shared by choice; the person always sees their own, so they can decide.
      phone: row.share_phone || relation === "self" ? row.phone : null,
      sharesPhone: row.share_phone === true,
      about: row.about ?? null,
      skills: row.skills ?? [],
      employmentDate: row.employment_date,
      employmentStatus: seesStatus ? row.employment_status : null,
    },
    manager: manager.rows[0] ? toLink(manager.rows[0]) : null,
    directReports: reports.rows.map(toLink),
    peers: peers.rows.map(toLink),
    chain: chain.rows.map(toLink),
  };
}

export interface OrgNode extends PersonLink {
  departmentName: string | null;
  /** Null when there is no visible manager: a root of the chart. */
  managerId: number | null;
  /** Staff, an unfilled position, or an external party. See PositionKind. */
  positionKind: PositionKind;
  /**
   * How far the line to `managerId` can be trusted, when it has been graded.
   * Null while nobody has, which is every ordinary HR record.
   */
  reportingLineConfidence: ReportingLineConfidence | null;
  /**
   * Whether the seat is taken: `vacant`, `filled` by the person named here, or
   * `filled_unnamed` when somebody holds it and who has not been recorded.
   * Null for an ordinary employee, where the question does not apply.
   */
  occupancy: "vacant" | "filled" | "filled_unnamed" | null;
  /** An administrator's note about the role. Never about a person. */
  notes: string | null;
  departmentId: number | null;
  /** Everyone this position also reports to, beyond its primary manager. */
  alsoReportsTo: number[];
}

/**
 * The whole visible organisation as a flat list; the client builds the tree.
 * Social fields only. A manager who has left does not appear, so their former
 * reports surface as roots rather than hanging from someone invisible.
 */
/** A box's place on the chart this company was transcribed from. */
export interface OrgLayoutBox {
  id: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

/** A labelled box on the source chart that describes no post. */
export interface OrgSourceNote {
  id: number;
  label: string;
  body: string | null;
  x: number;
  y: number;
  width: number;
  height: number;
}

/** A line the source draws which is not the employee's reporting line. */
export interface OrgSourceLink {
  childId: number;
  parentId: number;
  confidence: ReportingLineConfidence;
  note: string | null;
}

/**
 * The source drawing's own layout, when this company was built from one.
 *
 * Empty for a company that was not, which is how the chart decides to lay itself
 * out automatically instead. Nothing here is hierarchy: it is where boxes sat on
 * a page.
 */
export async function orgChartSourceLayout(
  db: Db = pool,
): Promise<{ boxes: OrgLayoutBox[]; links: OrgSourceLink[]; notes: OrgSourceNote[] }> {
  const [boxes, links, notes] = await Promise.all([
    db.query(
      `SELECT l.employee_id, l.source_x, l.source_y, l.source_width, l.source_height
       FROM public.org_chart_source_layout l
       JOIN public.employees e ON e.id = l.employee_id
       WHERE e.employment_status = ANY($1::text[])
       ORDER BY l.employee_id`,
      [VISIBLE_STATUSES],
    ),
    // The extra reporting lines as the chart needs them: with their grade, so a
    // line somebody has not confirmed can be drawn as one.
    db.query(
      `SELECT a.employee_id AS child_employee_id, a.manager_id AS parent_employee_id,
              a.confidence, a.note
       FROM public.employee_additional_managers a
       JOIN public.employees c ON c.id = a.employee_id
       JOIN public.employees p ON p.id = a.manager_id
       WHERE c.employment_status = ANY($1::text[]) AND p.employment_status = ANY($1::text[])
       ORDER BY a.employee_id, a.manager_id`,
      [VISIBLE_STATUSES],
    ),
    db.query(
      `SELECT id, label, body, source_x, source_y, source_width, source_height
       FROM public.org_chart_source_notes ORDER BY id`,
    ),
  ]);
  return {
    notes: notes.rows.map((row) => ({
      id: Number(row.id),
      label: row.label,
      body: row.body,
      x: Number(row.source_x),
      y: Number(row.source_y),
      width: Number(row.source_width),
      height: Number(row.source_height),
    })),
    boxes: boxes.rows.map((row) => ({
      id: Number(row.employee_id),
      x: Number(row.source_x),
      y: Number(row.source_y),
      width: Number(row.source_width),
      height: Number(row.source_height),
    })),
    links: links.rows.map((row) => ({
      childId: Number(row.child_employee_id),
      parentId: Number(row.parent_employee_id),
      confidence: toConfidence(row.confidence) ?? "unconfirmed",
      note: row.note,
    })),
  };
}

/**
 * The company's own name, for the heading on a chart that leaves the building.
 * Not a secret - it is the name of the organisation the reader works for - and
 * it is read here rather than from company settings so that every signed-in
 * role can load the chart, not only an administrator.
 */
export async function orgChartCompany(db: Db = pool): Promise<string | null> {
  const result = await db.query<{ company_name: string | null }>(
    "SELECT company_name FROM public.company_settings WHERE id = 1",
  );
  return result.rows[0]?.company_name ?? null;
}

export async function orgChart(db: Db = pool): Promise<OrgNode[]> {
  // The extra reporting lines are read alongside the chart: they are part of
  // the picture, and deliberately part of nothing else.
  const extraRows = await db.query(
    `SELECT a.employee_id, a.manager_id
     FROM public.employee_additional_managers a
     JOIN public.employees e ON e.id = a.employee_id AND e.employment_status = ANY($1::text[])
     JOIN public.employees m ON m.id = a.manager_id AND m.employment_status = ANY($1::text[])
     ORDER BY a.employee_id, a.manager_id`,
    [VISIBLE_STATUSES],
  );
  const extra = new Map<number, number[]>();
  for (const row of extraRows.rows) {
    const key = Number(row.employee_id);
    extra.set(key, [...(extra.get(key) ?? []), Number(row.manager_id)]);
  }

  const result = await db.query(
    `SELECT e.id, e.full_name, e.job_title, e.profile_image, d.name AS department_name,
            e.position_kind, e.occupancy, e.position_notes, e.department_id,
            CASE WHEN m.id IS NOT NULL THEN e.manager_id END AS manager_id,
            CASE WHEN m.id IS NOT NULL THEN e.reporting_line_confidence END AS reporting_line_confidence
     FROM public.employees e
     LEFT JOIN public.departments d ON d.id = e.department_id
     LEFT JOIN public.employees m ON m.id = e.manager_id AND m.employment_status = ANY($1::text[])
     WHERE e.employment_status = ANY($1::text[])
     ORDER BY e.full_name, e.id
     LIMIT 5000`,
    [VISIBLE_STATUSES],
  );
  return result.rows.map((row) => ({
    ...toLink(row),
    departmentName: row.department_name,
    managerId: row.manager_id === null ? null : Number(row.manager_id),
    positionKind: toPositionKind(row.position_kind),
    reportingLineConfidence: toConfidence(row.reporting_line_confidence),
    occupancy:
      row.occupancy === "vacant" || row.occupancy === "filled" || row.occupancy === "filled_unnamed"
        ? row.occupancy
        : null,
    notes: row.position_notes ?? null,
    departmentId: row.department_id === null ? null : Number(row.department_id),
    alsoReportsTo: extra.get(Number(row.id)) ?? [],
  }));
}
