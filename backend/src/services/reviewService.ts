/**
 * Performance reviews.
 *
 * HR drafts a cycle and opens it for the working company (or one department),
 * which creates one review per person. Each review runs in order: the employee
 * submits a self-review, then their CURRENT manager submits theirs (HR does so
 * only for someone with no manager), then the employee may respond.
 *
 * Who reads what:
 *   the employee   their self-review; the manager review once it is submitted;
 *                  their response
 *   the manager    a report's self-review once submitted; their own review,
 *                  draft or submitted; the response
 *   HR             everything - and every read of review content is audited
 *   anyone else    nothing: not found
 *
 * Lists never carry review content; only the detail endpoint does.
 */
import type { Pool, PoolClient } from "pg";
import pool from "../config/db.js";
import { VISIBLE_STATUSES } from "../auth/policy.js";
import type { AuthenticatedUser } from "../types/auth.js";
import { companyToday } from "../utils/companyClock.js";
import { formatDay } from "../utils/dateText.js";
import type { CycleInput, ReviewWriteInput } from "../utils/performanceValidation.js";
import { ratingLabels } from "../utils/performanceValidation.js";
import { actorFromUser, recordAudit } from "./auditService.js";
import { accountsOfEmployees, adminAccounts, managerAccountOf, notify } from "./notificationService.js";
import { recordTimelineEvent } from "./timelineService.js";

type Db = Pick<PoolClient, "query"> | Pool;

export class ReviewError extends Error {
  constructor(public status: number, public code: string, message: string, public errors?: Record<string, string>) {
    super(message);
  }
}

const visible = (status: string) => (VISIBLE_STATUSES as readonly string[]).includes(status);

// ------------------------------------------------------------ cycles (HR)

interface CycleRow {
  id: string; name: string; period_start: string; period_end: string; self_due_on: string; manager_due_on: string;
  status: string; opened_at: Date | null; closed_at: Date | null; revision: number;
  participants: number; pending_self: number; pending_manager: number; completed: number;
}

const cycleSelect = `SELECT c.id, c.name, c.period_start::text AS period_start, c.period_end::text AS period_end,
    c.self_due_on::text AS self_due_on, c.manager_due_on::text AS manager_due_on, c.status, c.opened_at, c.closed_at, c.revision,
    count(p.id)::int AS participants,
    count(p.id) FILTER (WHERE p.status = 'pending_self')::int AS pending_self,
    count(p.id) FILTER (WHERE p.status = 'pending_manager')::int AS pending_manager,
    count(p.id) FILTER (WHERE p.status = 'completed')::int AS completed
  FROM public.review_cycles c LEFT JOIN public.review_participants p ON p.cycle_id = c.id`;

function toCycle(row: CycleRow) {
  return {
    id: Number(row.id), name: row.name, periodStart: row.period_start, periodEnd: row.period_end,
    selfDueOn: row.self_due_on, managerDueOn: row.manager_due_on, status: row.status,
    openedAt: row.opened_at ? row.opened_at.toISOString() : null,
    closedAt: row.closed_at ? row.closed_at.toISOString() : null,
    revision: row.revision,
    counts: { participants: row.participants, pendingSelf: row.pending_self, pendingManager: row.pending_manager, completed: row.completed },
  };
}

export async function listCycles(db: Db = pool) {
  const result = await db.query<CycleRow>(`${cycleSelect} GROUP BY c.id ORDER BY (c.status = 'open') DESC, c.period_end DESC, c.id DESC LIMIT 100`);
  return result.rows.map(toCycle);
}

function duplicateName(error: unknown) {
  const pg = error as { code?: string; constraint?: string };
  return pg.code === "23505" && pg.constraint === "review_cycles_name_once";
}

