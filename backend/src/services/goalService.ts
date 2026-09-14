/**
 * Goals.
 *
 * A goal belongs to its owner. Who else may see and change it is decided from
 * current data on every request:
 *
 *   owner      sees and changes it
 *   manager    whoever manages the owner now: sees and changes it
 *   HR         sees it (read-only)
 *   peer       a colleague with the same manager: sees team and company goals
 *   coworker   anyone else in the working company: sees company goals
 *
 * Progress is the percentage the owner or manager records, 0-100, with every
 * change kept in goal_updates; completing a goal sets it to 100.
 */
import type { Pool, PoolClient } from "pg";
import pool from "../config/db.js";
import { VISIBLE_STATUSES } from "../auth/policy.js";
import type { AuthenticatedUser } from "../types/auth.js";
import { companyToday } from "../utils/companyClock.js";
import type { GoalInput, GoalProgressInput, GoalVisibility } from "../utils/performanceValidation.js";
import { actorFromUser, recordAudit } from "./auditService.js";
import { accountsOfEmployees, managerAccountOf, notify } from "./notificationService.js";
import { recordTimelineEvent } from "./timelineService.js";

type Db = Pick<PoolClient, "query"> | Pool;

export class GoalError extends Error {
  constructor(public status: number, public code: string, message: string, public errors?: Record<string, string>) {
    super(message);
  }
}

export type GoalRelation = "owner" | "manager" | "hr" | "peer" | "coworker";

const visible = (status: string) => (VISIBLE_STATUSES as readonly string[]).includes(status);

/** The caller's relation to a goal owner, or null when the owner is not visible to them. */
export async function goalRelation(user: AuthenticatedUser, ownerId: number, db: Db = pool): Promise<GoalRelation | null> {
  const result = await db.query<{ id: string; employment_status: string; manager_id: string | null; caller_manager: string | null }>(
    `SELECT o.id, o.employment_status, o.manager_id,
            (SELECT c.manager_id FROM public.employees c WHERE c.id = $2::int) AS caller_manager
     FROM public.employees o WHERE o.id = $1`,
    [ownerId, user.employeeId],
  );
  const owner = result.rows[0];
  if (!owner) return null;
  if (user.employeeId !== null && user.employeeId === ownerId) return "owner";
  if (user.role === "admin") return "hr";
  if (!visible(owner.employment_status)) return null;
  if (user.employeeId !== null && owner.manager_id !== null && Number(owner.manager_id) === user.employeeId) return "manager";
  if (owner.manager_id !== null && owner.caller_manager !== null && owner.manager_id === owner.caller_manager) return "peer";
  return "coworker";
}

export function visibilitiesFor(relation: GoalRelation): GoalVisibility[] {
  if (relation === "peer") return ["team", "company"];
  if (relation === "coworker") return ["company"];
  return ["private", "team", "company"];
}

const canChange = (relation: GoalRelation) => relation === "owner" || relation === "manager";

interface GoalRow {
  id: string; owner_employee_id: string; owner_name: string; owner_image: string | null; title: string; description: string | null;
  starts_on: string; due_on: string; status: string; progress: number; visibility: GoalVisibility; created_as: string;
  completed_at: Date | null; cancelled_at: Date | null; updated_at: Date; revision: number;
}

const goalSelect = `SELECT g.id, g.owner_employee_id, o.full_name AS owner_name, o.profile_image AS owner_image, g.title, g.description,
    g.starts_on::text AS starts_on, g.due_on::text AS due_on, g.status, g.progress, g.visibility, g.created_as,
    g.completed_at, g.cancelled_at, g.updated_at, g.revision
  FROM public.goals g JOIN public.employees o ON o.id = g.owner_employee_id`;

