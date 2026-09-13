/**
 * Input rules for onboarding and offboarding: templates, starting a plan and
 * updating a task. Each validator accepts exactly the fields it names and
 * returns field-keyed errors.
 */
import { parseIdParam } from "./employeeValidation.js";
import { parseDate } from "./leaveCalculation.js";

type Errors = Record<string, string>;
export type Validation<T> = { valid: true; data: T } | { valid: false; errors: Errors };

export const lifecycleKinds = ["onboarding", "offboarding"] as const;
export type LifecycleKind = (typeof lifecycleKinds)[number];
export const assigneeRoles = ["employee", "manager", "hr"] as const;
export type AssigneeRole = (typeof assigneeRoles)[number];
export const exitStatuses = ["resigned", "terminated", "inactive"] as const;
export type ExitStatus = (typeof exitStatuses)[number];
export const taskStatuses = ["pending", "done", "skipped"] as const;
export type TaskStatus = (typeof taskStatuses)[number];

const MAX_TASKS = 100;

function asBody(input: unknown): Record<string, unknown> | null {
  return typeof input === "object" && input !== null && !Array.isArray(input) ? input as Record<string, unknown> : null;
}

function hasControlCharacters(value: string, multiline: boolean): boolean {
  return [...value].some((character) => {
    const code = character.charCodeAt(0);
    if (multiline && (code === 9 || code === 10 || code === 13)) return false;
    return code < 32 || code === 127;
  });
}

function text(raw: unknown, label: string, max: number, required: boolean, multiline = false): { value: string | null; error?: string } {
  if (raw === undefined || raw === null || (typeof raw === "string" && raw.trim() === "")) {
    return required ? { value: null, error: `Enter ${label}.` } : { value: null };
  }
  if (typeof raw !== "string") return { value: null, error: `Enter ${label} as text.` };
  const value = multiline ? raw.replace(/\r\n/g, "\n").trim() : raw.trim().replace(/\s+/g, " ");
  if (value.length > max) return { value, error: `Keep ${label} to ${max} characters.` };
  if (hasControlCharacters(value, multiline)) return { value, error: `Remove unusual characters from ${label}.` };
  return { value };
}

function unknownFields(body: Record<string, unknown>, allowed: readonly string[], errors: Errors): void {
  const extra = Object.keys(body).filter((key) => !allowed.includes(key));
  if (extra.length > 0) errors.form = `Unexpected field${extra.length === 1 ? "" : "s"}: ${extra.slice(0, 5).join(", ")}.`;
}

function idField(raw: unknown): number | null {
  return parseIdParam(typeof raw === "number" ? String(raw) : raw);
}

// ------------------------------------------------------------ templates

export interface TemplateTaskInput {
  title: string;
  instructions: string | null;
  assigneeRole: AssigneeRole;
  dueOffsetDays: number;
}

export interface TemplateInput {
  kind: LifecycleKind;
  name: string;
  description: string | null;
  isActive: boolean;
  tasks: TemplateTaskInput[];
  revision: number | null;
}

export function validateTemplate(input: unknown, options: { update: boolean }): Validation<TemplateInput> {
  const body = asBody(input);
  if (!body) return { valid: false, errors: { form: "Send the template as a JSON object." } };
  const errors: Errors = {};
  unknownFields(body, options.update
    ? ["name", "description", "isActive", "tasks", "revision"]
    : ["kind", "name", "description", "tasks"], errors);

  let kind: LifecycleKind = "onboarding";
  if (!options.update) {
    if (!lifecycleKinds.includes(body.kind as LifecycleKind)) errors.kind = "Choose onboarding or offboarding.";
    else kind = body.kind as LifecycleKind;
  }
  const name = text(body.name, "a name", 120, true);
  if (name.error) errors.name = name.error;
  const description = text(body.description, "the description", 1000, false, true);
  if (description.error) errors.description = description.error;

  let isActive = true;
  if (options.update) {
    if (typeof body.isActive !== "boolean") errors.isActive = "Say whether the template is in use.";
    else isActive = body.isActive;
  }

  const tasks: TemplateTaskInput[] = [];
  if (!Array.isArray(body.tasks) || body.tasks.length === 0) {
    errors.tasks = "Add at least one task.";
  } else if (body.tasks.length > MAX_TASKS) {
    errors.tasks = `A checklist can have up to ${MAX_TASKS} tasks.`;
  } else {
    body.tasks.forEach((raw, index) => {
      const task = asBody(raw);
      const at = `tasks.${index}`;
      if (!task) {
        errors[at] = "Each task must be an object.";
        return;
      }
      const extra = Object.keys(task).filter((key) => !["title", "instructions", "assigneeRole", "dueOffsetDays"].includes(key));
      if (extra.length > 0) errors[at] = `Unexpected field: ${extra[0]}.`;
      const title = text(task.title, "a task title", 160, true);
      if (title.error) errors[`${at}.title`] = title.error;
      const instructions = text(task.instructions, "the instructions", 1000, false, true);
      if (instructions.error) errors[`${at}.instructions`] = instructions.error;
      if (!assigneeRoles.includes(task.assigneeRole as AssigneeRole)) errors[`${at}.assigneeRole`] = "Choose who does it: the employee, their manager or HR.";
      const offset = task.dueOffsetDays ?? 0;
      if (typeof offset !== "number" || !Number.isSafeInteger(offset) || offset < -365 || offset > 365) {
        errors[`${at}.dueOffsetDays`] = "Due within a year either side: -365 to 365 days.";
      }
      tasks.push({
        title: title.value ?? "",
        instructions: instructions.value,
        assigneeRole: task.assigneeRole as AssigneeRole,
        dueOffsetDays: typeof offset === "number" ? offset : 0,
      });
    });
  }

  let revision: number | null = null;
  if (options.update) {
    if (typeof body.revision !== "number" || !Number.isSafeInteger(body.revision) || body.revision < 1) {
      errors.revision = "Reload the page: the edit is missing its revision.";
    } else revision = body.revision;
  }

  if (Object.keys(errors).length > 0) return { valid: false, errors };
  return { valid: true, data: { kind, name: name.value!, description: description.value, isActive, tasks, revision } };
}

