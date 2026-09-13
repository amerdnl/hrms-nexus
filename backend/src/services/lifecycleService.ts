/**
 * Onboarding and offboarding.
 *
 * A plan's tasks belong to roles, and roles are resolved from the database on
 * every request:
 *
 *   employee   the account linked to the plan's employee
 *   manager    the account of that employee's CURRENT manager
 *   hr         any administrator
 *
 * So reassigning a reporting line mid-plan hands the manager's tasks to the new
 * manager on the next request, and the old one loses them at the same moment.
 * Who sees what follows the architecture's sensitive-class matrix: the employee
 * sees their own tasks, the manager the manager's tasks, HR everything. Anyone
 * who can see a plan also sees its overall progress (counts, not titles).
 *
 * Completing an offboarding plan deactivates the employee through the shared
 * employee lifecycle (the same statements and lock order as HR's deactivate
 * action), only on or after the last working day, only with no task left
 * pending, and only when nobody still reports to them.
 */
import type { Pool, PoolClient } from "pg";
import pool from "../config/db.js";
import { VISIBLE_STATUSES } from "../auth/policy.js";
import type { AuthenticatedUser } from "../types/auth.js";
import { addDays, companyToday } from "../utils/companyClock.js";
import { formatDay } from "../utils/dateText.js";
import { employmentStatusLabel } from "../utils/employeeLabels.js";
import type { AssigneeRole, PlanStartInput, TaskUpdateInput, TemplateInput } from "../utils/lifecycleValidation.js";
import { actorFromUser, recordAudit } from "./auditService.js";
import { applyLifecycle, lockEmployee } from "./employeeLifecycleService.js";
import { accountsOfEmployees, adminAccounts, managerAccountOf, notify } from "./notificationService.js";
import { recordTimelineEvent } from "./timelineService.js";

type Db = Pick<PoolClient, "query"> | Pool;

/** A refusal the controller turns into a response. */
export class LifecycleError extends Error {
  constructor(public status: number, public code: string, message: string, public errors?: Record<string, string>) {
    super(message);
  }
}

const visible = (status: string) => (VISIBLE_STATUSES as readonly string[]).includes(status);

/** The roles `user` holds for a plan about `subject`, right now. */
export function rolesFor(
  user: AuthenticatedUser,
  subject: { employeeId: number; managerId: number | null; employmentStatus: string },
): Set<AssigneeRole> {
  const roles = new Set<AssigneeRole>();
  if (user.role === "admin") roles.add("hr");
  if (user.employeeId !== null && user.employeeId === subject.employeeId) roles.add("employee");
  if (user.employeeId !== null && subject.managerId === user.employeeId && visible(subject.employmentStatus)) {
    roles.add("manager");
  }
  return roles;
}

// ------------------------------------------------------------ shapes

interface TaskRow {
  id: string; plan_id: string; position: number; title: string; instructions: string | null;
  assignee_role: AssigneeRole; due_on: string; status: string; note: string | null; completed_at: Date | null;
}

const taskColumns = `t.id, t.plan_id, t.position, t.title, t.instructions, t.assignee_role,
  t.due_on::text AS due_on, t.status, t.note, t.completed_at`;

function toTask(row: TaskRow, today: string) {
  return {
    id: Number(row.id),
    planId: Number(row.plan_id),
    position: row.position,
    title: row.title,
    instructions: row.instructions,
    assigneeRole: row.assignee_role,
    dueOn: row.due_on,
    status: row.status,
    note: row.note,
    completedAt: row.completed_at ? row.completed_at.toISOString() : null,
    overdue: row.status === "pending" && row.due_on < today,
  };
}

interface PlanRow {
  id: string; employee_id: string; full_name: string; employee_number: string; profile_image: string | null;
  department_name: string | null; manager_id: string | null; manager_name: string | null; employment_status: string;
  kind: string; title: string; status: string; starts_on: string; target_date: string; exit_status: string | null;
  completed_at: Date | null; cancelled_at: Date | null; created_at: Date; revision: number;
  total: number; finished: number; overdue: number; next_due: string | null;
}