export async function createCycle(client: PoolClient, user: AuthenticatedUser, input: CycleInput) {
  try {
    await client.query("SAVEPOINT hr_nexus_cycle");
    const created = await client.query<{ id: string }>(
      `INSERT INTO public.review_cycles (name, period_start, period_end, self_due_on, manager_due_on, created_by)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [input.name, input.periodStart, input.periodEnd, input.selfDueOn, input.managerDueOn, user.id],
    );
    await client.query("RELEASE SAVEPOINT hr_nexus_cycle");
    const id = Number(created.rows[0]!.id);
    await recordAudit({
      actor: actorFromUser(user, user.email), action: "REVIEW_CYCLE_CREATED", entityType: "review_cycle", entityId: id,
      summary: `Drafted review cycle "${input.name}"`,
      changes: { period_start: input.periodStart, period_end: input.periodEnd, self_due_on: input.selfDueOn, manager_due_on: input.managerDueOn },
    }, client);
    return id;
  } catch (error) {
    await client.query("ROLLBACK TO SAVEPOINT hr_nexus_cycle");
    if (duplicateName(error)) throw new ReviewError(409, "duplicate_name", `There is already a cycle called "${input.name}".`, { name: "That name is already in use." });
    throw error;
  }
}

async function lockCycle(client: PoolClient, id: number) {
  const result = await client.query<{ id: string; name: string; status: string; revision: number; self_due_on: string; manager_due_on: string }>(
    "SELECT id, name, status, revision, self_due_on::text AS self_due_on, manager_due_on::text AS manager_due_on FROM public.review_cycles WHERE id = $1 FOR UPDATE",
    [id],
  );
  return result.rows[0] ?? null;
}

export async function updateCycle(client: PoolClient, user: AuthenticatedUser, id: number, input: CycleInput) {
  const cycle = await lockCycle(client, id);
  if (!cycle) throw new ReviewError(404, "not_found", "Review cycle not found");
  if (cycle.status !== "draft") throw new ReviewError(409, "not_draft", "Only a draft cycle can be edited.");
  if (cycle.revision !== input.revision) throw new ReviewError(409, "stale_revision", "This cycle changed since you opened it. Reload to see it.");
  try {
    await client.query("SAVEPOINT hr_nexus_cycle");
    await client.query(
      `UPDATE public.review_cycles SET name = $2, period_start = $3, period_end = $4, self_due_on = $5, manager_due_on = $6,
         updated_at = CURRENT_TIMESTAMP, revision = revision + 1 WHERE id = $1`,
      [id, input.name, input.periodStart, input.periodEnd, input.selfDueOn, input.managerDueOn],
    );
    await client.query("RELEASE SAVEPOINT hr_nexus_cycle");
  } catch (error) {
    await client.query("ROLLBACK TO SAVEPOINT hr_nexus_cycle");
    if (duplicateName(error)) throw new ReviewError(409, "duplicate_name", `There is already a cycle called "${input.name}".`, { name: "That name is already in use." });
    throw error;
  }
  await recordAudit({
    actor: actorFromUser(user, user.email), action: "REVIEW_CYCLE_UPDATED", entityType: "review_cycle", entityId: id,
    summary: `Edited draft review cycle "${input.name}"`,
    changes: { name: cycle.name === input.name ? undefined : { before: cycle.name, after: input.name } },
  }, client);
}

export async function openCycle(client: PoolClient, user: AuthenticatedUser, id: number, departmentId: number | null) {
  const cycle = await lockCycle(client, id);
  if (!cycle) throw new ReviewError(404, "not_found", "Review cycle not found");
  if (cycle.status !== "draft") throw new ReviewError(409, "not_draft", `This cycle is already ${cycle.status}.`);
  const inserted = await client.query<{ employee_id: string }>(
    `INSERT INTO public.review_participants (cycle_id, employee_id)
     SELECT $1, e.id FROM public.employees e
     WHERE e.employment_status = ANY($2::text[]) AND ($3::int IS NULL OR e.department_id = $3::int)
     ORDER BY e.id
     RETURNING employee_id`,
    [id, VISIBLE_STATUSES, departmentId],
  );
  if (inserted.rowCount === 0) throw new ReviewError(409, "no_participants", "Nobody in the working company matches, so there is no one to review.");
  await client.query(
    "UPDATE public.review_cycles SET status = 'open', opened_at = CURRENT_TIMESTAMP, opened_by = $2, updated_at = CURRENT_TIMESTAMP, revision = revision + 1 WHERE id = $1",
    [id, user.id],
  );
  await recordAudit({
    actor: actorFromUser(user, user.email), action: "REVIEW_CYCLE_OPENED", entityType: "review_cycle", entityId: id,
    summary: `Opened review cycle "${cycle.name}" for ${inserted.rowCount} people`,
    changes: { status: { before: "draft", after: "open" }, participants: inserted.rowCount, department_id: departmentId },
  }, client);
  await notify(await accountsOfEmployees(inserted.rows.map((row) => Number(row.employee_id)), client), {
    kind: "review_opened",
    title: `Your ${cycle.name} self-review is open`,
    body: `Due ${formatDay(cycle.self_due_on)}.`,
    link: "/reviews",
    entityType: "review_cycle", entityId: id, dedupeKey: `review-cycle:${id}:opened`, actorUserId: user.id,
  }, client);
  return { participants: inserted.rowCount ?? 0 };
}

export async function closeCycle(client: PoolClient, user: AuthenticatedUser, id: number) {
  const cycle = await lockCycle(client, id);
  if (!cycle) throw new ReviewError(404, "not_found", "Review cycle not found");
  if (cycle.status !== "open") throw new ReviewError(409, "not_open", cycle.status === "draft" ? "A draft cycle is not open." : "This cycle is already closed.");
  await client.query(
    "UPDATE public.review_cycles SET status = 'closed', closed_at = CURRENT_TIMESTAMP, closed_by = $2, updated_at = CURRENT_TIMESTAMP, revision = revision + 1 WHERE id = $1",
    [id, user.id],
  );
  await recordAudit({
    actor: actorFromUser(user, user.email), action: "REVIEW_CYCLE_CLOSED", entityType: "review_cycle", entityId: id,
    summary: `Closed review cycle "${cycle.name}"`, changes: { status: { before: "open", after: "closed" } },
  }, client);
}

// ------------------------------------------------------------ participants

interface ParticipantRow {
  id: string; cycle_id: string; cycle_name: string; cycle_status: string; self_due_on: string; manager_due_on: string;
  period_start: string; period_end: string;
  employee_id: string; full_name: string; job_title: string | null; profile_image: string | null; department_name: string | null;
  manager_id: string | null; manager_name: string | null; employment_status: string;
  status: string; self_summary: string | null; self_rating: number | null; self_submitted_at: Date | null;
  manager_summary: string | null; manager_rating: number | null; manager_submitted_at: Date | null;
  employee_response: string | null; responded_at: Date | null;
}

const participantSelect = `SELECT p.id, p.cycle_id, c.name AS cycle_name, c.status AS cycle_status,
    c.self_due_on::text AS self_due_on, c.manager_due_on::text AS manager_due_on,
    c.period_start::text AS period_start, c.period_end::text AS period_end,
    e.id AS employee_id, e.full_name, e.job_title, e.profile_image, d.name AS department_name,
    e.manager_id, m.full_name AS manager_name, e.employment_status,
    p.status, p.self_summary, p.self_rating, p.self_submitted_at, p.manager_summary, p.manager_rating, p.manager_submitted_at,
    p.employee_response, p.responded_at
  FROM public.review_participants p
  JOIN public.review_cycles c ON c.id = p.cycle_id
  JOIN public.employees e ON e.id = p.employee_id
  LEFT JOIN public.departments d ON d.id = e.department_id
  LEFT JOIN public.employees m ON m.id = e.manager_id AND m.employment_status = ANY($1::text[])`;

type ReviewRole = "employee" | "manager" | "hr";

/** The one role that decides what this viewer reads: their own review first, then management, then HR. */
function roleFor(user: AuthenticatedUser, row: ParticipantRow): ReviewRole | null {
  if (user.employeeId !== null && Number(row.employee_id) === user.employeeId) return "employee";
  if (user.employeeId !== null && row.manager_id !== null && Number(row.manager_id) === user.employeeId && row.manager_name !== null && visible(row.employment_status)) {
    return "manager";
  }
  if (user.role === "admin") return "hr";
  return null;
}

/** Status and dates only: what lists carry. */
function summaryOf(row: ParticipantRow, today: string) {
  const due = row.status === "pending_self" ? row.self_due_on : row.status === "pending_manager" ? row.manager_due_on : null;
  return {
    id: Number(row.id),
    cycle: { id: Number(row.cycle_id), name: row.cycle_name, status: row.cycle_status, selfDueOn: row.self_due_on, managerDueOn: row.manager_due_on, periodStart: row.period_start, periodEnd: row.period_end },
    employee: { id: Number(row.employee_id), fullName: row.full_name, jobTitle: row.job_title, profileImage: row.profile_image, departmentName: row.department_name, managerName: row.manager_name },
    status: row.status,
    selfSubmittedAt: row.self_submitted_at ? row.self_submitted_at.toISOString() : null,
    managerSubmittedAt: row.manager_submitted_at ? row.manager_submitted_at.toISOString() : null,
    respondedAt: row.responded_at ? row.responded_at.toISOString() : null,
    dueOn: due,
    overdue: row.cycle_status === "open" && due !== null && due < today,
  };
}

function contentFor(role: ReviewRole, row: ParticipantRow) {
  const selfVisible = role === "employee" || role === "hr" || row.self_submitted_at !== null;
  const managerVisible = role === "manager" || role === "hr" || row.manager_submitted_at !== null;
  const rating = (value: number | null) => value === null ? null : { value, label: ratingLabels[value] };
  return {
    self: selfVisible ? { summary: row.self_summary, rating: rating(row.self_rating) } : null,
    manager: managerVisible ? { summary: row.manager_summary, rating: rating(row.manager_rating) } : null,
    response: row.employee_response,
  };
}

export async function myReviews(user: AuthenticatedUser, db: Db = pool) {
  const today = await companyToday(db);
  const result = await db.query<ParticipantRow>(
    `${participantSelect} WHERE p.employee_id = $2 AND c.status <> 'draft' ORDER BY c.period_end DESC, p.id DESC`,
    [VISIBLE_STATUSES, user.employeeId],
  );
  return { today, reviews: result.rows.map((row) => summaryOf(row, today)) };
}

export async function teamReviews(user: AuthenticatedUser, db: Db = pool) {
  const today = await companyToday(db);
  const result = await db.query<ParticipantRow>(
    `${participantSelect} WHERE e.manager_id = $2 AND e.employment_status = ANY($1::text[]) AND c.status <> 'draft'
     ORDER BY (c.status = 'open') DESC, c.period_end DESC, e.full_name`,
    [VISIBLE_STATUSES, user.employeeId],
  );
  return { today, reviews: result.rows.map((row) => summaryOf(row, today)) };
}

export async function cycleParticipants(cycleId: number, db: Db = pool) {
  const today = await companyToday(db);
  const cycle = await db.query<CycleRow>(`${cycleSelect} WHERE c.id = $1 GROUP BY c.id`, [cycleId]);
  if (!cycle.rows[0]) return null;
  const rows = await db.query<ParticipantRow>(`${participantSelect} WHERE p.cycle_id = $2 ORDER BY d.name NULLS LAST, e.full_name`, [VISIBLE_STATUSES, cycleId]);
  return { today, cycle: toCycle(cycle.rows[0]), participants: rows.rows.map((row) => summaryOf(row, today)) };
}

async function loadParticipant(db: Db, id: number, lock = false) {
  const result = await db.query<ParticipantRow>(`${participantSelect} WHERE p.id = $2${lock ? " FOR UPDATE OF p" : ""}`, [VISIBLE_STATUSES, id]);
  return result.rows[0] ?? null;
}

/** One review as the caller may read it. HR reads are audited; anyone without a role gets null. */
export async function participantDetail(user: AuthenticatedUser, id: number, db: Db = pool) {
  const row = await loadParticipant(db, id);
  if (!row) return null;
  const role = roleFor(user, row);
  if (!role) return null;
  if (role === "hr") {
    await recordAudit({
      actor: actorFromUser(user, user.email), action: "REVIEW_VIEWED", entityType: "review_participant", entityId: id,
      summary: `Viewed the ${row.cycle_name} review of employee #${row.employee_id}`,
      changes: { status: row.status },
    });
  }
  const today = await companyToday(db);
  const noManager = row.manager_name === null;
  return {
    role,
    ...summaryOf(row, today),
    content: contentFor(role, row),
    can: {
      writeSelf: role === "employee" && row.cycle_status === "open" && row.status === "pending_self",
      writeManager: row.cycle_status === "open" && row.status === "pending_manager" && (role === "manager" || (role === "hr" && noManager)),
      respond: role === "employee" && row.status === "completed" && row.responded_at === null,
    },
    ratingScale: Object.entries(ratingLabels).map(([value, label]) => ({ value: Number(value), label })),
  };
}

