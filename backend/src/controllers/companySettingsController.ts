import type { Request, Response } from "express";
import pool from "../config/db.js";
import { actorFromUser, recordAudit } from "../services/auditService.js";
import { diffChanges } from "../utils/auditRedaction.js";
import type { CompanySettings } from "../types/companySettings.js";
import { validateCompanySettings } from "../utils/companySettingsValidation.js";

const columns = `id, company_name, registration_number, address, email, phone, timezone, working_days,
  to_char(work_start_time, 'HH24:MI') AS work_start_time,
  to_char(work_end_time, 'HH24:MI') AS work_end_time,
  grace_period_minutes, office_latitude, office_longitude, attendance_radius_meters,
  revision, created_at, updated_at`;

export async function getCompanySettings(_request: Request, response: Response) {
  try {
    const result = await pool.query<CompanySettings>(`SELECT ${columns} FROM public.company_settings WHERE id = 1`);
    if (!result.rows[0]) {
      response.status(503).json({ success: false, message: "Company settings are not initialized. Contact your administrator." });
      return;
    }
    response.json({ success: true, data: result.rows[0] });
  } catch {
    response.status(503).json({ success: false, message: "Company settings are temporarily unavailable. Please try again." });
  }
}

export async function updateCompanySettings(request: Request, response: Response) {
  const validation = validateCompanySettings(request.body);
  if (!validation.valid) {
    response.status(400).json({ success: false, message: "Check the highlighted settings fields.", errors: validation.errors });
    return;
  }
  const s = validation.data;
  try {
    // Captured before the write so the entry can say what actually changed.
    const previous = await pool.query<CompanySettings>(
      `SELECT ${columns} FROM public.company_settings WHERE id=1`,
    );
    const before = (previous.rows[0] ?? null) as unknown as Record<string, unknown> | null;

    // One conditional statement makes a save atomic and rejects stale admin edits.
    const result = await pool.query<CompanySettings>(`UPDATE public.company_settings SET
      company_name=$1, registration_number=$2, address=$3, email=$4, phone=$5, timezone=$6,
      working_days=$7, work_start_time=$8, work_end_time=$9, grace_period_minutes=$10,
      office_latitude=$11, office_longitude=$12, attendance_radius_meters=$13,
      revision=revision+1, updated_at=CURRENT_TIMESTAMP
      WHERE id=1 AND revision=$14 RETURNING ${columns}`,
    [s.company_name, s.registration_number, s.address, s.email, s.phone, s.timezone,
      s.working_days, s.work_start_time, s.work_end_time, s.grace_period_minutes,
      s.office_latitude, s.office_longitude, s.attendance_radius_meters, s.revision]);
    if (!result.rows[0]) {
      response.status(409).json({ success: false, message: "Settings changed since you opened this page. Reload the latest settings before saving again." });
      return;
    }

    const saved = result.rows[0];
    await recordAudit({
      actor: actorFromUser(request.user, request.user?.email),
      action: "SETTINGS_CHANGED",
      entityType: "settings",
      entityId: 1,
      summary: `Company settings saved (revision ${saved.revision})`,
      // Office coordinates are configuration, not a person's location, so they
      // are recorded: a change to the geofence is exactly the kind of setting an
      // investigation needs to see. The redactor drops them by key name, so the
      // change is reported as a redacted field rather than smuggled through.
      changes: diffChanges(before, saved as unknown as Record<string, unknown>),
    });

    response.json({ success: true, message: "Company settings saved.", data: saved });
  } catch {
    response.status(503).json({ success: false, message: "Unable to save company settings. Reload to check the current values before retrying." });
  }
}