const planSelect = `SELECT p.id, p.employee_id, e.full_name, e.employee_number, e.profile_image,
    d.name AS department_name, e.manager_id, m.full_name AS manager_name, e.employment_status,
    p.kind, p.title, p.status, p.starts_on::text AS starts_on, p.target_date::text AS target_date,
    p.exit_status, p.completed_at, p.cancelled_at, p.created_at, p.revision,
    count(t.id)::int AS total,
    count(t.id) FILTER (WHERE t.status <> 'pending')::int AS finished,
    count(t.id) FILTER (WHERE t.status = 'pending' AND t.due_on < $1::date)::int AS overdue,
    min(t.due_on) FILTER (WHERE t.status = 'pending')::text AS next_due
  FROM public.lifecycle_plans p
  JOIN public.employees e ON e.id = p.employee_id
  LEFT JOIN public.departments d ON d.id = e.department_id
  LEFT JOIN public.employees m ON m.id = e.manager_id
  LEFT JOIN public.lifecycle_tasks t ON t.plan_id = p.id`;

const planGroup = "GROUP BY p.id, e.id, d.name, m.full_name";

function toPlan(row: PlanRow) {
  return {
    id: Number(row.id),
    employeeId: Number(row.employee_id),
    employeeName: row.full_name,
    employeeNumber: row.employee_number,
    profileImage: row.profile_image,
    departmentName: row.department_name,
    managerName: row.manager_name,
    kind: row.kind,
    title: row.title,
    status: row.status,
    startsOn: row.starts_on,
    targetDate: row.target_date,
    exitStatus: row.exit_status,
    completedAt: row.completed_at ? row.completed_at.toISOString() : null,
    cancelledAt: row.cancelled_at ? row.cancelled_at.toISOString() : null,
    revision: row.revision,
    progress: { total: row.total, finished: row.finished, overdue: row.overdue, nextDue: row.next_due },
  };
}

// ------------------------------------------------------------ templates

export async function listTemplates(kind: string | null, db: Db = pool) {
  const templates = await db.query<{
    id: string; kind: string; name: string; description: string | null; is_active: boolean; revision: number; updated_at: Date;
    plans: number;
  }>(
    `SELECT tpl.id, tpl.kind, tpl.name, tpl.description, tpl.is_active, tpl.revision, tpl.updated_at,
            (SELECT count(*)::int FROM public.lifecycle_plans p WHERE p.template_id = tpl.id) AS plans
     FROM public.lifecycle_templates tpl
     WHERE ($1::text IS NULL OR tpl.kind = $1)
     ORDER BY tpl.is_active DESC, tpl.kind, lower(tpl.name)`,
    [kind],
  );
  const tasks = await db.query<{ template_id: string; position: number; title: string; instructions: string | null; assignee_role: string; due_offset_days: number }>(
    `SELECT template_id, position, title, instructions, assignee_role, due_offset_days
     FROM public.lifecycle_template_tasks
     WHERE template_id = ANY($1::bigint[])
     ORDER BY template_id, position`,
    [templates.rows.map((row) => row.id)],
  );
  return templates.rows.map((row) => ({
    id: Number(row.id),
    kind: row.kind,
    name: row.name,
    description: row.description,
    isActive: row.is_active,
    revision: row.revision,
    updatedAt: row.updated_at.toISOString(),
    plansStarted: row.plans,
    tasks: tasks.rows.filter((task) => task.template_id === row.id).map((task) => ({
      position: task.position, title: task.title, instructions: task.instructions,
      assigneeRole: task.assignee_role, dueOffsetDays: task.due_offset_days,
    })),
  }));
}