export async function writeSelf(client: PoolClient, user: AuthenticatedUser, id: number, input: ReviewWriteInput) {
  const row = await loadParticipant(client, id, true);
  if (!row || roleFor(user, row) !== "employee") throw new ReviewError(404, "not_found", "Review not found");
  if (row.cycle_status !== "open") throw new ReviewError(409, "cycle_not_open", "This review cycle is not open.");
  if (row.status !== "pending_self") throw new ReviewError(409, "already_submitted", "Your self-review is already submitted.");

  await client.query(
    `UPDATE public.review_participants
     SET self_summary = $2, self_rating = $3,
         self_submitted_at = CASE WHEN $4::boolean THEN CURRENT_TIMESTAMP END,
         status = CASE WHEN $4::boolean THEN 'pending_manager' ELSE status END,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $1`,
    [id, input.summary, input.rating, input.submit],
  );
  if (!input.submit) return { submitted: false };

  await recordAudit({
    actor: actorFromUser(user, user.email), action: "REVIEW_SELF_SUBMITTED", entityType: "review_participant", entityId: id,
    // The words and the rating are private review content, never audit data.
    summary: `Submitted the ${row.cycle_name} self-review`, changes: { status: { before: "pending_self", after: "pending_manager" } },
  }, client);
  const template = {
    kind: "review_submitted" as const,
    title: `${row.full_name} submitted their ${row.cycle_name} self-review`,
    link: `/reviews/${id}`, entityType: "review_participant", entityId: id,
    dedupeKey: `review:${id}:self`, actorUserId: user.id,
  };
  const manager = await managerAccountOf(Number(row.employee_id), client);
  await notify(manager.length > 0 ? manager : await adminAccounts(client), template, client);
  return { submitted: true };
}