// ------------------------------------------------------------ plans

export interface PlanStartInput {
  employeeId: number;
  kind: LifecycleKind;
  templateId: number;
  startsOn: string;
  targetDate: string;
  exitStatus: ExitStatus | null;
}

export function validatePlanStart(input: unknown): Validation<PlanStartInput> {
  const body = asBody(input);
  if (!body) return { valid: false, errors: { form: "Send the plan as a JSON object." } };
  const errors: Errors = {};
  unknownFields(body, ["employeeId", "kind", "templateId", "startsOn", "targetDate", "exitStatus"], errors);

  const employeeId = idField(body.employeeId);
  if (employeeId === null) errors.employeeId = "Choose the employee.";
  const kind = body.kind as LifecycleKind;
  if (!lifecycleKinds.includes(kind)) errors.kind = "Choose onboarding or offboarding.";
  const templateId = idField(body.templateId);
  if (templateId === null) errors.templateId = "Choose a checklist.";

  const startsOn = typeof body.startsOn === "string" && parseDate(body.startsOn) ? body.startsOn : null;
  if (!startsOn) errors.startsOn = "Enter a real start date in YYYY-MM-DD format.";
  const targetDate = typeof body.targetDate === "string" && parseDate(body.targetDate) ? body.targetDate : null;
  if (!targetDate) errors.targetDate = kind === "offboarding" ? "Enter the last working day." : "Enter a target completion date.";
  if (startsOn && targetDate && targetDate < startsOn) {
    errors.targetDate = kind === "offboarding" ? "The last working day cannot be before the plan starts." : "The target cannot be before the start.";
  }

  let exitStatus: ExitStatus | null = null;
  if (kind === "offboarding") {
    if (!exitStatuses.includes(body.exitStatus as ExitStatus)) errors.exitStatus = "Choose how they are leaving: resigned, terminated or inactive.";
    else exitStatus = body.exitStatus as ExitStatus;
  } else if (body.exitStatus !== undefined && body.exitStatus !== null && body.exitStatus !== "") {
    errors.exitStatus = "Only offboarding has an exit status.";
  }

  if (Object.keys(errors).length > 0) return { valid: false, errors };
  return { valid: true, data: { employeeId: employeeId!, kind, templateId: templateId!, startsOn: startsOn!, targetDate: targetDate!, exitStatus } };
}

// ------------------------------------------------------------ tasks

export interface TaskUpdateInput {
  status: TaskStatus;
  note: string | null;
}

export function validateTaskUpdate(input: unknown): Validation<TaskUpdateInput> {
  const body = asBody(input);
  if (!body) return { valid: false, errors: { form: "Send the task update as a JSON object." } };
  const errors: Errors = {};
  unknownFields(body, ["status", "note"], errors);
  if (!taskStatuses.includes(body.status as TaskStatus)) errors.status = "Status must be pending, done or skipped.";
  const note = text(body.note, "the note", 500, false, true);
  if (note.error) errors.note = note.error;
  if (Object.keys(errors).length > 0) return { valid: false, errors };
  return { valid: true, data: { status: body.status as TaskStatus, note: note.value } };
}