async function writeTemplateTasks(client: PoolClient, templateId: number, input: TemplateInput): Promise<void> {
  await client.query("DELETE FROM public.lifecycle_template_tasks WHERE template_id = $1", [templateId]);
  await client.query(
    `INSERT INTO public.lifecycle_template_tasks (template_id, position, title, instructions, assignee_role, due_offset_days)
     SELECT $1, ord::smallint, title, instructions, role, offset_days::smallint
     FROM unnest($2::text[], $3::text[], $4::text[], $5::int[]) WITH ORDINALITY AS t(title, instructions, role, offset_days, ord)`,
    [
      templateId,
      input.tasks.map((task) => task.title),
      input.tasks.map((task) => task.instructions),
      input.tasks.map((task) => task.assigneeRole),
      input.tasks.map((task) => task.dueOffsetDays),
    ],
  );
}

function duplicateName(error: unknown): boolean {
  const pg = error as { code?: string; constraint?: string };
  return pg.code === "23505" && pg.constraint === "lifecycle_templates_name_once";
}

export async function createTemplate(client: PoolClient, input: TemplateInput, user: AuthenticatedUser): Promise<number> {
  let id: number;
  try {
    await client.query("SAVEPOINT hr_nexus_template");
    const created = await client.query<{ id: string }>(
      `INSERT INTO public.lifecycle_templates (kind, name, description, created_by, updated_by)
       VALUES ($1, $2, $3, $4, $4) RETURNING id`,
      [input.kind, input.name, input.description, user.id],
    );
    await client.query("RELEASE SAVEPOINT hr_nexus_template");
    id = Number(created.rows[0]!.id);
  } catch (error) {
    await client.query("ROLLBACK TO SAVEPOINT hr_nexus_template");
    if (duplicateName(error)) {
      throw new LifecycleError(409, "duplicate_name", `There is already an ${input.kind} checklist called "${input.name}".`, { name: "That name is already in use." });
    }
    throw error;
  }
  await writeTemplateTasks(client, id, input);
  await recordAudit({
    actor: actorFromUser(user, user.email),
    action: "LIFECYCLE_TEMPLATE_CREATED",
    entityType: "lifecycle_template",
    entityId: id,
    summary: `Created ${input.kind} checklist "${input.name}" with ${input.tasks.length} tasks`,
    changes: { kind: input.kind, name: input.name, tasks: input.tasks.length },
  }, client);
  return id;
}

export async function updateTemplate(client: PoolClient, id: number, input: TemplateInput, user: AuthenticatedUser): Promise<void> {
  const existing = await client.query<{ kind: string; name: string; is_active: boolean; revision: number }>(
    "SELECT kind, name, is_active, revision FROM public.lifecycle_templates WHERE id = $1 FOR UPDATE",
    [id],
  );
  const before = existing.rows[0];
  if (!before) throw new LifecycleError(404, "not_found", "Checklist not found");
  if (before.revision !== input.revision) {
    throw new LifecycleError(409, "stale_revision", "Someone else changed this checklist since you opened it. Reload to see their changes.");
  }
  const taskCount = await client.query<{ count: number }>(
    "SELECT count(*)::int AS count FROM public.lifecycle_template_tasks WHERE template_id = $1", [id],
  );
  try {
    await client.query("SAVEPOINT hr_nexus_template");
    await client.query(
      `UPDATE public.lifecycle_templates
       SET name = $2, description = $3, is_active = $4, updated_by = $5, updated_at = CURRENT_TIMESTAMP, revision = revision + 1
       WHERE id = $1`,
      [id, input.name, input.description, input.isActive, user.id],
    );
    await client.query("RELEASE SAVEPOINT hr_nexus_template");
  } catch (error) {
    await client.query("ROLLBACK TO SAVEPOINT hr_nexus_template");
    if (duplicateName(error)) {
      throw new LifecycleError(409, "duplicate_name", `There is already a ${before.kind} checklist called "${input.name}".`, { name: "That name is already in use." });
    }
    throw error;
  }
  // Plans already started keep their own copy; only future plans see the new list.
  await writeTemplateTasks(client, id, { ...input, kind: before.kind as TemplateInput["kind"] });
  await recordAudit({
    actor: actorFromUser(user, user.email),
    action: "LIFECYCLE_TEMPLATE_UPDATED",
    entityType: "lifecycle_template",
    entityId: id,
    summary: `Updated ${before.kind} checklist "${input.name}"`,
    changes: {
      name: before.name === input.name ? undefined : { before: before.name, after: input.name },
      is_active: before.is_active === input.isActive ? undefined : { before: before.is_active, after: input.isActive },
      tasks: { before: taskCount.rows[0]?.count ?? 0, after: input.tasks.length },
    },
  }, client);
}

