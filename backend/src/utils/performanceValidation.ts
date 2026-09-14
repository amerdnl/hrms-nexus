/**
 * Input rules for goals and performance reviews. Each validator accepts exactly
 * the fields it names and returns field-keyed errors.
 */
import { parseIdParam } from "./employeeValidation.js";
import { parseDate } from "./leaveCalculation.js";

type Errors = Record<string, string>;
export type Validation<T> = { valid: true; data: T } | { valid: false; errors: Errors };

export const goalVisibilities = ["private", "team", "company"] as const;
export type GoalVisibility = (typeof goalVisibilities)[number];
export const goalStatuses = ["active", "completed", "cancelled"] as const;
export type GoalStatus = (typeof goalStatuses)[number];

/** The review rating scale, 1 to 5, defined once. */
export const ratingLabels: Record<number, string> = {
  1: "Needs improvement",
  2: "Developing",
  3: "Meets expectations",
  4: "Exceeds expectations",
  5: "Outstanding",
};

function asBody(input: unknown): Record<string, unknown> | null {
  return typeof input === "object" && input !== null && !Array.isArray(input) ? input as Record<string, unknown> : null;
}

function unknownFields(body: Record<string, unknown>, allowed: readonly string[], errors: Errors): void {
  const extra = Object.keys(body).filter((key) => !allowed.includes(key));
  if (extra.length > 0) errors.form = `Unexpected field${extra.length === 1 ? "" : "s"}: ${extra.slice(0, 5).join(", ")}.`;
}

function hasControlCharacters(value: string, multiline: boolean): boolean {
  return [...value].some((character) => {
    const code = character.charCodeAt(0);
    if (multiline && (code === 9 || code === 10 || code === 13)) return false;
    return code < 32 || code === 127;
  });
}

function text(body: Record<string, unknown>, field: string, label: string, max: number, errors: Errors, required: boolean, multiline = false): string | null {
  const raw = body[field];
  if (raw === undefined || raw === null || (typeof raw === "string" && raw.trim() === "")) {
    if (required) errors[field] = `Enter ${label}.`;
    return null;
  }
  if (typeof raw !== "string") {
    errors[field] = `Enter ${label} as text.`;
    return null;
  }
  const value = multiline ? raw.replace(/\r\n/g, "\n").trim() : raw.trim().replace(/\s+/g, " ");
  if (value.length > max) errors[field] = `Keep ${label} to ${max} characters.`;
  else if (hasControlCharacters(value, multiline)) errors[field] = `Remove unusual characters from ${label}.`;
  return value;
}

function date(body: Record<string, unknown>, field: string, errors: Errors, message: string): string | null {
  const raw = body[field];
  if (typeof raw !== "string" || !parseDate(raw)) {
    errors[field] = message;
    return null;
  }
  return raw;
}

function revision(body: Record<string, unknown>, errors: Errors): number | null {
  if (typeof body.revision !== "number" || !Number.isSafeInteger(body.revision) || body.revision < 1) {
    errors.revision = "Reload the page: the edit is missing its revision.";
    return null;
  }
  return body.revision;
}

// ------------------------------------------------------------ goals

export interface GoalInput {
  ownerId: number | null;
  title: string;
  description: string | null;
  startsOn: string;
  dueOn: string;
  visibility: GoalVisibility;
  revision: number | null;
}

export function validateGoal(input: unknown, options: { update: boolean }): Validation<GoalInput> {
  const body = asBody(input);
  if (!body) return { valid: false, errors: { form: "Send the goal as a JSON object." } };
  const errors: Errors = {};
  unknownFields(body, options.update
    ? ["title", "description", "startsOn", "dueOn", "visibility", "revision"]
    : ["ownerId", "title", "description", "startsOn", "dueOn", "visibility"], errors);

  let ownerId: number | null = null;
  if (!options.update && body.ownerId !== undefined && body.ownerId !== null && body.ownerId !== "") {
    ownerId = parseIdParam(typeof body.ownerId === "number" ? String(body.ownerId) : body.ownerId);
    if (ownerId === null) errors.ownerId = "Choose whose goal this is.";
  }
  const title = text(body, "title", "a title", 160, errors, true);
  const description = text(body, "description", "the description", 2000, errors, false, true);
  const startsOn = date(body, "startsOn", errors, "Enter a real start date in YYYY-MM-DD format.");
  const dueOn = date(body, "dueOn", errors, "Enter a real due date in YYYY-MM-DD format.");
  if (startsOn && dueOn && dueOn < startsOn) errors.dueOn = "The due date cannot be before the start.";
  const visibility = body.visibility ?? "private";
  if (!goalVisibilities.includes(visibility as GoalVisibility)) errors.visibility = "Choose private, team or company.";
  const rev = options.update ? revision(body, errors) : null;

  if (Object.keys(errors).length > 0) return { valid: false, errors };
  return { valid: true, data: { ownerId, title: title!, description, startsOn: startsOn!, dueOn: dueOn!, visibility: visibility as GoalVisibility, revision: rev } };
}

