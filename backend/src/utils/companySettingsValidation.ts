import type { CompanySettingsInput } from "../types/companySettings.js";

const fields = [
  "company_name", "registration_number", "address", "email", "phone", "timezone",
  "working_days", "work_start_time", "work_end_time", "grace_period_minutes",
  "office_latitude", "office_longitude", "attendance_radius_meters", "revision",
];
const timePattern = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const minutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3));

export function validateCompanySettings(input: unknown):
  | { valid: true; data: CompanySettingsInput }
  | { valid: false; errors: Record<string, string> } {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { valid: false, errors: { _form: "Send a settings object." } };
  }
  const value = input as Record<string, unknown>;
  const errors: Record<string, string> = {};
  if (Object.keys(value).some((key) => !fields.includes(key))) {
    errors._form = "The request contains unsupported fields.";
  }
  for (const field of fields) {
    if (!Object.hasOwn(value, field)) errors[field] = "This field must be supplied.";
  }
  function text(field: string, max: number, required = false): string | null {
    const raw = value[field];
    if (raw === null && !required) return null;
    if (typeof raw !== "string") {
      errors[field] = required ? "Enter a value." : "Enter text or leave this field empty.";
      return null;
    }
    const cleaned = raw.trim();
    const hasControl = [...cleaned].some((character) => {
      const code = character.charCodeAt(0);
      return code < 32 && ![9, 10, 13].includes(code) || code === 127;
    });
    if ((required && !cleaned) || cleaned.length > max || hasControl) {
      errors[field] = `Enter ${required ? "1" : "0"}–${max} characters without control characters.`;
    }
    return cleaned || null;
  }
  const company_name = text("company_name", 200, true);
  const registration_number = text("registration_number", 100);
  const address = text("address", 2000);
  const email = text("email", 254);
  const phone = text("phone", 50);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = "Enter a valid email address.";
  if (phone && (!/^\+?[\d ().-]{3,50}$/.test(phone) || !/\d/.test(phone))) errors.phone = "Enter a phone number using digits, spaces, +, (), dots or hyphens.";

  let timezone = text("timezone", 100, true) ?? "";
  try {
    if (timezone !== "UTC" && !timezone.includes("/")) throw new Error("Not an IANA zone");
    timezone = new Intl.DateTimeFormat("en", { timeZone: timezone }).resolvedOptions().timeZone;
  } catch { errors.timezone = "Choose a valid IANA timezone, such as UTC or Asia/Kuala_Lumpur."; }

  const days = value.working_days;
  if (!Array.isArray(days) || days.length < 1 || days.length > 7 ||
    days.some((day) => !Number.isInteger(day) || day < 1 || day > 7) || new Set(days).size !== days.length) {
    errors.working_days = "Select at least one unique working day (Monday to Sunday).";
  }
  const start = value.work_start_time;
  const end = value.work_end_time;
  if (typeof start !== "string" || !timePattern.test(start)) errors.work_start_time = "Use a valid 24-hour time (HH:mm).";
  if (typeof end !== "string" || !timePattern.test(end)) errors.work_end_time = "Use a valid 24-hour time (HH:mm).";
  const grace = value.grace_period_minutes;
  if (typeof grace !== "number" || !Number.isInteger(grace) || grace < 0 || grace > 1439) {
    errors.grace_period_minutes = "Enter a whole number from 0 to 1439.";
  }
  if (!errors.work_start_time && !errors.work_end_time) {
    const duration = (minutes(end as string) - minutes(start as string) + 1440) % 1440;
    if (duration === 0) errors.work_end_time = "Work start and end times must differ.";
    else if (typeof grace === "number" && grace >= duration) errors.grace_period_minutes = "Grace must be shorter than the working period.";
  }
  for (const [field, bound] of [["office_latitude", 90], ["office_longitude", 180]] as const) {
    const coordinate = value[field];
    if (coordinate !== null && (typeof coordinate !== "number" || !Number.isFinite(coordinate) || Math.abs(coordinate) > bound)) {
      errors[field] = `Enter a number from -${bound} to ${bound}, or leave both coordinates empty.`;
    }
  }
  if ((value.office_latitude === null) !== (value.office_longitude === null)) {
    errors.office_latitude = errors.office_longitude = "Supply both office coordinates, or leave both empty.";
  }
  const radius = value.attendance_radius_meters;
  if (typeof radius !== "number" || !Number.isInteger(radius) || radius < 1 || radius > 10000) errors.attendance_radius_meters = "Enter a whole number from 1 to 10000 metres.";
  const revision = value.revision;
  if (typeof revision !== "number" || !Number.isInteger(revision) || revision < 0 || revision >= 2147483647) errors.revision = "Reload settings before saving.";

  if (Object.keys(errors).length) return { valid: false, errors };
  return { valid: true, data: {
    company_name: company_name!, registration_number, address, email, phone, timezone,
    working_days: [...days as number[]].sort((a, b) => a - b),
    work_start_time: start as string, work_end_time: end as string,
    grace_period_minutes: grace as number, office_latitude: value.office_latitude as number | null,
    office_longitude: value.office_longitude as number | null, attendance_radius_meters: radius as number,
    revision: revision as number,
  } };
}