// ------------------------------------------------------------ plans

export async function listPlans(options: { kind: string | null; status: string | null }, db: Db = pool) {
  const today = await companyToday(db);
  const result = await db.query<PlanRow>(
    `${planSelect}
     WHERE ($2::text IS NULL OR p.kind = $2) AND ($3::text IS NULL OR p.status = $3)
     ${planGroup}
     ORDER BY (p.status = 'active') DESC, p.target_date, p.id
     LIMIT 200`,
    [today, options.kind, options.status],
  );
  return { today, plans: result.rows.map(toPlan) };
}

export async function startPlan(client: PoolClient, input: PlanStartInput, user: AuthenticatedUser): Promise<number> {
  // Serialise with every other employee lifecycle change for this person.
  const employee = await client.query<{ id: string; full_name: string; employment_status: string; manager_id: string | null }>(
    "SELECT id, full_name, employment_status, manager_id FROM public.employees WHERE id = $1 FOR UPDATE",
    [input.employeeId],
  );
  const subject = employee.rows[0];
  if (!subject) throw new LifecycleError(404, "employee_not_found", "Employee not found", { employeeId: "That employee does not exist." });
  if (!visible(subject.employment_status)) {
    throw new LifecycleError(409, "not_employed", `${subject.full_name} is ${employmentStatusLabel(subject.employment_status).toLowerCase()}; plans are for people currently employed.`);
  }

  const template = await client.query<{ id: string; kind: string; name: string; is_active: boolean }>(
    "SELECT id, kind, name, is_active FROM public.lifecycle_templates WHERE id = $1",
    [input.templateId],
  );
  const chosen = template.rows[0];
  if (!chosen || chosen.kind !== input.kind || !chosen.is_active) {
    throw new LifecycleError(400, "template_unavailable", "Choose an active checklist of the same kind.", { templateId: "Choose an active checklist of the same kind." });
  }
  const tasks = await client.query<{ position: number; title: string; instructions: string | null; assignee_role: AssigneeRole; due_offset_days: number }>(
    "SELECT position, title, instructions, assignee_role, due_offset_days FROM public.lifecycle_template_tasks WHERE template_id = $1 ORDER BY position",
    [input.templateId],
  );

  let planId: number;
  try {
    await client.query("SAVEPOINT hr_nexus_plan");
    const created = await client.query<{ id: string }>(
      `INSERT INTO public.lifecycle_plans (employee_id, kind, template_id, title, starts_on, target_date, exit_status, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
      [input.employeeId, input.kind, input.templateId, chosen.name, input.startsOn, input.targetDate, input.exitStatus, user.id],
    );
    await client.query("RELEASE SAVEPOINT hr_nexus_plan");
    planId = Number(created.rows[0]!.id);
  } catch (error) {
    await client.query("ROLLBACK TO SAVEPOINT hr_nexus_plan");
    const pg = error as { code?: string; constraint?: string };
    if (pg.code === "23505" && pg.constraint === "lifecycle_plans_one_active") {
      throw new LifecycleError(409, "already_active", `${subject.full_name} already has an ${input.kind} plan in progress.`);
    }
    throw error;
  }

  // Due dates count from the start for onboarding and from the last day for offboarding.
  const anchor = input.kind === "onboarding" ? input.startsOn : input.targetDate;
  for (const task of tasks.rows) {
    await client.query(
      `INSERT INTO public.lifecycle_tasks (plan_id, position, title, instructions, assignee_role, due_on)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [planId, task.position, task.title, task.instructions, task.assignee_role, addDays(anchor, task.due_offset_days)],
    );
  }

  const label = input.kind === "onboarding" ? "onboarding" : "offboarding";
  await recordAudit({
    actor: actorFromUser(user, user.email),
    action: "LIFECYCLE_PLAN_STARTED",
    entityType: "lifecycle_plan",
    entityId: planId,
    summary: `Started ${label} for ${subject.full_name} (employee #${subject.id}) from "${chosen.name}"`,
    changes: {
      kind: input.kind, template_id: input.templateId, starts_on: input.startsOn,
      target_date: input.targetDate, exit_status: input.exitStatus, tasks: tasks.rows.length,
    },
  }, client);

  await recordTimelineEvent({
    employeeId: input.employeeId,
    kind: input.kind === "onboarding" ? "onboarding_started" : "offboarding_started",
    // Joining is company news; leaving is for the manager and HR until it happens.
    visibility: input.kind === "onboarding" ? "company" : "management",
    occurredOn: input.startsOn,
    title: input.kind === "onboarding" ? "Started onboarding" : "Offboarding started",
    sourceType: "lifecycle_plan",
    sourceId: planId,
    actorUserId: user.id,
  }, client);

  // One notification per role that has work, to whoever holds that role now.
  const counts = { employee: 0, manager: 0, hr: 0 };
  for (const task of tasks.rows) counts[task.assignee_role] += 1;
  const tasksText = (count: number) => `${count} task${count === 1 ? "" : "s"}`;
  if (counts.employee > 0) {
    await notify(await accountsOfEmployees([input.employeeId], client), {
      kind: "plan_started",
      title: input.kind === "onboarding" ? "Your onboarding checklist is ready" : "Your offboarding checklist is ready",
      body: `${tasksText(counts.employee)} for you, starting ${formatDay(input.startsOn)}.`,
      link: "/tasks", entityType: "lifecycle_plan", entityId: planId,
      dedupeKey: `lifecycle:${planId}:employee`, actorUserId: user.id,
    }, client);
  }
  if (counts.manager > 0) {
    await notify(await managerAccountOf(input.employeeId, client), {
      kind: "task_assigned",
      title: `${tasksText(counts.manager)} for ${subject.full_name}'s ${label}`,
      link: "/tasks", entityType: "lifecycle_plan", entityId: planId,
      dedupeKey: `lifecycle:${planId}:manager`, actorUserId: user.id,
    }, client);
  }
  if (counts.hr > 0) {
    await notify(await adminAccounts(client), {
      kind: "task_assigned",
      title: `${tasksText(counts.hr)} for HR in ${subject.full_name}'s ${label}`,
      link: `/admin/lifecycle/plans/${planId}`, entityType: "lifecycle_plan", entityId: planId,
      dedupeKey: `lifecycle:${planId}:hr`, actorUserId: user.id,
    }, client);
  }
  return planId;
}

