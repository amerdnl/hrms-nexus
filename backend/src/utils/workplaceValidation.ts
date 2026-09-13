/**
 * Input rules for the workplace layer's HR-authored content: announcements,
 * company holidays and company events. Each validator accepts exactly the
 * fields it names, trims text, rejects control characters other than line
 * breaks in long text, and returns field-keyed errors the forms can show.
 */
import { parseDate } from "./leaveCalculation.js";
import { parseIdParam } from "./employeeValidation.js";

type Errors = Record<string, string>;
export type Validation<T> = { valid: true; data: T } | { valid: false; errors: Errors };

function hasControlCharacters(value: string, allowLineBreaks: boolean): boolean {
  return [...value].some((character) => {
    const code = character.charCodeAt(0);
    if (allowLineBreaks && (code === 10 || code === 13 || code === 9)) return false;
    return code < 32 || code === 127;
  });
}

function text(
  body: Record<string, unknown>,
  field: string,
  label: string,
  max: number,
  errors: Errors,
  options: { required: boolean; multiline?: boolean },
): string | null {
  const raw = body[field];
  if (raw === undefined || raw === null || (typeof raw === "string" && raw.trim() === "")) {
    if (options.required) errors[field] = `Enter ${label}.`;
    return null;
  }
  if (typeof raw !== "string") {
    errors[field] = `Enter ${label} as text.`;
    return null;
  }
  const value = options.multiline ? raw.replace(/\r\n/g, "\n").trim() : raw.trim().replace(/\s+/g, " ");
  if (value.length > max) errors[field] = `Keep ${label} to ${max} characters.`;
  else if (hasControlCharacters(value, options.multiline === true)) errors[field] = `Remove unusual characters from ${label}.`;
  return value;
}

function dateField(body: Record<string, unknown>, field: string, errors: Errors, required: boolean): string | null {
  const raw = body[field];
  if (raw === undefined || raw === null || raw === "") {
    if (required) errors[field] = "Choose a date.";
    return null;
  }
  if (typeof raw !== "string" || !parseDate(raw)) {
    errors[field] = "Enter a real date in YYYY-MM-DD format.";
    return null;
  }
  return raw;
}

function timeField(body: Record<string, unknown>, field: string, errors: Errors): string | null {
  const raw = body[field];
  if (raw === undefined || raw === null || raw === "") return null;
  if (typeof raw !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(raw)) {
    errors[field] = "Enter a time as HH:MM.";
    return null;
  }
  return raw;
}

function unknownFields(body: Record<string, unknown>, allowed: readonly string[], errors: Errors): void {
  const extra = Object.keys(body).filter((key) => !allowed.includes(key));
  if (extra.length > 0) errors.form = `Unexpected field${extra.length === 1 ? "" : "s"}: ${extra.slice(0, 5).join(", ")}.`;
}

function asBody(input: unknown): Record<string, unknown> | null {
  return typeof input === "object" && input !== null && !Array.isArray(input) ? input as Record<string, unknown> : null;
}

function revisionField(body: Record<string, unknown>, errors: Errors): number | null {
  const value = body.revision;
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) {
    errors.revision = "Reload the page: the edit is missing its revision.";
    return null;
  }
  return value;
}

// ------------------------------------------------------------ announcements

export interface AnnouncementInput {
  title: string;
  body: string;
  priority: "normal" | "important";
  audience: "company" | "department";
  departmentId: number | null;
  expiresOn: string | null;
}

const announcementFields = ["title", "body", "priority", "audience", "departmentId", "expiresOn"] as const;

