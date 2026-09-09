/**
 * What may and may not enter the audit log.
 *
 * The audit trail is read by people investigating an incident, exported into
 * tickets, and kept for a long time. That makes it exactly the wrong place for a
 * credential or a location fix, so redaction is applied centrally here rather
 * than trusted to each call site remembering.
 *
 * The rule is deny-by-key-name plus a hard size ceiling, and it is applied
 * recursively: a secret nested two objects deep is still a secret.
 */

/**
 * Key fragments that must never be recorded. Matched case-insensitively as
 * substrings, so `password_hash`, `newPassword` and `qr_token_hash` are all
 * caught by the fragments below without needing their own entries.
 */
const forbiddenKeyFragments = [
  "password", "passwd", "hash", "token", "secret", "jwt", "authorization",
  "credential", "apikey", "api_key", "signature", "salt", "otp", "pin",
  // Attendance verification payloads. A coordinate says where a person
  // physically was; that belongs on the attendance record, not in an audit
  // trail that outlives it.
  "latitude", "longitude", "accuracy", "coordinate", "geolocation",
  "qr", "challenge", "nonce",
];

/** Replaces a forbidden value, so its removal is visible rather than silent. */
export const REDACTED = "[redacted]";

/** Longest single string kept; anything longer is truncated with a marker. */
const MAX_STRING_LENGTH = 300;

/** Deepest object nesting kept, so a pathological body cannot be walked forever. */
const MAX_DEPTH = 4;

/** Most keys kept on any one object. */
const MAX_KEYS = 40;

/** Serialised ceiling, matching the database CHECK on audit_events.changes. */
export const MAX_CHANGES_BYTES = 8192;

export function isForbiddenKey(key: string): boolean {
  const normalized = key.toLowerCase();
  return forbiddenKeyFragments.some((fragment) => normalized.includes(fragment));
}

function sanitizeValue(value: unknown, depth: number): unknown {
  if (value === null || value === undefined) return null;

  if (typeof value === "string") {
    return value.length > MAX_STRING_LENGTH
      ? `${value.slice(0, MAX_STRING_LENGTH)}…[truncated]`
      : value;
  }

  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "boolean") return value;
  if (typeof value === "bigint") return value.toString();
  if (value instanceof Date) return value.toISOString();

  // A function, symbol or class instance has no business being audited.
  if (typeof value !== "object") return null;

  if (depth >= MAX_DEPTH) return "[depth limit]";

  if (Array.isArray(value)) {
    return value.slice(0, MAX_KEYS).map((entry) => sanitizeValue(entry, depth + 1));
  }

  const result: Record<string, unknown> = {};
  let kept = 0;
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (kept >= MAX_KEYS) break;
    result[key] = isForbiddenKey(key) ? REDACTED : sanitizeValue(entry, depth + 1);
    kept += 1;
  }
  return result;
}

/** Sanitises an arbitrary value for storage in `changes`. */
export function sanitize(value: unknown): unknown {
  return sanitizeValue(value, 0);
}

export interface FieldChange {
  before: unknown;
  after: unknown;
}

/**
 * Builds a before/after set containing only the fields that actually changed.
 *
 * Recording every field of every update would bury the one that matters and
 * bloat the row, so unchanged fields are dropped. Forbidden keys are excluded
 * outright rather than compared, because comparing them means reading them.
 */
export function diffChanges(
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null,
  fields?: readonly string[],
): Record<string, FieldChange> | null {
  const keys = fields ?? [
    ...new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})]),
  ];

  const changes: Record<string, FieldChange> = {};
  for (const key of keys) {
    if (isForbiddenKey(key)) continue;

    const previous = before?.[key] ?? null;
    const next = after?.[key] ?? null;
    // Compared after sanitising so a Date and its ISO string do not look
    // different every single time.
    const sanitizedBefore = sanitizeValue(previous, 1);
    const sanitizedAfter = sanitizeValue(next, 1);
    if (JSON.stringify(sanitizedBefore) === JSON.stringify(sanitizedAfter)) continue;

    changes[key] = { before: sanitizedBefore, after: sanitizedAfter };
  }

  return Object.keys(changes).length === 0 ? null : changes;
}

/**
 * Final gate before the database.
 *
 * Returns a value guaranteed to satisfy the 8 KB CHECK, so an oversized change
 * set degrades to a marker instead of failing the business operation that
 * produced it.
 */
export function fitChanges(changes: unknown): unknown {
  if (changes === null || changes === undefined) return null;

  const sanitized = sanitize(changes);
  const encoded = JSON.stringify(sanitized) ?? "null";
  if (Buffer.byteLength(encoded, "utf8") <= MAX_CHANGES_BYTES) return sanitized;

  return { omitted: "change set too large to record", bytes: Buffer.byteLength(encoded, "utf8") };
}
