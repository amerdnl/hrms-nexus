/**
 * Recognition: a short, professional thank-you from one colleague to another.
 *
 * Who sees a recognition:
 *
 *   company   anyone in the working company, while both people are in it
 *   private   the giver, the receiver and HR
 *   hidden    HR only (moderation); it leaves every feed, profile and timeline
 *
 * Limits keep it from becoming a feed to farm: one recognition from the same
 * giver to the same colleague per company day (a database rule), and five given
 * per person per day (checked under a per-giver lock). Words are never
 * rewritten; the database refuses it.
 */
import type { Pool, PoolClient } from "pg";
import pool from "../config/db.js";
import { VISIBLE_STATUSES } from "../auth/policy.js";
import type { AuthenticatedUser } from "../types/auth.js";
import { companyToday } from "../utils/companyClock.js";
import { actorFromUser, recordAudit } from "./auditService.js";
import { accountsOfEmployees, notify } from "./notificationService.js";
import { recordTimelineEvent } from "./timelineService.js";

type Db = Pick<PoolClient, "query"> | Pool;

export const recognitionCategories = {
  teamwork: "Teamwork",
  above_and_beyond: "Above and beyond",
  customer_focus: "Customer focus",
  problem_solving: "Problem solving",
  mentoring: "Mentoring",
} as const;

export type RecognitionCategory = keyof typeof recognitionCategories;
export const DAILY_GIVING_LIMIT = 5;

export class RecognitionError extends Error {
  constructor(public status: number, public code: string, message: string, public errors?: Record<string, string>) {
    super(message);
  }
}

export interface RecognitionInput {
  receiverId: number;
  category: RecognitionCategory;
  message: string;
  visibility: "company" | "private";
}

interface Row {
  id: string; category: RecognitionCategory; message: string; visibility: "company" | "private";
  given_on: string; created_at: Date; hidden_at: Date | null;
  giver_id: string; giver_name: string; giver_title: string | null; giver_image: string | null; giver_status: string;
  receiver_id: string; receiver_name: string; receiver_title: string | null; receiver_image: string | null; receiver_status: string;
}

const select = `SELECT r.id, r.category, r.message, r.visibility, r.given_on::text AS given_on, r.created_at, r.hidden_at,
    g.id AS giver_id, g.full_name AS giver_name, g.job_title AS giver_title, g.profile_image AS giver_image, g.employment_status AS giver_status,
    v.id AS receiver_id, v.full_name AS receiver_name, v.job_title AS receiver_title, v.profile_image AS receiver_image, v.employment_status AS receiver_status
  FROM public.recognitions r
  JOIN public.employees g ON g.id = r.giver_employee_id
  JOIN public.employees v ON v.id = r.receiver_employee_id`;

function toItem(row: Row, user: AuthenticatedUser) {
  const isAdmin = user.role === "admin";
  return {
    id: Number(row.id),
    category: row.category,
    categoryLabel: recognitionCategories[row.category],
    message: row.message,
    visibility: row.visibility,
    givenOn: row.given_on,
    createdAt: row.created_at.toISOString(),
    giver: { id: Number(row.giver_id), fullName: row.giver_name, jobTitle: row.giver_title, profileImage: row.giver_image },
    receiver: { id: Number(row.receiver_id), fullName: row.receiver_name, jobTitle: row.receiver_title, profileImage: row.receiver_image },
    isGiver: user.employeeId !== null && Number(row.giver_id) === user.employeeId,
    isReceiver: user.employeeId !== null && Number(row.receiver_id) === user.employeeId,
    // Moderation state is HR's business only.
    hidden: isAdmin ? row.hidden_at !== null : undefined,
  };
}

/**
 * The visibility rule over alias `r`, `g` (giver) and `v` (receiver), for a
 * caller who is not HR. Parameters are appended to `params`.
 */
function visibleTo(user: AuthenticatedUser, params: unknown[]): string {
  if (user.role === "admin") return "TRUE";
  params.push(user.employeeId, VISIBLE_STATUSES);
  const me = `$${params.length - 1}::int`;
  const working = `$${params.length}::text[]`;
  return `r.hidden_at IS NULL AND (
    (r.visibility = 'company' AND g.employment_status = ANY(${working}) AND v.employment_status = ANY(${working}))
    OR r.giver_employee_id = ${me} OR r.receiver_employee_id = ${me}
  )`;
}