function toGoal(row: GoalRow, today: string, relation?: GoalRelation) {
  return {
    id: Number(row.id),
    ownerId: Number(row.owner_employee_id),
    ownerName: row.owner_name,
    ownerImage: row.owner_image,
    title: row.title,
    description: row.description,
    startsOn: row.starts_on,
    dueOn: row.due_on,
    status: row.status,
    progress: row.progress,
    visibility: row.visibility,
    createdAs: row.created_as,
    completedAt: row.completed_at ? row.completed_at.toISOString() : null,
    cancelledAt: row.cancelled_at ? row.cancelled_at.toISOString() : null,
    updatedAt: row.updated_at.toISOString(),
    revision: row.revision,
    overdue: row.status === "active" && row.due_on < today,
    canChange: relation ? canChange(relation) : undefined,
  };
}

const statusOrder = "(g.status = 'active') DESC, g.due_on, g.id";

export async function listMine(user: AuthenticatedUser, db: Db = pool) {
  const today = await companyToday(db);
  const result = await db.query<GoalRow>(`${goalSelect} WHERE g.owner_employee_id = $1 ORDER BY ${statusOrder}`, [user.employeeId]);
  return { today, goals: result.rows.map((row) => toGoal(row, today, "owner")) };
}

export async function listTeam(user: AuthenticatedUser, db: Db = pool) {
  const today = await companyToday(db);
  const result = await db.query<GoalRow>(
    `${goalSelect} WHERE o.manager_id = $1 AND o.employment_status = ANY($2::text[]) ORDER BY o.full_name, ${statusOrder}`,
    [user.employeeId, VISIBLE_STATUSES],
  );
  return { today, goals: result.rows.map((row) => toGoal(row, today, "manager")) };
}

/** A person's goals, filtered to what the caller's relation may see. */
export async function listForPerson(user: AuthenticatedUser, ownerId: number, db: Db = pool) {
  const relation = await goalRelation(user, ownerId, db);
  if (!relation) return null;
  const today = await companyToday(db);
  const result = await db.query<GoalRow>(
    `${goalSelect} WHERE g.owner_employee_id = $1 AND g.visibility = ANY($2::text[]) AND g.status <> 'cancelled' ORDER BY ${statusOrder}`,
    [ownerId, visibilitiesFor(relation)],
  );
  return { today, relation, goals: result.rows.map((row) => toGoal(row, today, relation)) };
}

export async function goalDetail(user: AuthenticatedUser, goalId: number, db: Db = pool) {
  const today = await companyToday(db);
  const result = await db.query<GoalRow>(`${goalSelect} WHERE g.id = $1`, [goalId]);
  const row = result.rows[0];
  if (!row) return null;
  const relation = await goalRelation(user, Number(row.owner_employee_id), db);
  if (!relation || !visibilitiesFor(relation).includes(row.visibility)) return null;
  const updates = await db.query<{
    id: string; author_role: string; author_name: string | null; progress_before: number; progress_after: number;
    status_before: string; status_after: string; note: string | null; created_at: Date;
  }>(
    `SELECT u.id, u.author_role, e.full_name AS author_name, u.progress_before, u.progress_after,
            u.status_before, u.status_after, u.note, u.created_at
     FROM public.goal_updates u
     LEFT JOIN public.users a ON a.id = u.author_user_id
     LEFT JOIN public.employees e ON e.id = a.employee_id
     WHERE u.goal_id = $1 ORDER BY u.created_at DESC, u.id DESC LIMIT 100`,
    [goalId],
  );
  return {
    today,
    relation,
    goal: toGoal(row, today, relation),
    updates: updates.rows.map((update) => ({
      id: Number(update.id),
      authorRole: update.author_role,
      authorName: update.author_name,
      progressBefore: update.progress_before,
      progressAfter: update.progress_after,
      statusBefore: update.status_before,
      statusAfter: update.status_after,
      note: update.note,
      createdAt: update.created_at.toISOString(),
    })),
  };
}