interface LockedPlan {
  id: string; employee_id: string; kind: string; status: string; target_date: string; exit_status: string | null;
  title: string; full_name: string; employee_number: string; manager_id: string | null; employment_status: string;
}

async function lockPlan(client: PoolClient, planId: number): Promise<LockedPlan | null> {
  const result = await client.query<LockedPlan>(
    `SELECT p.id, p.employee_id, p.kind, p.status, p.target_date::text AS target_date, p.exit_status, p.title,
            e.full_name, e.employee_number, e.manager_id, e.employment_status
     FROM public.lifecycle_plans p JOIN public.employees e ON e.id = p.employee_id
     WHERE p.id = $1 FOR UPDATE OF p`,
    [planId],
  );
  return result.rows[0] ?? null;
}

/** One plan as the caller may see it: 404 for anyone holding no role in it. */
export async function planDetail(planId: number, user: AuthenticatedUser, db: Db = pool) {
  const today = await companyToday(db);
  const result = await db.query<PlanRow>(`${planSelect} WHERE p.id = $2 ${planGroup}`, [today, planId]);
  const row = result.rows[0];
  if (!row) return null;
  const roles = rolesFor(user, {
    employeeId: Number(row.employee_id),
    managerId: row.manager_id === null ? null : Number(row.manager_id),
    employmentStatus: row.employment_status,
  });
  if (roles.size === 0) return null;
  const tasks = await db.query<TaskRow>(
    `SELECT ${taskColumns} FROM public.lifecycle_tasks t
     WHERE t.plan_id = $1 AND ($2::boolean OR t.assignee_role = ANY($3::text[]))
     ORDER BY t.position`,
    [planId, roles.has("hr"), [...roles]],
  );
  return {
    today,
    roles: [...roles],
    plan: toPlan(row),
    tasks: tasks.rows.map((task) => toTask(task, today)),
  };
}