export async function giveRecognition(client: PoolClient, user: AuthenticatedUser, input: RecognitionInput) {
  const giverId = user.employeeId;
  if (giverId === null) {
    throw new RecognitionError(403, "no_employee_record", "Recognition is given by employees. This account has no employee record.");
  }
  if (input.receiverId === giverId) {
    throw new RecognitionError(400, "self", "Recognise a colleague, not yourself.", { receiverId: "Choose someone other than yourself." });
  }
  const people = await client.query<{ id: string; full_name: string; employment_status: string }>(
    "SELECT id, full_name, employment_status FROM public.employees WHERE id = ANY($1::int[])",
    [[giverId, input.receiverId]],
  );
  const giver = people.rows.find((row) => Number(row.id) === giverId);
  const receiver = people.rows.find((row) => Number(row.id) === input.receiverId);
  if (!receiver || !(VISIBLE_STATUSES as readonly string[]).includes(receiver.employment_status)) {
    throw new RecognitionError(404, "not_found", "Person not found", { receiverId: "That colleague is not in the directory." });
  }

  // Serialise this giver's recognitions so two at once cannot both pass the limit.
  await client.query("SELECT pg_advisory_xact_lock(hashtext('hr_nexus:recognition'), $1)", [giverId]);
  const today = await companyToday(client);
  const given = await client.query<{ count: number }>(
    "SELECT count(*)::int AS count FROM public.recognitions WHERE giver_employee_id = $1 AND given_on = $2",
    [giverId, today],
  );
  if ((given.rows[0]?.count ?? 0) >= DAILY_GIVING_LIMIT) {
    throw new RecognitionError(429, "daily_limit", `You can give ${DAILY_GIVING_LIMIT} recognitions a day. Try again tomorrow.`);
  }

  let id: number;
  try {
    await client.query("SAVEPOINT hr_nexus_recognition");
    const created = await client.query<{ id: string }>(
      `INSERT INTO public.recognitions (giver_employee_id, receiver_employee_id, category, message, visibility, given_on, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [giverId, input.receiverId, input.category, input.message, input.visibility, today, user.id],
    );
    await client.query("RELEASE SAVEPOINT hr_nexus_recognition");
    id = Number(created.rows[0]!.id);
  } catch (error) {
    await client.query("ROLLBACK TO SAVEPOINT hr_nexus_recognition");
    const pg = error as { code?: string; constraint?: string };
    if (pg.code === "23505" && pg.constraint === "recognitions_once_a_day") {
      throw new RecognitionError(409, "already_today", `You have already recognised ${receiver.full_name} today.`);
    }
    throw error;
  }

  const label = recognitionCategories[input.category];
  await recordTimelineEvent({
    employeeId: input.receiverId,
    kind: "recognition_received",
    // A private thank-you stays between the two of them (and HR).
    visibility: input.visibility === "company" ? "company" : "self",
    occurredOn: today,
    title: input.visibility === "company" ? `Recognised for ${label} by ${giver?.full_name ?? "a colleague"}` : `Recognised for ${label}`,
    sourceType: "recognition",
    sourceId: id,
    actorUserId: user.id,
  }, client);

  const excerpt = input.message.replace(/\s+/g, " ").trim();
  await notify(await accountsOfEmployees([input.receiverId], client), {
    kind: "recognition_received",
    title: `${giver?.full_name ?? "A colleague"} recognised you for ${label}`,
    body: excerpt.length > 140 ? `${excerpt.slice(0, 139)}…` : excerpt,
    link: "/recognition?view=received",
    entityType: "recognition",
    entityId: id,
    dedupeKey: `recognition:${id}`,
    actorUserId: user.id,
  }, client);

  return { id, givenToday: (given.rows[0]?.count ?? 0) + 1, dailyLimit: DAILY_GIVING_LIMIT };
}

export type FeedView = "company" | "received" | "given" | "all";

export async function listRecognition(
  user: AuthenticatedUser,
  options: { view: FeedView; page: number; pageSize: number },
  db: Db = pool,
) {
  const params: unknown[] = [];
  let where: string;
  if (options.view === "all") {
    // HR's moderation view: everything, hidden included.
    where = "TRUE";
  } else if (options.view === "company") {
    params.push(VISIBLE_STATUSES);
    where = `r.visibility = 'company' AND r.hidden_at IS NULL
      AND g.employment_status = ANY($1::text[]) AND v.employment_status = ANY($1::text[])`;
  } else {
    params.push(user.employeeId);
    where = `r.hidden_at IS NULL AND r.${options.view === "received" ? "receiver" : "giver"}_employee_id = $1::int`;
  }
  const count = await db.query<{ total: number }>(
    `SELECT count(*)::int AS total FROM public.recognitions r
     JOIN public.employees g ON g.id = r.giver_employee_id
     JOIN public.employees v ON v.id = r.receiver_employee_id
     WHERE ${where}`,
    params,
  );
  params.push(options.pageSize, (options.page - 1) * options.pageSize);
  const rows = await db.query<Row>(
    `${select} WHERE ${where} ORDER BY r.created_at DESC, r.id DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );

  let givenToday: number | null = null;
  if (user.employeeId !== null) {
    const today = await companyToday(db);
    const given = await db.query<{ count: number }>(
      "SELECT count(*)::int AS count FROM public.recognitions WHERE giver_employee_id = $1 AND given_on = $2",
      [user.employeeId, today],
    );
    givenToday = given.rows[0]?.count ?? 0;
  }

  return {
    items: rows.rows.map((row) => toItem(row, user)),
    total: count.rows[0]?.total ?? 0,
    page: options.page,
    pageSize: options.pageSize,
    givenToday,
    dailyLimit: DAILY_GIVING_LIMIT,
  };
}

/** Recognition someone received, as the caller may see it on their profile. */
export async function recognitionForProfile(employeeId: number, user: AuthenticatedUser, limit = 20, db: Db = pool) {
  const params: unknown[] = [employeeId];
  const condition = user.role === "admin" ? "r.hidden_at IS NULL" : visibleTo(user, params);
  params.push(limit);
  const rows = await db.query<Row>(
    `${select} WHERE r.receiver_employee_id = $1 AND ${condition}
     ORDER BY r.created_at DESC, r.id DESC LIMIT $${params.length}`,
    params,
  );
  const counts = await db.query<{ category: RecognitionCategory; count: number }>(
    `SELECT r.category, count(*)::int AS count
     FROM public.recognitions r
     JOIN public.employees g ON g.id = r.giver_employee_id
     JOIN public.employees v ON v.id = r.receiver_employee_id
     WHERE r.receiver_employee_id = $1 AND ${condition}
     GROUP BY r.category`,
    params.slice(0, -1),
  );
  return {
    items: rows.rows.map((row) => toItem(row, user)),
    byCategory: counts.rows.map((row) => ({ category: row.category, label: recognitionCategories[row.category], count: row.count })),
  };
}

export async function setHidden(client: PoolClient, id: number, hidden: boolean, user: AuthenticatedUser) {
  const existing = await client.query<{ hidden_at: Date | null; giver_employee_id: string; receiver_employee_id: string; category: string }>(
    "SELECT hidden_at, giver_employee_id, receiver_employee_id, category FROM public.recognitions WHERE id = $1 FOR UPDATE",
    [id],
  );
  const row = existing.rows[0];
  if (!row) throw new RecognitionError(404, "not_found", "Recognition not found");
  if ((row.hidden_at !== null) === hidden) return { changed: false };

  await client.query(
    hidden
      ? "UPDATE public.recognitions SET hidden_at = CURRENT_TIMESTAMP, hidden_by = $2 WHERE id = $1"
      : "UPDATE public.recognitions SET hidden_at = NULL, hidden_by = NULL WHERE id = $1",
    hidden ? [id, user.id] : [id],
  );
  await recordAudit({
    actor: actorFromUser(user, user.email),
    action: hidden ? "RECOGNITION_HIDDEN" : "RECOGNITION_RESTORED",
    entityType: "recognition",
    entityId: id,
    summary: `${hidden ? "Hid" : "Restored"} ${row.category} recognition from employee #${row.giver_employee_id} to employee #${row.receiver_employee_id}`,
    // Who and what kind, never the words themselves.
    changes: { hidden: { before: !hidden, after: hidden } },
  }, client);
  return { changed: true };
}