export async function createGoal(client: PoolClient, user: AuthenticatedUser, input: GoalInput) {
  const ownerId = input.ownerId ?? user.employeeId;
  if (ownerId === null) {
    throw new GoalError(403, "no_employee_record", "Goals belong to employees. This account has no employee record.");
  }
  const relation = await goalRelation(user, ownerId, client);
  if (relation !== "owner" && relation !== "manager") {
    // A colleague is not hidden, but only they and their manager set their goals.
    throw new GoalError(relation === null ? 404 : 403, relation === null ? "not_found" : "not_your_team",
      relation === null ? "Person not found" : "You can set goals for yourself and for people who report to you.");
  }
  const created = await client.query<{ id: string }>(
    `INSERT INTO public.goals (owner_employee_id, title, description, starts_on, due_on, visibility, created_as, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
    [ownerId, input.title, input.description, input.startsOn, input.dueOn, input.visibility, relation, user.id],
  );
  const id = Number(created.rows[0]!.id);
  await recordAudit({
    actor: { ...actorFromUser(user, user.email), role: relation === "manager" ? "manager" : user.role },
    action: "GOAL_CREATED",
    entityType: "goal",
    entityId: id,
    summary: `Created a ${input.visibility} goal for employee #${ownerId} as ${relation}`,
    changes: { owner_employee_id: ownerId, visibility: input.visibility, due_on: input.dueOn, created_as: relation },
  }, client);
  if (relation === "manager") {
    await notify(await accountsOfEmployees([ownerId], client), {
      kind: "goal_assigned",
      title: `Your manager set you a goal: ${input.title}`,
      link: `/goals/${id}`,
      entityType: "goal", entityId: id, dedupeKey: `goal:${id}:assigned`, actorUserId: user.id,
    }, client);
  }
  return id;
}

async function lockGoal(client: PoolClient, goalId: number) {
  const result = await client.query<{
    id: string; owner_employee_id: string; title: string; status: string; progress: number; visibility: GoalVisibility; revision: number;
    description: string | null; starts_on: string; due_on: string;
  }>(
    `SELECT id, owner_employee_id, title, status, progress, visibility, revision, description,
            starts_on::text AS starts_on, due_on::text AS due_on
     FROM public.goals WHERE id = $1 FOR UPDATE`,
    [goalId],
  );
  return result.rows[0] ?? null;
}

async function changeableGoal(client: PoolClient, user: AuthenticatedUser, goalId: number) {
  const goal = await lockGoal(client, goalId);
  if (!goal) throw new GoalError(404, "not_found", "Goal not found");
  const relation = await goalRelation(user, Number(goal.owner_employee_id), client);
  if (!relation || !visibilitiesFor(relation).includes(goal.visibility)) throw new GoalError(404, "not_found", "Goal not found");
  if (!canChange(relation)) throw new GoalError(403, "read_only", "Only the goal's owner and their manager can change it.");
  if (goal.status !== "active") throw new GoalError(409, "goal_closed", `This goal is ${goal.status}; it can no longer change.`);
  return { goal, relation: relation as "owner" | "manager" };
}

export async function updateGoal(client: PoolClient, user: AuthenticatedUser, goalId: number, input: GoalInput) {
  const { goal, relation } = await changeableGoal(client, user, goalId);
  if (goal.revision !== input.revision) {
    throw new GoalError(409, "stale_revision", "This goal changed since you opened it. Reload to see the latest version.");
  }
  await client.query(
    `UPDATE public.goals SET title = $2, description = $3, starts_on = $4, due_on = $5, visibility = $6,
       updated_at = CURRENT_TIMESTAMP, revision = revision + 1
     WHERE id = $1`,
    [goalId, input.title, input.description, input.startsOn, input.dueOn, input.visibility],
  );
  const changed = ["title", "description", "starts_on", "due_on", "visibility"].filter((field) => {
    const before = (goal as Record<string, unknown>)[field];
    const after = { title: input.title, description: input.description, starts_on: input.startsOn, due_on: input.dueOn, visibility: input.visibility }[field];
    return before !== after;
  });
  await recordAudit({
    actor: { ...actorFromUser(user, user.email), role: relation === "manager" ? "manager" : user.role },
    action: "GOAL_UPDATED",
    entityType: "goal",
    entityId: goalId,
    summary: `Edited goal #${goalId} of employee #${goal.owner_employee_id} as ${relation}`,
    changes: { fields: changed, visibility: goal.visibility === input.visibility ? undefined : { before: goal.visibility, after: input.visibility } },
  }, client);
  if (relation === "manager") {
    await notify(await accountsOfEmployees([Number(goal.owner_employee_id)], client), {
      kind: "goal_updated", title: `Your manager edited your goal: ${input.title}`, link: `/goals/${goalId}`,
      entityType: "goal", entityId: goalId, actorUserId: user.id,
    }, client);
  }
}