async function finishOnboardingIfDone(client: PoolClient, plan: LockedPlan, user: AuthenticatedUser): Promise<boolean> {
  if (plan.kind !== "onboarding") return false;
  const pending = await client.query<{ count: number }>(
    "SELECT count(*)::int AS count FROM public.lifecycle_tasks WHERE plan_id = $1 AND status = 'pending'",
    [plan.id],
  );
  if ((pending.rows[0]?.count ?? 0) > 0) return false;
  await client.query(
    `UPDATE public.lifecycle_plans
     SET status = 'completed', completed_at = CURRENT_TIMESTAMP, completed_by = $2, updated_at = CURRENT_TIMESTAMP, revision = revision + 1
     WHERE id = $1`,
    [plan.id, user.id],
  );
  await recordAudit({
    actor: actorFromUser(user, user.email),
    action: "LIFECYCLE_PLAN_COMPLETED",
    entityType: "lifecycle_plan",
    entityId: plan.id,
    summary: `Onboarding completed for ${plan.full_name} (employee #${plan.employee_id})`,
    changes: { status: { before: "active", after: "completed" }, completed_by: "last task finished" },
  }, client);
  await recordTimelineEvent({
    employeeId: Number(plan.employee_id), kind: "onboarding_completed", visibility: "company",
    occurredOn: await companyToday(client), title: "Completed onboarding",
    sourceType: "lifecycle_plan", sourceId: plan.id, actorUserId: user.id,
  }, client);
  return true;
}

export async function updateTask(client: PoolClient, taskId: number, input: TaskUpdateInput, user: AuthenticatedUser) {
  const taskResult = await client.query<{ plan_id: string; assignee_role: AssigneeRole; status: string; title: string }>(
    "SELECT plan_id, assignee_role, status, title FROM public.lifecycle_tasks WHERE id = $1",
    [taskId],
  );
  const task = taskResult.rows[0];
  if (!task) throw new LifecycleError(404, "not_found", "Task not found");
  const plan = await lockPlan(client, Number(task.plan_id));
  if (!plan) throw new LifecycleError(404, "not_found", "Task not found");

  const roles = rolesFor(user, {
    employeeId: Number(plan.employee_id),
    managerId: plan.manager_id === null ? null : Number(plan.manager_id),
    employmentStatus: plan.employment_status,
  });
  // Someone else's task is not confirmed to exist.
  if (!roles.has("hr") && !roles.has(task.assignee_role)) throw new LifecycleError(404, "not_found", "Task not found");
  if (plan.status !== "active") {
    throw new LifecycleError(409, "plan_closed", `This plan is ${plan.status}; its tasks can no longer change.`);
  }
  if (input.status === "skipped" && !roles.has("hr")) {
    throw new LifecycleError(403, "hr_only", "Only HR can skip a task. Mark it done, or ask HR.");
  }

  await client.query(
    `UPDATE public.lifecycle_tasks
     SET status = $2::varchar, note = $3,
         completed_at = CASE WHEN $2::varchar = 'pending' THEN NULL ELSE COALESCE(completed_at, CURRENT_TIMESTAMP) END,
         completed_by = CASE WHEN $2::varchar = 'pending' THEN NULL ELSE $4::int END,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $1`,
    [taskId, input.status, input.note, user.id],
  );
  await recordAudit({
    actor: { ...actorFromUser(user, user.email), role: roles.has("hr") ? user.role : [...roles][0] ?? user.role },
    action: "LIFECYCLE_TASK_UPDATED",
    entityType: "lifecycle_task",
    entityId: taskId,
    summary: `Marked "${task.title}" ${input.status} in ${plan.kind} for ${plan.full_name}`,
    changes: { status: { before: task.status, after: input.status }, note_changed: input.note !== null },
  }, client);

  const completed = input.status !== "pending" && await finishOnboardingIfDone(client, plan, user);
  return { planId: Number(plan.id), planCompleted: completed };
}