export interface GoalProgressInput {
  progress: number;
  status: GoalStatus;
  note: string | null;
}

export function validateGoalProgress(input: unknown): Validation<GoalProgressInput> {
  const body = asBody(input);
  if (!body) return { valid: false, errors: { form: "Send the update as a JSON object." } };
  const errors: Errors = {};
  unknownFields(body, ["progress", "status", "note"], errors);
  const status = body.status ?? "active";
  if (!goalStatuses.includes(status as GoalStatus)) errors.status = "Status must be active, completed or cancelled.";
  let progress = body.progress;
  if (status === "completed" && (progress === undefined || progress === null)) progress = 100;
  if (typeof progress !== "number" || !Number.isInteger(progress) || progress < 0 || progress > 100) {
    errors.progress = "Progress is a whole percentage from 0 to 100.";
  } else if (status === "completed" && progress !== 100) {
    errors.progress = "A completed goal is at 100%.";
  }
  const note = text(body, "note", "the note", 1000, errors, false, true);
  if (Object.keys(errors).length > 0) return { valid: false, errors };
  return { valid: true, data: { progress: progress as number, status: status as GoalStatus, note } };
}

// ------------------------------------------------------------ reviews

export interface CycleInput {
  name: string;
  periodStart: string;
  periodEnd: string;
  selfDueOn: string;
  managerDueOn: string;
  revision: number | null;
}

export function validateCycle(input: unknown, options: { update: boolean }): Validation<CycleInput> {
  const body = asBody(input);
  if (!body) return { valid: false, errors: { form: "Send the cycle as a JSON object." } };
  const errors: Errors = {};
  const fields = ["name", "periodStart", "periodEnd", "selfDueOn", "managerDueOn"];
  unknownFields(body, options.update ? [...fields, "revision"] : fields, errors);
  const name = text(body, "name", "a name", 120, errors, true);
  const periodStart = date(body, "periodStart", errors, "Enter the first day of the period.");
  const periodEnd = date(body, "periodEnd", errors, "Enter the last day of the period.");
  const selfDueOn = date(body, "selfDueOn", errors, "Enter when self-reviews are due.");
  const managerDueOn = date(body, "managerDueOn", errors, "Enter when manager reviews are due.");
  if (periodStart && periodEnd && periodEnd < periodStart) errors.periodEnd = "The period cannot end before it starts.";
  if (selfDueOn && managerDueOn && managerDueOn < selfDueOn) errors.managerDueOn = "Manager reviews are due on or after self-reviews.";
  const rev = options.update ? revision(body, errors) : null;
  if (Object.keys(errors).length > 0) return { valid: false, errors };
  return { valid: true, data: { name: name!, periodStart: periodStart!, periodEnd: periodEnd!, selfDueOn: selfDueOn!, managerDueOn: managerDueOn!, revision: rev } };
}

export interface ReviewWriteInput {
  summary: string | null;
  rating: number | null;
  submit: boolean;
}

export function validateReviewWrite(input: unknown): Validation<ReviewWriteInput> {
  const body = asBody(input);
  if (!body) return { valid: false, errors: { form: "Send the review as a JSON object." } };
  const errors: Errors = {};
  unknownFields(body, ["summary", "rating", "submit"], errors);
  const summary = text(body, "summary", "the review", 4000, errors, false, true);
  let rating: number | null = null;
  if (body.rating !== undefined && body.rating !== null && body.rating !== "") {
    if (typeof body.rating !== "number" || !Number.isInteger(body.rating) || body.rating < 1 || body.rating > 5) {
      errors.rating = "Choose a rating from 1 to 5.";
    } else rating = body.rating;
  }
  const submit = body.submit === true;
  if (body.submit !== undefined && typeof body.submit !== "boolean") errors.submit = "Say whether to submit.";
  if (submit && !errors.summary && !summary) errors.summary = "Write the review before submitting it.";
  if (submit && !errors.rating && rating === null) errors.rating = "Choose a rating before submitting.";
  if (Object.keys(errors).length > 0) return { valid: false, errors };
  return { valid: true, data: { summary, rating, submit } };
}
