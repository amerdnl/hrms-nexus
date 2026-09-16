/**
 * Saved Home layouts, one row per account (migration 0017).
 *
 * Where the table does not exist yet - an installation that has not applied
 * 0017 - reads report personalization as unavailable and writes refuse, so the
 * account keeps its default Home and no existing page can fail because of it.
 */
import pool from "../config/db.js";
import type { DashboardLayout } from "../utils/dashboardLayout.js";

export class PersonalizationUnavailableError extends Error {
  constructor() {
    super("Home personalization is not available on this installation yet.");
    this.name = "PersonalizationUnavailableError";
  }
}

const isMissingTable = (error: unknown) => (error as { code?: string }).code === "42P01";

export interface StoredLayout {
  layout: unknown;
  revision: number;
  updatedAt: string;
}

export async function findLayout(
  userId: number,
): Promise<{ available: false } | { available: true; stored: StoredLayout | null }> {
  try {
    const result = await pool.query<{ layout: unknown; revision: number; updated_at: Date }>(
      "SELECT layout, revision, updated_at FROM public.user_dashboard_layouts WHERE user_id = $1",
      [userId],
    );
    const row = result.rows[0];
    return {
      available: true,
      stored: row
        ? { layout: row.layout, revision: Number(row.revision), updatedAt: new Date(row.updated_at).toISOString() }
        : null,
    };
  } catch (error) {
    if (isMissingTable(error)) return { available: false };
    throw error;
  }
}

export async function upsertLayout(
  userId: number,
  layout: DashboardLayout,
): Promise<{ revision: number; updatedAt: string }> {
  try {
    const result = await pool.query<{ revision: number; updated_at: Date }>(
      `INSERT INTO public.user_dashboard_layouts (user_id, layout)
       VALUES ($1, $2::jsonb)
       ON CONFLICT (user_id) DO UPDATE
         SET layout = EXCLUDED.layout,
             revision = public.user_dashboard_layouts.revision + 1,
             updated_at = CURRENT_TIMESTAMP
       RETURNING revision, updated_at`,
      [userId, JSON.stringify(layout)],
    );
    const row = result.rows[0]!;
    return { revision: Number(row.revision), updatedAt: new Date(row.updated_at).toISOString() };
  } catch (error) {
    if (isMissingTable(error)) throw new PersonalizationUnavailableError();
    throw error;
  }
}

/** Reset to default: the account's row is removed. True when there was one. */
export async function deleteLayout(userId: number): Promise<boolean> {
  try {
    const result = await pool.query("DELETE FROM public.user_dashboard_layouts WHERE user_id = $1", [userId]);
    return (result.rowCount ?? 0) > 0;
  } catch (error) {
    if (isMissingTable(error)) throw new PersonalizationUnavailableError();
    throw error;
  }
}