export function validateAnnouncement(
  input: unknown,
  options: { withRevision: boolean },
): Validation<AnnouncementInput & { revision: number | null }> {
  const body = asBody(input);
  if (!body) return { valid: false, errors: { form: "Send the announcement as a JSON object." } };
  const errors: Errors = {};
  unknownFields(body, options.withRevision ? [...announcementFields, "revision"] : announcementFields, errors);

  const title = text(body, "title", "a title", 160, errors, { required: true });
  const content = text(body, "body", "the announcement text", 5000, errors, { required: true, multiline: true });
  const priority = body.priority ?? "normal";
  if (priority !== "normal" && priority !== "important") errors.priority = "Priority must be normal or important.";
  const audience = body.audience ?? "company";
  if (audience !== "company" && audience !== "department") errors.audience = "Send it to the company or one department.";

  let departmentId: number | null = null;
  if (audience === "department") {
    // A JSON number from a form select, or a numeric string; either names one department.
    const raw = typeof body.departmentId === "number" ? String(body.departmentId) : body.departmentId;
    departmentId = parseIdParam(raw);
    if (departmentId === null) errors.departmentId = "Choose the department.";
  } else if (body.departmentId !== undefined && body.departmentId !== null && body.departmentId !== "") {
    errors.departmentId = "Only a department announcement names a department.";
  }
  const expiresOn = dateField(body, "expiresOn", errors, false);
  const revision = options.withRevision ? revisionField(body, errors) : null;

  if (Object.keys(errors).length > 0) return { valid: false, errors };
  return {
    valid: true,
    data: {
      title: title!, body: content!,
      priority: priority as AnnouncementInput["priority"],
      audience: audience as AnnouncementInput["audience"],
      departmentId, expiresOn, revision,
    },
  };
}

// ------------------------------------------------------------ holidays

export interface HolidayInput {
  date: string;
  name: string;
}

export function validateHoliday(
  input: unknown,
  options: { withRevision: boolean },
): Validation<HolidayInput & { revision: number | null }> {
  const body = asBody(input);
  if (!body) return { valid: false, errors: { form: "Send the holiday as a JSON object." } };
  const errors: Errors = {};
  unknownFields(body, options.withRevision ? ["date", "name", "revision"] : ["date", "name"], errors);
  const date = dateField(body, "date", errors, true);
  const name = text(body, "name", "the holiday's name", 120, errors, { required: true });
  const revision = options.withRevision ? revisionField(body, errors) : null;
  if (Object.keys(errors).length > 0) return { valid: false, errors };
  return { valid: true, data: { date: date!, name: name!, revision } };
}

// ------------------------------------------------------------ events

export interface CompanyEventInput {
  title: string;
  description: string | null;
  location: string | null;
  startsOn: string;
  endsOn: string;
  startTime: string | null;
  endTime: string | null;
}

const eventFields = ["title", "description", "location", "startsOn", "endsOn", "startTime", "endTime"] as const;

export function validateCompanyEvent(
  input: unknown,
  options: { withRevision: boolean },
): Validation<CompanyEventInput & { revision: number | null }> {
  const body = asBody(input);
  if (!body) return { valid: false, errors: { form: "Send the event as a JSON object." } };
  const errors: Errors = {};
  unknownFields(body, options.withRevision ? [...eventFields, "revision"] : eventFields, errors);

  const title = text(body, "title", "a title", 120, errors, { required: true });
  const description = text(body, "description", "the description", 1000, errors, { required: false, multiline: true });
  const location = text(body, "location", "the location", 120, errors, { required: false });
  const startsOn = dateField(body, "startsOn", errors, true);
  const endsOn = dateField(body, "endsOn", errors, false) ?? startsOn;
  const startTime = timeField(body, "startTime", errors);
  const endTime = timeField(body, "endTime", errors);

  if (startsOn && endsOn) {
    const span = (Date.parse(`${endsOn}T00:00:00Z`) - Date.parse(`${startsOn}T00:00:00Z`)) / 86_400_000;
    if (span < 0) errors.endsOn = "The event must end on or after the day it starts.";
    else if (span > 31) errors.endsOn = "An event can run for up to 32 days.";
    else if (endTime && !startTime) errors.startTime = "Give a start time as well as an end time.";
    else if (endTime && startTime && span === 0 && endTime <= startTime) errors.endTime = "End after the start time.";
  }
  const revision = options.withRevision ? revisionField(body, errors) : null;

  if (Object.keys(errors).length > 0) return { valid: false, errors };
  return {
    valid: true,
    data: {
      title: title!, description, location,
      startsOn: startsOn!, endsOn: endsOn!, startTime, endTime, revision,
    },
  };
}
