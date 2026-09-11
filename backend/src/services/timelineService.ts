/**
 * The employee timeline: what happened to a person, for people.
 *
 * Distinct from the audit log, which is for investigation. A timeline event is
 * written by the service that owns the change, inside its transaction, and
 * carries a visibility tier:
 *
 *   company     every signed-in colleague
 *   self        the employee and HR
 *   management  the employee's manager and HR
 *
 * Writes are contained by a SAVEPOINT exactly like `recordAudit`: a timeline
 * failure must never roll back the business change that produced it, and a
 * change must never be committed without trying to record it.
 */
import type { Pool, PoolClient } from "pg";
import pool from "../config/db.js";
import type { Relation } from "../auth/policy.js";
import { sanitize } from "../utils/auditRedaction.js";

type Db = Pick<PoolClient, "query"> | Pool;

/** A closed list, like audit actions, so the timeline stays filterable. */
export const timelineKinds = [
  "job_title_changed",
  "department_changed",
  "manager_changed",
  "status_changed",
  "onboarding_started",
  "onboarding_completed",
  "offboarding_started",
  "offboarding_completed",
  "recognition_received",
  "goal_completed",
  "review_completed",
] as const;

export type TimelineKind = (typeof timelineKinds)[number];
export type TimelineVisibility = "company" | "self" | "management";

export interface TimelineInput {
  employeeId: number;
  kind: TimelineKind;
  visibility: TimelineVisibility;
  /** The company date the event belongs to, YYYY-MM-DD. */
  occurredOn: string;
  title: string;
  detail?: Record<string, unknown> | null;
  /** What produced it; with an id, a repeated delivery is recorded once. */
  sourceType?: string | null;
  sourceId?: string | number | null;
  actorUserId?: number | null;
}

const MAX_DETAIL_BYTES = 2048;

/** Records one event; never throws. */
export async function recordTimelineEvent(input: TimelineInput, db: Db = pool): Promise<void> {
  const transactional = "release" in db;
  // Redacted by the same key rules as the audit log, then bounded: a detail is
  // a small fact ("from Engineer to Senior Engineer"), never a request body.
  let detail = input.detail ? sanitize(input.detail) : null;
  if (detail && Buffer.byteLength(JSON.stringify(detail), "utf8") > MAX_DETAIL_BYTES) detail = null;

  try {
    if (transactional) await db.query("SAVEPOINT hr_nexus_timeline");
    await db.query(
      `INSERT INTO public.employee_events
         (employee_id, kind, visibility, occurred_on, title, detail, source_type, source_id, actor_user_id)
       VALUES ($1, $2, $3, $4::date, $5, $6::jsonb, $7, $8, $9)
       ON CONFLICT (employee_id, kind, source_type, source_id) WHERE source_id IS NOT NULL DO NOTHING`,
      [
        input.employeeId, input.kind, input.visibility, input.occurredOn,
        input.title.slice(0, 200),
        detail === null ? null : JSON.stringify(detail),
        input.sourceType ?? null,
        input.sourceId === null || input.sourceId === undefined ? null : String(input.sourceId).slice(0, 64),
        input.actorUserId ?? null,
      ],
    );
    if (transactional) await db.query("RELEASE SAVEPOINT hr_nexus_timeline");
  } catch (error) {
    console.error(`Timeline write failed for ${input.kind}:`, error);
    if (transactional) {
      try {
        await db.query("ROLLBACK TO SAVEPOINT hr_nexus_timeline");
      } catch (rollbackError) {
        console.error("Timeline savepoint rollback failed:", rollbackError);
      }
    }
  }
}

/** The tiers a relation may read. HR reads everything; a colleague only company. */
export function visibleTiers(relation: Relation): TimelineVisibility[] {
  if (relation === "admin") return ["company", "self", "management"];
  if (relation === "self") return ["company", "self"];
  if (relation === "manager") return ["company", "management"];
  return ["company"];
}

export interface TimelineEntry {
  id: string;
  kind: TimelineKind | "joined";
  visibility: TimelineVisibility;
  occurredOn: string;
  title: string;
  detail: unknown;
}

/**
 * A person's timeline as the viewer may see it, newest first.
 *
 * "Joined" is derived from the employment date rather than stored, so every
 * existing employee has a first entry without any back-fill. Recognition that
 * HR has hidden disappears from every timeline it touched.
 */
export async function listTimeline(
  employeeId: number,
  relation: Relation,
  limit = 50,
  db: Db = pool,
): Promise<TimelineEntry[]> {
  const tiers = visibleTiers(relation);
  const hasRecognition = (await db.query("SELECT to_regclass('public.recognitions') IS NOT NULL AS present"))
    .rows[0]?.present === true;

  const events = await db.query<{
    id: string; kind: TimelineKind; visibility: TimelineVisibility; occurred_on: string;
    title: string; detail: unknown;
  }>(
    `SELECT ev.id::text, ev.kind, ev.visibility, ev.occurred_on::text AS occurred_on, ev.title, ev.detail
     FROM public.employee_events ev
     WHERE ev.employee_id = $1 AND ev.visibility = ANY($2::text[])
       ${hasRecognition ? `AND NOT (ev.source_type = 'recognition' AND EXISTS (
         SELECT 1 FROM public.recognitions r WHERE r.id::text = ev.source_id AND r.hidden_at IS NOT NULL))` : ""}
     ORDER BY ev.occurred_on DESC, ev.id DESC
     LIMIT $3`,
    [employeeId, tiers, limit],
  );

  const entries: TimelineEntry[] = events.rows.map((row) => ({
    id: row.id,
    kind: row.kind,
    visibility: row.visibility,
    occurredOn: row.occurred_on,
    title: row.title,
    detail: row.detail,
  }));

  const joined = await db.query<{ employment_date: string | null }>(
    "SELECT employment_date::text AS employment_date FROM public.employees WHERE id = $1",
    [employeeId],
  );
  const employmentDate = joined.rows[0]?.employment_date ?? null;
  if (employmentDate && entries.length < limit) {
    entries.push({
      id: `joined-${employeeId}`,
      kind: "joined",
      visibility: "company",
      occurredOn: employmentDate,
      title: "Joined the company",
      detail: null,
    });
  }
  return entries;
}
