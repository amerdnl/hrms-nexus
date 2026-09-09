import { createHash, randomBytes } from "node:crypto";
import qrcode from "qrcode-generator";
import type { PoolClient } from "pg";
import {
  QR_TTL_MAX_SECONDS,
  QR_TTL_MIN_SECONDS,
  QR_TTL_SECONDS,
  type AttendanceSettings,
} from "../utils/attendanceVerification.js";

/** Namespaces the payload so a scanner ignores unrelated QR codes. */
const QR_PREFIX = "HRNEXUS1:";

export interface IssuedChallenge {
  /** The scannable payload, and the code an employee can type as a fallback. */
  token: string;
  qrPayload: string;
  qrSvgDataUrl: string;
  expiresAt: string;
  ttlSeconds: number;
}

export type ChallengeFailure = "invalid" | "expired" | "replayed";

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

/**
 * Strips the namespace so a typed code and a scanned payload behave identically.
 *
 * Only whitespace is removed. The code is base64url, where "-" and "_" are real
 * characters, so stripping punctuation would corrupt roughly half of all codes;
 * the display therefore groups the code with spaces alone.
 */
export function normalizeToken(raw: string): string {
  const trimmed = raw.trim();
  const withoutPrefix = trimmed.startsWith(QR_PREFIX) ? trimmed.slice(QR_PREFIX.length) : trimmed;
  return withoutPrefix.replace(/\s+/g, "");
}

/**
 * Issues a short-lived office challenge.
 *
 * One challenge backs one displayed QR, so everyone arriving in the same window
 * scans the same code. Only its SHA-256 hash is stored: reading the table must
 * not yield a usable code.
 */
export async function issueChallenge(
  client: PoolClient,
  issuedByUserId: number,
  ttlSeconds: number = QR_TTL_SECONDS,
): Promise<IssuedChallenge> {
  const ttl = Math.min(Math.max(Math.trunc(ttlSeconds), QR_TTL_MIN_SECONDS), QR_TTL_MAX_SECONDS);
  // 128 bits: unguessable within the window, and still short enough to type.
  const token = randomBytes(16).toString("base64url");
  const payload = `${QR_PREFIX}${token}`;

  const inserted = await client.query<{ expires_at: Date }>(
    `INSERT INTO public.attendance_qr_challenges (token_hash, expires_at, issued_by)
     VALUES ($1, CURRENT_TIMESTAMP + make_interval(secs => $2), $3)
     RETURNING expires_at`,
    [hashToken(token), ttl, issuedByUserId],
  );

  const code = qrcode(0, "M");
  code.addData(payload);
  code.make();
  const svg = code.createSvgTag({ cellSize: 8, margin: 4, scalable: true });

  return {
    token,
    qrPayload: payload,
    // A data URL keeps the SVG out of the DOM as markup, so there is no
    // injection surface even though we generated it ourselves.
    qrSvgDataUrl: `data:image/svg+xml;base64,${Buffer.from(svg, "utf8").toString("base64")}`,
    expiresAt: inserted.rows[0]!.expires_at.toISOString(),
    ttlSeconds: ttl,
  };
}

/**
 * Validates and consumes a challenge for one employee and action.
 *
 * Expiry is evaluated by the database clock, and the uniqueness of
 * (challenge, employee, action) is what makes a captured code non-replayable
 * even inside its window. Must be called inside the caller's transaction so a
 * failed attendance write releases the consumption too.
 */
export async function consumeChallenge(
  client: PoolClient,
  rawToken: string,
  employeeId: number,
  action: "check_in" | "check_out",
): Promise<{ ok: true; challengeId: string } | { ok: false; reason: ChallengeFailure }> {
  const token = normalizeToken(rawToken);
  if (!token || token.length > 128) return { ok: false, reason: "invalid" };

  const found = await client.query<{ id: string; expired: boolean }>(
    `SELECT id, expires_at <= CURRENT_TIMESTAMP AS expired
     FROM public.attendance_qr_challenges
     WHERE token_hash = $1
     FOR UPDATE`,
    [hashToken(token)],
  );

  const challenge = found.rows[0];
  if (!challenge) return { ok: false, reason: "invalid" };
  if (challenge.expired) return { ok: false, reason: "expired" };

  try {
    await client.query(
      `INSERT INTO public.attendance_qr_uses (challenge_id, employee_id, action)
       VALUES ($1, $2, $3)`,
      [challenge.id, employeeId, action],
    );
  } catch (error) {
    if ((error as { code?: string }).code === "23505") return { ok: false, reason: "replayed" };
    throw error;
  }

  return { ok: true, challengeId: challenge.id };
}

/** Expired challenges carry no value; clearing them keeps the table small. */
export async function pruneExpiredChallenges(client: PoolClient): Promise<number> {
  const result = await client.query(
    `DELETE FROM public.attendance_qr_challenges
     WHERE expires_at < CURRENT_TIMESTAMP - INTERVAL '1 day'`,
  );
  return result.rowCount ?? 0;
}

/**
 * Loads the settings attendance depends on. Returns null when settings have not
 * been initialised at all, which callers must treat as fail-closed.
 */
export async function loadAttendanceSettings(
  db: Pick<PoolClient, "query">,
): Promise<AttendanceSettings | null> {
  const result = await db.query<AttendanceSettings>(
    `SELECT timezone,
            to_char(work_start_time, 'HH24:MI') AS work_start_time,
            to_char(work_end_time, 'HH24:MI') AS work_end_time,
            grace_period_minutes, office_latitude, office_longitude,
            attendance_radius_meters, working_days
     FROM public.company_settings WHERE id = 1`,
  );
  return result.rows[0] ?? null;
}