export async function writeManager(client: PoolClient, user: AuthenticatedUser, id: number, input: ReviewWriteInput) {
  const row = await loadParticipant(client, id, true);
  const role = row ? roleFor(user, row) : null;
  const noManager = row?.manager_name === null;
  if (!row || !(role === "manager" || (role === "hr" && noManager))) {
    throw new ReviewError(role === "hr" ? 403 : 404, role === "hr" ? "has_manager" : "not_found",
      role === "hr" ? "Their manager writes this review. HR writes it only for someone with no manager." : "Review not found");
  }
  if (row.cycle_status !== "open") throw new ReviewError(409, "cycle_not_open", "This review cycle is not open.");
  if (row.status === "pending_self") throw new ReviewError(409, "self_first", `${row.full_name} has not submitted their self-review yet.`);
  if (row.status !== "pending_manager") throw new ReviewError(409, "already_submitted", "This review is already complete.");

  await client.query(
    `UPDATE public.review_participants
     SET manager_summary = $2, manager_rating = $3,
         manager_submitted_at = CASE WHEN $4::boolean THEN CURRENT_TIMESTAMP END,
         manager_submitted_by = CASE WHEN $4::boolean THEN $5::int END,
         status = CASE WHEN $4::boolean THEN 'completed' ELSE status END,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $1`,
    [id, input.summary, input.rating, input.submit, user.id],
  );
  if (!input.submit) return { submitted: false };

  await recordAudit({
    actor: { ...actorFromUser(user, user.email), role: role === "manager" ? "manager" : user.role },
    action: "REVIEW_MANAGER_SUBMITTED", entityType: "review_participant", entityId: id,
    summary: `Submitted the ${row.cycle_name} manager review for employee #${row.employee_id}`,
    changes: { status: { before: "pending_manager", after: "completed" } },
  }, client);
  await recordTimelineEvent({
    employeeId: Number(row.employee_id), kind: "review_completed", visibility: "self",
    occurredOn: await companyToday(client), title: `Completed the ${row.cycle_name} review`,
    sourceType: "review_participant", sourceId: id, actorUserId: user.id,
  }, client);
  await notify(await accountsOfEmployees([Number(row.employee_id)], client), {
    kind: "review_submitted", title: `Your ${row.cycle_name} review is ready to read`,
    link: `/reviews/${id}`, entityType: "review_participant", entityId: id,
    dedupeKey: `review:${id}:manager`, actorUserId: user.id,
  }, client);
  return { submitted: true };
}