export async function recordProgress(client: PoolClient, user: AuthenticatedUser, goalId: number, input: GoalProgressInput) {
  const { goal, relation } = await changeableGoal(client, user, goalId);
  const progress = input.status === "completed" ? 100 : input.progress;
  await client.query(
    `INSERT INTO public.goal_updates (goal_id, author_user_id, author_role, progress_before, progress_after, status_before, status_after, note)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [goalId, user.id, relation, goal.progress, progress, goal.status, input.status, input.note],
  );
  await client.query(
    `UPDATE public.goals SET progress = $2, status = $3::varchar,
       completed_at = CASE WHEN $3::varchar = 'completed' THEN CURRENT_TIMESTAMP END,
       cancelled_at = CASE WHEN $3::varchar = 'cancelled' THEN CURRENT_TIMESTAMP END,
       updated_at = CURRENT_TIMESTAMP, revision = revision + 1
     WHERE id = $1`,
    [goalId, progress, input.status],
  );
  await recordAudit({
    actor: { ...actorFromUser(user, user.email), role: relation === "manager" ? "manager" : user.role },
    action: input.status === "active" ? "GOAL_PROGRESS_RECORDED" : input.status === "completed" ? "GOAL_COMPLETED" : "GOAL_CANCELLED",
    entityType: "goal",
    entityId: goalId,
    summary: `Goal #${goalId} of employee #${goal.owner_employee_id}: ${goal.progress}% to ${progress}%, ${input.status}, as ${relation}`,
    changes: { progress: { before: goal.progress, after: progress }, status: { before: goal.status, after: input.status } },
  }, client);

  const ownerId = Number(goal.owner_employee_id);
  if (input.status === "completed") {
    await recordTimelineEvent({
      employeeId: ownerId,
      kind: "goal_completed",
      // A company goal is company news; any other stays with the owner and HR.
      visibility: goal.visibility === "company" ? "company" : "self",
      occurredOn: await companyToday(client),
      title: goal.visibility === "company" ? `Completed a goal: ${goal.title}` : "Completed a goal",
      sourceType: "goal", sourceId: goalId, actorUserId: user.id,
    }, client);
  }
  if (relation === "manager") {
    await notify(await accountsOfEmployees([ownerId], client), {
      kind: "goal_updated",
      title: input.status === "completed" ? `Your manager marked your goal complete: ${goal.title}` : `Your manager updated your goal: ${goal.title}`,
      link: `/goals/${goalId}`, entityType: "goal", entityId: goalId, actorUserId: user.id,
    }, client);
  } else if (input.status === "completed") {
    const owner = await client.query<{ full_name: string }>("SELECT full_name FROM public.employees WHERE id = $1", [ownerId]);
    await notify(await managerAccountOf(ownerId, client), {
      kind: "goal_updated",
      title: `${owner.rows[0]?.full_name ?? "Your report"} completed a goal: ${goal.title}`,
      link: `/goals/${goalId}`, entityType: "goal", entityId: goalId, dedupeKey: `goal:${goalId}:completed`, actorUserId: user.id,
    }, client);
  }
  return { progress, status: input.status };
}

/** Active goals the caller owns that are past their due date. */
export async function overdueGoals(user: AuthenticatedUser, db: Db = pool) {
  if (user.employeeId === null) return [];
  const today = await companyToday(db);
  const result = await db.query<{ id: string; title: string; due_on: string; progress: number }>(
    `SELECT id, title, due_on::text AS due_on, progress FROM public.goals
     WHERE owner_employee_id = $1 AND status = 'active' AND due_on < $2::date ORDER BY due_on LIMIT 20`,
    [user.employeeId, today],
  );
  return result.rows.map((row) => ({ id: Number(row.id), title: row.title, dueOn: row.due_on, progress: row.progress }));
}