export async function completePlan(client: PoolClient, planId: number, user: AuthenticatedUser) {
  const plan = await lockPlan(client, planId);
  if (!plan) throw new LifecycleError(404, "not_found", "Plan not found");
  if (plan.status !== "active") throw new LifecycleError(409, "plan_closed", `This plan is already ${plan.status}.`);

  const pending = await client.query<{ count: number }>(
    "SELECT count(*)::int AS count FROM public.lifecycle_tasks WHERE plan_id = $1 AND status = 'pending'",
    [planId],
  );
  const pendingCount = pending.rows[0]?.count ?? 0;
  if (pendingCount > 0) {
    throw new LifecycleError(409, "tasks_pending", `${pendingCount} task${pendingCount === 1 ? " is" : "s are"} still pending. Finish or skip ${pendingCount === 1 ? "it" : "them"} first.`);
  }

  if (plan.kind === "onboarding") {
    await finishOnboardingIfDone(client, plan, user);
    return { deactivated: false };
  }

  const today = await companyToday(client);
  if (plan.target_date > today) {
    throw new LifecycleError(409, "before_last_day", `Offboarding completes on or after the last working day, ${formatDay(plan.target_date)}. Their account stays active until then.`);
  }
  const reports = await client.query<{ count: number }>(
    "SELECT count(*)::int AS count FROM public.employees WHERE manager_id = $1 AND employment_status = ANY($2::text[])",
    [plan.employee_id, VISIBLE_STATUSES],
  );
  const reportCount = reports.rows[0]?.count ?? 0;
  if (reportCount > 0) {
    throw new LifecycleError(409, "has_reports", `${reportCount} ${reportCount === 1 ? "person still reports" : "people still report"} to ${plan.full_name}. Give them a new manager first.`);
  }

  // The same lock order and statements as HR's deactivate action.
  const locked = await lockEmployee(client, Number(plan.employee_id));
  if (!locked.found) throw new LifecycleError(404, "not_found", "Employee not found");
  const exitStatus = plan.exit_status!;
  await applyLifecycle(client, Number(plan.employee_id), exitStatus);

  await client.query(
    `UPDATE public.lifecycle_plans
     SET status = 'completed', completed_at = CURRENT_TIMESTAMP, completed_by = $2, updated_at = CURRENT_TIMESTAMP, revision = revision + 1
     WHERE id = $1`,
    [planId, user.id],
  );
  const actor = actorFromUser(user, user.email);
  await recordAudit({
    actor,
    action: "EMPLOYEE_DEACTIVATED",
    entityType: "employee",
    entityId: plan.employee_id,
    summary: `Employee deactivated by completing offboarding plan #${planId}: ${plan.employee_number}`,
    changes: { employment_status: { before: locked.employmentStatus ?? null, after: exitStatus }, account_active: false },
  }, client);
  await recordAudit({
    actor,
    action: "LIFECYCLE_PLAN_COMPLETED",
    entityType: "lifecycle_plan",
    entityId: planId,
    summary: `Offboarding completed for ${plan.full_name} (employee #${plan.employee_id}); left as ${exitStatus}`,
    changes: { status: { before: "active", after: "completed" }, exit_status: exitStatus },
  }, client);
  await recordTimelineEvent({
    employeeId: Number(plan.employee_id), kind: "offboarding_completed", visibility: "management",
    occurredOn: today, title: `Left the company (${employmentStatusLabel(exitStatus)})`,
    sourceType: "lifecycle_plan", sourceId: planId, actorUserId: user.id,
  }, client);
  return { deactivated: true };
}