export async function respond(client: PoolClient, user: AuthenticatedUser, id: number, response: string) {
  const row = await loadParticipant(client, id, true);
  if (!row || roleFor(user, row) !== "employee") throw new ReviewError(404, "not_found", "Review not found");
  if (row.status !== "completed") throw new ReviewError(409, "not_complete", "You can respond once your manager's review is in.");
  if (row.responded_at !== null) throw new ReviewError(409, "already_responded", "You have already responded to this review.");
  await client.query(
    "UPDATE public.review_participants SET employee_response = $2, responded_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = $1",
    [id, response],
  );
  await recordAudit({
    actor: actorFromUser(user, user.email), action: "REVIEW_RESPONSE_SUBMITTED", entityType: "review_participant", entityId: id,
    summary: `Responded to the ${row.cycle_name} review`, changes: { responded: true },
  }, client);
}

/** Review work waiting for the caller, for the Action Center. */
export async function reviewActions(user: AuthenticatedUser, db: Db = pool) {
  const items: Array<{ id: string; title: string; detail: string; date: string; link: string; overdue: boolean }> = [];
  const today = await companyToday(db);
  if (user.employeeId !== null) {
    const own = await db.query<{ id: string; name: string; self_due_on: string }>(
      `SELECT p.id, c.name, c.self_due_on::text AS self_due_on FROM public.review_participants p
       JOIN public.review_cycles c ON c.id = p.cycle_id
       WHERE p.employee_id = $1 AND p.status = 'pending_self' AND c.status = 'open' ORDER BY c.self_due_on`,
      [user.employeeId],
    );
    for (const row of own.rows) {
      items.push({ id: `review-self:${row.id}`, title: `Write your ${row.name} self-review`, detail: `Due ${formatDay(row.self_due_on)}`, date: row.self_due_on, link: `/reviews/${row.id}`, overdue: row.self_due_on < today });
    }
    const team = await db.query<{ id: string; name: string; manager_due_on: string; full_name: string }>(
      `SELECT p.id, c.name, c.manager_due_on::text AS manager_due_on, e.full_name FROM public.review_participants p
       JOIN public.review_cycles c ON c.id = p.cycle_id
       JOIN public.employees e ON e.id = p.employee_id
       WHERE e.manager_id = $1 AND e.employment_status = ANY($2::text[]) AND p.status = 'pending_manager' AND c.status = 'open'
       ORDER BY c.manager_due_on, e.full_name LIMIT 50`,
      [user.employeeId, VISIBLE_STATUSES],
    );
    for (const row of team.rows) {
      items.push({ id: `review-manager:${row.id}`, title: `Review ${row.full_name}`, detail: `${row.name} · due ${formatDay(row.manager_due_on)}`, date: row.manager_due_on, link: `/reviews/${row.id}`, overdue: row.manager_due_on < today });
    }
  }
  if (user.role === "admin") {
    const late = await db.query<{ id: string; name: string; manager_due_on: string; open: number }>(
      `SELECT c.id, c.name, c.manager_due_on::text AS manager_due_on, count(p.id)::int AS open
       FROM public.review_cycles c JOIN public.review_participants p ON p.cycle_id = c.id AND p.status <> 'completed'
       WHERE c.status = 'open' AND c.manager_due_on < $1::date GROUP BY c.id ORDER BY c.manager_due_on`,
      [today],
    );
    for (const row of late.rows) {
      items.push({ id: `review-cycle:${row.id}`, title: `${row.open} review${row.open === 1 ? "" : "s"} past due in ${row.name}`, detail: `Manager reviews were due ${formatDay(row.manager_due_on)}`, date: row.manager_due_on, link: `/admin/performance/cycles/${row.id}`, overdue: true });
    }
  }
  return items;
}