export async function cancelPlan(client: PoolClient, planId: number, user: AuthenticatedUser) {
  const plan = await lockPlan(client, planId);
  if (!plan) throw new LifecycleError(404, "not_found", "Plan not found");
  if (plan.status !== "active") throw new LifecycleError(409, "plan_closed", `This plan is already ${plan.status}.`);
  await client.query(
    `UPDATE public.lifecycle_plans
     SET status = 'cancelled', cancelled_at = CURRENT_TIMESTAMP, cancelled_by = $2, updated_at = CURRENT_TIMESTAMP, revision = revision + 1
     WHERE id = $1`,
    [planId, user.id],
  );
  await recordAudit({
    actor: actorFromUser(user, user.email),
    action: "LIFECYCLE_PLAN_CANCELLED",
    entityType: "lifecycle_plan",
    entityId: planId,
    summary: `Cancelled ${plan.kind} for ${plan.full_name} (employee #${plan.employee_id}); employment unchanged`,
    changes: { status: { before: "active", after: "cancelled" } },
  }, client);
}

// ------------------------------------------------------------ my work

/**
 * The caller's side of every active plan: plans about them, tasks their roles
 * hold right now, and (for a manager) their team's plans in progress.
 */
export async function myWork(user: AuthenticatedUser, db: Db = pool) {
  const today = await companyToday(db);
  const me = user.employeeId;
  const isAdmin = user.role === "admin";

  const assigned = await db.query<TaskRow & { kind: string; plan_title: string; employee_id: string; employee_name: string }>(
    `SELECT ${taskColumns}, p.kind, p.title AS plan_title, p.employee_id, e.full_name AS employee_name
     FROM public.lifecycle_tasks t
     JOIN public.lifecycle_plans p ON p.id = t.plan_id AND p.status = 'active'
     JOIN public.employees e ON e.id = p.employee_id
     WHERE t.status = 'pending' AND (
       (t.assignee_role = 'employee' AND p.employee_id = $1::int)
       OR (t.assignee_role = 'manager' AND e.manager_id = $1::int AND e.employment_status = ANY($3::text[]))
       OR (t.assignee_role = 'hr' AND $2::boolean)
     )
     ORDER BY t.due_on, p.id, t.position
     LIMIT 200`,
    [me, isAdmin, VISIBLE_STATUSES],
  );

  const own = me === null ? { rows: [] as PlanRow[] } : await db.query<PlanRow>(
    `${planSelect} WHERE p.employee_id = $2 AND p.status = 'active' ${planGroup} ORDER BY p.starts_on`,
    [today, me],
  );
  const team = me === null || !user.isManager ? { rows: [] as PlanRow[] } : await db.query<PlanRow>(
    `${planSelect} WHERE e.manager_id = $2 AND e.employment_status = ANY($3::text[]) AND p.status = 'active'
     ${planGroup} ORDER BY p.target_date`,
    [today, me, VISIBLE_STATUSES],
  );

  return {
    today,
    assigned: assigned.rows.map((row) => ({
      ...toTask(row, today),
      kind: row.kind,
      planTitle: row.plan_title,
      employeeId: Number(row.employee_id),
      employeeName: row.employee_name,
      isOwnPlan: me !== null && Number(row.employee_id) === me,
    })),
    ownPlans: own.rows.map(toPlan),
    teamPlans: team.rows.map(toPlan),
  };
}

/** Offboarding plans past their last day with nothing pending: HR's cue to complete them. */
export async function offboardingReadyToComplete(db: Db = pool) {
  const today = await companyToday(db);
  const result = await db.query<{ id: string; full_name: string; target_date: string }>(
    `SELECT p.id, e.full_name, p.target_date::text AS target_date
     FROM public.lifecycle_plans p JOIN public.employees e ON e.id = p.employee_id
     WHERE p.kind = 'offboarding' AND p.status = 'active' AND p.target_date <= $1::date
       AND NOT EXISTS (SELECT 1 FROM public.lifecycle_tasks t WHERE t.plan_id = p.id AND t.status = 'pending')
     ORDER BY p.target_date LIMIT 50`,
    [today],
  );
  return result.rows.map((row) => ({ planId: Number(row.id), employeeName: row.full_name, targetDate: row.target_date }));
}
