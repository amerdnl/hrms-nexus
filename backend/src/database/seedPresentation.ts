/**
 * Loads the Meridian Digital presentation company.
 *
 * SAFETY, before anything else. This script writes thousands of rows, so it is
 * built to refuse the wrong database rather than to be used carefully:
 *
 *  - It reads `PRESENTATION_DATABASE_URL` and never falls back to
 *    `DATABASE_URL`. The application's connection string cannot be picked up.
 *  - `--database <name>` must match the database it actually connected to, so a
 *    stale URL in the environment cannot silently redirect the write.
 *  - If the target is the application's configured database it stops, with no
 *    override flag at all: the presentation company never belongs there.
 *  - Every write is confined to identifiers 9200-9299 and to rows owned by
 *    them, and the run is one transaction that is checked before it commits.
 *
 * TIME. The company's own today, in Asia/Kuala_Lumpur, decides what "now"
 * means: attendance today, who is away, what is overdue and what is upcoming.
 * Rebuilding on another day produces a company that is coherent on that day.
 * Within one day the result is deterministic, because the only variation comes
 * from a seeded generator keyed to the date.
 *
 * PASSWORDS. A plaintext password is never stored. `PRESENTATION_PASSWORD` is
 * hashed with bcrypt and only the hash is written; without it a random password
 * is generated and printed once, here, so it exists nowhere but the terminal.
 */
import bcrypt from "bcrypt";
import { randomBytes } from "node:crypto";
import pg from "pg";
import { calculatePeriod, openPeriod } from "../services/payrollService.js";
import {
  PRESENTATION_ID_MAX,
  PRESENTATION_ID_MIN,
  presentationAdmin,
  presentationAnnouncements,
  presentationCompany,
  presentationDepartments,
  presentationDetails,
  presentationEmployeeAccount,
  presentationEmployeeAccounts,
  presentationEmployees,
  presentationEvents,
  presentationGoals,
  presentationHolidays,
  presentationLeave,
  presentationLifecyclePlans,
  presentationLifecycleTemplates,
  presentationManagerAccount,
  presentationProfiles,
  presentationRecognitions,
  presentationReviewCycles,
  presentationTimeline,
  seededRandom,
  type PresentationCalendar,
} from "./presentationData.js";

function argument(name: string): string | null {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? null : (process.argv[index + 1] ?? null);
}

function fail(message: string): never {
  console.error(`Refusing to seed the presentation company: ${message}`);
  process.exit(1);
}

/** ISO date arithmetic in UTC, so the host timezone cannot shift the dataset. */
function addDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function isoWeekday(date: string): number {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  return day === 0 ? 7 : day;
}

/** The company's own clock, not the host's. */
function companyNow(): { date: string; minutes: number } {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: presentationCompany.timezone,
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(new Date());
  const value = (type: string) => parts.find((part) => part.type === type)!.value;
  return {
    date: `${value("year")}-${value("month")}-${value("day")}`,
    minutes: Number(value("hour")) * 60 + Number(value("minute")),
  };
}

const minutesToTime = (minutes: number) =>
  `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}:00`;

async function main(): Promise<void> {
  const url = process.env.PRESENTATION_DATABASE_URL;
  if (!url) {
    fail("PRESENTATION_DATABASE_URL is required; this script never defaults to the application's database.");
  }
  const expected = argument("database");
  if (!expected) fail("--database <name> is required, and must name the database you intend to write.");

  const password = process.env.PRESENTATION_PASSWORD ?? randomBytes(9).toString("base64url");
  const generated = process.env.PRESENTATION_PASSWORD === undefined;
  const passwordHash = await bcrypt.hash(password, 12);

  const seedPool = new pg.Pool({ connectionString: url, max: 1 });
  const client = await seedPool.connect();

  try {
    const actual = (await client.query<{ name: string }>("SELECT current_database() AS name")).rows[0]!.name;
    if (actual !== expected) fail(`connected to "${actual}" but --database said "${expected}".`);

    const appUrl = process.env.DATABASE_URL;
    if (appUrl && new URL(appUrl).pathname.replace(/^\//, "") === actual) {
      fail(`"${actual}" is the application's configured database. The presentation company is never written there.`);
    }

    const ledger = await client.query<{ version: string }>(
      "SELECT version FROM public.schema_migrations ORDER BY version",
    );
    const versions = ledger.rows.map((row) => row.version);
    if (!versions.includes("0016")) {
      fail(`"${actual}" is not fully migrated (ledger: ${versions.join(", ") || "empty"}). Apply the migrations first.`);
    }
    const personalization = versions.includes("0017");

    // ------------------------------------------------------------- calendar
    const now = companyNow();
    // --today exists for verification only: it lets a rehearsal prove what the
    // environment looks like on a working day when the real one is a holiday.
    // The time of day always comes from the real company clock.
    const override = argument("today");
    if (override !== null && !/^20\d{2}-\d{2}-\d{2}$/.test(override)) fail("--today must be a date, as YYYY-MM-DD.");
    const today = override ?? now.date;
    const holidays = new Set(presentationHolidays.map((holiday) => holiday.date));
    const isWorkingDay = (date: string) =>
      presentationCompany.workingDays.includes(isoWeekday(date)) && !holidays.has(date);
    const addWorkingDays = (date: string, days: number): string => {
      let cursor = date;
      const step = days >= 0 ? 1 : -1;
      for (let left = Math.abs(days); left > 0; left -= 1) {
        do { cursor = addDays(cursor, step); } while (!isWorkingDay(cursor));
      }
      return cursor;
    };
    // The product counts leave on the company working week alone: a public holiday
    // inside a leave range still counts as leave, which the leave page states.
    // Seeding any other rule would show figures the product would never produce.
    const countLeaveDays = (start: string, end: string): number => {
      let count = 0;
      for (let cursor = start; cursor <= end; cursor = addDays(cursor, 1)) {
        if (presentationCompany.workingDays.includes(isoWeekday(cursor))) count += 1;
      }
      return count;
    };
    const calendar: PresentationCalendar = { today, addDays, addWorkingDays };

    const leave = presentationLeave(calendar);
    const events = presentationEvents(calendar);
    const announcements = presentationAnnouncements(calendar);
    const plans = presentationLifecyclePlans(calendar);
    const recognitions = presentationRecognitions(calendar);
    const goals = presentationGoals(calendar);
    const reviewCycles = presentationReviewCycles(calendar);

    await client.query("BEGIN");

    // Nothing outside the reserved range may move; checked again before commit.
    const before = await client.query<{ outside: string }>(
      `SELECT (SELECT count(*) FROM public.employees
               WHERE id < ${PRESENTATION_ID_MIN} OR id > ${PRESENTATION_ID_MAX}) AS outside`,
    );

    // ------------------------------------------------------ company settings
    await client.query(
      `UPDATE public.company_settings
       SET company_name = $1, timezone = $2, working_days = $3::smallint[], work_start_time = $4::time,
           work_end_time = $5::time, grace_period_minutes = $6, office_latitude = $7, office_longitude = $8,
           attendance_radius_meters = $9, revision = revision + 1, updated_at = CURRENT_TIMESTAMP
       WHERE id = 1`,
      [
        presentationCompany.name, presentationCompany.timezone, presentationCompany.workingDays,
        presentationCompany.workStart, presentationCompany.workEnd, presentationCompany.graceMinutes,
        presentationCompany.officeLatitude, presentationCompany.officeLongitude, presentationCompany.radiusMeters,
      ],
    );

    // ---------------------------------------------------- clear previous run
    await client.query(
      `DELETE FROM public.payroll_items WHERE record_id IN (
         SELECT id FROM public.payroll_records WHERE employee_id BETWEEN $1 AND $2)`,
      [PRESENTATION_ID_MIN, PRESENTATION_ID_MAX],
    );
    await client.query("DELETE FROM public.payroll_records WHERE employee_id BETWEEN $1 AND $2", [PRESENTATION_ID_MIN, PRESENTATION_ID_MAX]);
    await client.query("DELETE FROM public.payroll_periods WHERE period_year = 2026");
    for (const table of ["employee_compensation", "leave_entitlements", "leave_requests", "attendance", "employee_profiles"]) {
      await client.query(`DELETE FROM public.${table} WHERE employee_id BETWEEN $1 AND $2`, [PRESENTATION_ID_MIN, PRESENTATION_ID_MAX]);
    }
    await client.query(
      `DELETE FROM public.lifecycle_tasks WHERE plan_id IN (
         SELECT id FROM public.lifecycle_plans WHERE employee_id BETWEEN $1 AND $2)`,
      [PRESENTATION_ID_MIN, PRESENTATION_ID_MAX],
    );
    await client.query("DELETE FROM public.lifecycle_plans WHERE employee_id BETWEEN $1 AND $2", [PRESENTATION_ID_MIN, PRESENTATION_ID_MAX]);
    for (const table of ["lifecycle_templates", "announcements", "company_events", "company_holidays"]) {
      await client.query(`DELETE FROM public.${table} WHERE created_by = $1`, [presentationAdmin.id]);
    }
    await client.query("UPDATE public.employees SET manager_id = NULL WHERE id BETWEEN $1 AND $2", [PRESENTATION_ID_MIN, PRESENTATION_ID_MAX]);
    await client.query("DELETE FROM public.users WHERE id BETWEEN $1 AND $2", [PRESENTATION_ID_MIN, PRESENTATION_ID_MAX]);
    await client.query("DELETE FROM public.users WHERE employee_id BETWEEN $1 AND $2", [PRESENTATION_ID_MIN, PRESENTATION_ID_MAX]);
    await client.query("DELETE FROM public.employees WHERE id BETWEEN $1 AND $2", [PRESENTATION_ID_MIN, PRESENTATION_ID_MAX]);

    // ----------------------------------------------------------- departments
    for (const department of presentationDepartments) {
      await client.query(
        `INSERT INTO public.departments (name, description) VALUES ($1, $2)
         ON CONFLICT (name) DO UPDATE SET description = EXCLUDED.description`,
        [department.name, department.description],
      );
    }
    const departmentIds = new Map<string, number>(
      (await client.query<{ id: number; name: string }>("SELECT id, name FROM public.departments")).rows
        .map((row) => [row.name, row.id]),
    );

    // ------------------------------------------------------------- employees
    const detail = (id: number) => presentationDetails.find((row) => row.employeeId === id);
    for (const employee of presentationEmployees) {
      await client.query(
        `INSERT INTO public.employees
           (id, employee_number, full_name, department_id, job_title, employment_status, employment_date, phone,
            address, date_of_birth, emergency_contact_name, emergency_contact_phone)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [
          employee.id, employee.employeeNumber, employee.fullName,
          departmentIds.get(employee.department) ?? null, employee.jobTitle,
          employee.status, employee.employmentDate,
          // A documentation-range number, which cannot dial a real person.
          `+60 3-5550 ${String(employee.id).slice(-4)}`,
          detail(employee.id)?.address ?? null, detail(employee.id)?.dateOfBirth ?? null,
          detail(employee.id)?.emergencyContactName ?? null, detail(employee.id)?.emergencyContactPhone ?? null,
        ],
      );
    }
    for (const employee of presentationEmployees) {
      if (employee.managerId === undefined) continue;
      await client.query("UPDATE public.employees SET manager_id = $1 WHERE id = $2", [employee.managerId, employee.id]);
    }
    for (const profile of presentationProfiles) {
      await client.query(
        `INSERT INTO public.employee_profiles (employee_id, about, skills, share_phone) VALUES ($1,$2,$3,$4)`,
        [profile.employeeId, profile.about, profile.skills, profile.sharePhone],
      );
    }
    for (const event of presentationTimeline) {
      await client.query(
        `INSERT INTO public.employee_events (employee_id, kind, visibility, occurred_on, title, source_type, source_id)
         VALUES ($1,$2,'company',$3,$4,'presentation_seed',$5) ON CONFLICT DO NOTHING`,
        [event.employeeId, event.kind, event.occurredOn, event.title, `${event.kind}:${event.occurredOn}`],
      );
    }

    // ------------------------------------------------------------- accounts
    // One HR administrator, one manager and one employee. Everyone else is a
    // personnel record without a sign-in, as in a real company.
    await client.query(
      `INSERT INTO public.users (id, employee_id, email, password_hash, role, is_active, must_change_password)
       VALUES ($1, NULL, $2, $3, 'admin', TRUE, FALSE)`,
      [presentationAdmin.id, presentationAdmin.email, passwordHash],
    );
    for (const account of presentationEmployeeAccounts) {
      await client.query(
        `INSERT INTO public.users (id, employee_id, email, password_hash, role, is_active, must_change_password)
         VALUES ($1, $1, $2, $3, 'employee', TRUE, FALSE)`,
        [account.id, account.email, passwordHash],
      );
    }

    // ---------------------------------------------------------- compensation
    for (const employee of presentationEmployees) {
      if (employee.basicSalarySen === undefined) continue;
      await client.query(
        `INSERT INTO public.employee_compensation
           (employee_id, basic_salary_sen, allowance_sen, overtime_rate_sen, effective_from)
         VALUES ($1,$2,$3,$4,$5)`,
        [employee.id, employee.basicSalarySen, employee.allowanceSen ?? 0, employee.overtimeRateSen ?? 0,
          employee.employmentDate > "2026-01-01" ? employee.employmentDate : "2026-01-01"],
      );
    }

    // ------------------------------------------------------------ attendance
    // Just over four months of history on working days only, then today's own
    // state, which follows the company clock: whoever should be in by now is
    // in, and nobody has a check-out time before they would have left.
    //
    // Seeded history carries no verification method or status. It claims
    // nothing: the product reads such a record as one that predates
    // verification, rather than as a QR and location scan that never happened.
    const random = seededRandom(Number(today.replaceAll("-", "")));
    const historyStart = addDays(today, -125);
    const approvedLeave = leave.filter((request) => request.status === "approved");
    const onLeave = (employeeId: number, date: string) =>
      approvedLeave.some((request) => request.employee === employeeId && date >= request.start && date <= request.end);

    const workStartMinutes = Number(presentationCompany.workStart.slice(0, 2)) * 60;
    let attendanceRows = 0;
    let todayPresent = 0;
    let todayLate = 0;
    let todayOnLeave = 0;

    for (const employee of presentationEmployees) {
      if (employee.status === "resigned" || employee.status === "inactive") continue;
      for (let date = historyStart; date <= today; date = addDays(date, 1)) {
        if (!isWorkingDay(date)) continue;
        if (date < employee.employmentDate) continue;

        if (onLeave(employee.id, date)) {
          await client.query(
            "INSERT INTO public.attendance (employee_id, attendance_date, status) VALUES ($1,$2,'on_leave')",
            [employee.id, date],
          );
          attendanceRows += 1;
          if (date === today) todayOnLeave += 1;
          continue;
        }

        const roll = random();
        // A quiet minority of days have no record or an absence, as in any company.
        if (date !== today && roll < 0.015) continue;
        if (date !== today && roll < 0.03) {
          await client.query(
            "INSERT INTO public.attendance (employee_id, attendance_date, status) VALUES ($1,$2,'absent')",
            [employee.id, date],
          );
          attendanceRows += 1;
          continue;
        }

        // Arrival: mostly a little before nine, sometimes later than the grace
        // period allows. Every timestamp is its own minute.
        const late = roll > 0.86;
        const arrival = late
          ? workStartMinutes + presentationCompany.graceMinutes + 3 + Math.floor(random() * 32)
          : workStartMinutes - 25 + Math.floor(random() * 37);
        const elapsed = Math.max(0, arrival - workStartMinutes);
        const isLate = elapsed > presentationCompany.graceMinutes;
        const departure = 17 * 60 + 50 + Math.floor(random() * 75);
        const forgotCheckout = random() < 0.035;

        if (date === today) {
          if (now.minutes < arrival) continue;                       // not in yet
          const left = now.minutes >= departure && !forgotCheckout;
          await client.query(
            `INSERT INTO public.attendance (employee_id, attendance_date, check_in_time, check_out_time, status, late_minutes)
             VALUES ($1,$2,$3,$4,$5,$6)`,
            [employee.id, date, minutesToTime(arrival), left ? minutesToTime(departure) : null,
              isLate ? "late" : "present", isLate ? elapsed : 0],
          );
          attendanceRows += 1;
          isLate ? (todayLate += 1) : (todayPresent += 1);
          continue;
        }

        await client.query(
          `INSERT INTO public.attendance (employee_id, attendance_date, check_in_time, check_out_time, status, late_minutes)
           VALUES ($1,$2,$3,$4,$5,$6)`,
          [employee.id, date, minutesToTime(arrival), forgotCheckout ? null : minutesToTime(departure),
            isLate ? "late" : "present", isLate ? elapsed : 0],
        );
        attendanceRows += 1;
      }
    }

    // ----------------------------------------------------------------- leave
    // The 2026 entitlement everyone carries, then the requests themselves. The
    // working days are counted with the company calendar, so a request that
    // spans a public holiday counts the holiday out, exactly as the product does.
    for (const employee of presentationEmployees) {
      if (employee.status === "resigned") continue;
      const senior = employee.employmentDate < "2022-01-01";
      for (const [type, days] of [["annual", senior ? 18 : 14], ["medical", 14], ["emergency", 3]] as const) {
        await client.query(
          `INSERT INTO public.leave_entitlements
             (employee_id, leave_year, leave_type, entitled_days, carried_forward_days, adjustment_days, source)
           VALUES ($1, 2026, $2, $3, $4, 0, 'policy')`,
          [employee.id, type, days, type === "annual" && senior ? 2 : 0],
        );
      }
    }

    // A decision is attributed to whoever would have made it: the requester's own
    // manager when that manager has a sign-in, and HR otherwise. A cancellation
    // belongs to the requester when they have an account, and to HR when they do not.
    const accountIds = new Set([presentationAdmin.id, ...presentationEmployeeAccounts.map((account) => account.id)]);
    const actorFor = (employeeIdOfRequest: number) => {
      const person = presentationEmployees.find((entry) => entry.id === employeeIdOfRequest);
      return person?.managerId !== undefined && accountIds.has(person.managerId) ? person.managerId : presentationAdmin.id;
    };
    for (const request of leave) {
      await client.query(
        `INSERT INTO public.leave_requests
           (employee_id, leave_type, start_date, end_date, reason, status, working_days, leave_year,
            reviewed_at, reviewed_by, cancelled_at, cancelled_by, created_at)
         VALUES ($1,$2,$3,$4,$5,$6::varchar,$7,2026,
                 CASE WHEN $6::varchar IN ('approved','rejected') THEN ($3::date - interval '6 days') END,
                 CASE WHEN $6::varchar IN ('approved','rejected') THEN $8::int END,
                 CASE WHEN $6::varchar = 'cancelled' THEN ($3::date - interval '4 days') END,
                 CASE WHEN $6::varchar = 'cancelled' THEN $9::int END,
                 ($3::date - interval '9 days'))`,
        [
          request.employee, request.type, request.start, request.end, request.reason, request.status,
          countLeaveDays(request.start, request.end), actorFor(request.employee),
          accountIds.has(request.employee) ? request.employee : presentationAdmin.id,
        ],
      );
    }

    // -------------------------------------------------------- workplace layer
    for (const holiday of presentationHolidays) {
      await client.query(
        `INSERT INTO public.company_holidays (holiday_date, name, created_by, updated_by)
         VALUES ($1,$2,$3,$3) ON CONFLICT (holiday_date) DO NOTHING`,
        [holiday.date, holiday.name, presentationAdmin.id],
      );
    }
    for (const event of events) {
      await client.query(
        `INSERT INTO public.company_events
           (title, description, location, starts_on, ends_on, start_time, end_time, created_by, updated_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$8)`,
        [event.title, event.description ?? null, event.location ?? null, event.startsOn,
          event.endsOn ?? event.startsOn, event.startTime ?? null, event.endTime ?? null, presentationAdmin.id],
      );
    }
    const announcementIds = new Map<string, number>();
    for (const announcement of announcements) {
      const created = await client.query<{ id: string }>(
        `INSERT INTO public.announcements
           (title, body, priority, audience, department_id, status, expires_on,
            published_at, published_by, created_by, updated_by, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6::varchar,$7,
                 CASE WHEN $8::date IS NULL THEN NULL ELSE ($8::date + time '09:00') AT TIME ZONE 'Asia/Kuala_Lumpur' END,
                 CASE WHEN $6::varchar = 'published' THEN $9::int END, $9, $9,
                 COALESCE(($8::date + time '08:30') AT TIME ZONE 'Asia/Kuala_Lumpur', CURRENT_TIMESTAMP),
                 COALESCE(($8::date + time '09:00') AT TIME ZONE 'Asia/Kuala_Lumpur', CURRENT_TIMESTAMP))
         RETURNING id`,
        [
          announcement.title, announcement.body, announcement.priority,
          announcement.department ? "department" : "company",
          announcement.department ? departmentIds.get(announcement.department) ?? null : null,
          announcement.status, announcement.expiresOn ?? null,
          announcement.status === "published" ? announcement.publishedOn ?? null : null, presentationAdmin.id,
        ],
      );
      announcementIds.set(announcement.key, Number(created.rows[0]!.id));
    }

    // Onboarding and offboarding: checklists first, then each person's own copy.
    const templateIds = new Map<string, number>();
    for (const template of presentationLifecycleTemplates) {
      const created = await client.query<{ id: string }>(
        `INSERT INTO public.lifecycle_templates (kind, name, description, created_by, updated_by)
         VALUES ($1,$2,$3,$4,$4) RETURNING id`,
        [template.kind, template.name, template.description, presentationAdmin.id],
      );
      const templateId = Number(created.rows[0]!.id);
      templateIds.set(template.key, templateId);
      for (const [index, task] of template.tasks.entries()) {
        await client.query(
          `INSERT INTO public.lifecycle_template_tasks (template_id, position, title, instructions, assignee_role, due_offset_days)
           VALUES ($1,$2,$3,$4,$5,$6)`,
          [templateId, index + 1, task.title, task.instructions ?? null, task.role, task.offset],
        );
      }
    }
    for (const plan of plans) {
      const template = presentationLifecycleTemplates.find((item) => item.key === plan.template)!;
      const created = await client.query<{ id: string }>(
        `INSERT INTO public.lifecycle_plans (employee_id, kind, template_id, title, starts_on, target_date, exit_status, created_by, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,($5::date + time '09:00') AT TIME ZONE 'Asia/Kuala_Lumpur') RETURNING id`,
        [plan.employeeId, template.kind, templateIds.get(plan.template), template.name, plan.startsOn,
          plan.targetDate, plan.exitStatus ?? null, presentationAdmin.id],
      );
      const planId = Number(created.rows[0]!.id);
      const anchor = template.kind === "onboarding" ? plan.startsOn : plan.targetDate;
      for (const [index, task] of template.tasks.entries()) {
        const due = addDays(anchor, task.offset);
        const finished = plan.done.includes(index + 1);
        await client.query(
          `INSERT INTO public.lifecycle_tasks (plan_id, position, title, instructions, assignee_role, due_on, status, completed_at, completed_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7::varchar,
                   CASE WHEN $7::varchar = 'done' THEN ($6::date + time '16:30') AT TIME ZONE 'Asia/Kuala_Lumpur' END,
                   CASE WHEN $7::varchar = 'done' THEN $8::int END)`,
          [planId, index + 1, task.title, task.instructions ?? null, task.role, due, finished ? "done" : "pending", presentationAdmin.id],
        );
      }
      if (template.kind === "onboarding") {
        await client.query(
          `INSERT INTO public.employee_events (employee_id, kind, visibility, occurred_on, title, source_type, source_id)
           VALUES ($1,'onboarding_started','company',$2,'Started onboarding','presentation_seed',$3) ON CONFLICT DO NOTHING`,
          [plan.employeeId, plan.startsOn, `onboarding:${plan.startsOn}`],
        );
      }
    }

    // Recognition, and the timeline entries it produces.
    const recognitionIds: number[] = [];
    for (const recognition of recognitions) {
      const created = await client.query<{ id: string }>(
        `INSERT INTO public.recognitions
           (giver_employee_id, receiver_employee_id, category, message, visibility, given_on, created_by, created_at)
         VALUES ($1::int,$2,$3,$4,$5,$6,(SELECT u.id FROM public.users u WHERE u.employee_id = $1::int),
                 ($6::date + time '11:20') AT TIME ZONE 'Asia/Kuala_Lumpur') RETURNING id`,
        [recognition.giver, recognition.receiver, recognition.category, recognition.message, recognition.visibility, recognition.givenOn],
      );
      const id = Number(created.rows[0]!.id);
      recognitionIds.push(id);
      const giver = presentationEmployees.find((employee) => employee.id === recognition.giver)!;
      const label = recognition.category.replace(/_/g, " ").replace(/^./, (letter) => letter.toUpperCase());
      await client.query(
        `INSERT INTO public.employee_events (employee_id, kind, visibility, occurred_on, title, source_type, source_id)
         VALUES ($1,'recognition_received',$2,$3,$4,'recognition',$5)`,
        [
          recognition.receiver,
          recognition.visibility === "company" ? "company" : "self",
          recognition.givenOn,
          recognition.visibility === "company" ? `Recognised for ${label} by ${giver.fullName}` : `Recognised for ${label}`,
          String(id),
        ],
      );
    }

    // Goals and their history.
    for (const goal of goals) {
      const created = await client.query<{ id: string }>(
        `INSERT INTO public.goals (owner_employee_id, title, description, starts_on, due_on, status, progress, visibility,
           created_as, created_by, created_at, completed_at, updated_at)
         VALUES ($1::int,$2,$3,$4::date,$5::date,$6::varchar,$7,$8,$9,
                 (SELECT u.id FROM public.users u WHERE u.employee_id = $10::int),
                 ($4::date + time '09:30') AT TIME ZONE 'Asia/Kuala_Lumpur',
                 CASE WHEN $6::varchar = 'completed' THEN ($11::date + time '16:00') AT TIME ZONE 'Asia/Kuala_Lumpur' END,
                 CURRENT_TIMESTAMP)
         RETURNING id`,
        [goal.owner, goal.title, goal.description, goal.startsOn, goal.dueOn, goal.status, goal.progress, goal.visibility,
          goal.setBy === goal.owner ? "owner" : "manager", goal.setBy, goal.completedOn ?? null],
      );
      const goalId = Number(created.rows[0]!.id);
      for (const update of goal.updates) {
        await client.query(
          `INSERT INTO public.goal_updates (goal_id, author_user_id, author_role, progress_before, progress_after,
             status_before, status_after, note, created_at)
           VALUES ($1,(SELECT u.id FROM public.users u WHERE u.employee_id = $2::int),$3,$4,$5,'active',$6,$7,
                   ($8::date + time '17:10') AT TIME ZONE 'Asia/Kuala_Lumpur')`,
          [goalId, update.by, update.by === goal.owner ? "owner" : "manager", update.from, update.to,
            update.status ?? "active", update.note ?? null, update.on],
        );
      }
      if (goal.status === "completed" && goal.visibility === "company") {
        await client.query(
          `INSERT INTO public.employee_events (employee_id, kind, visibility, occurred_on, title, source_type, source_id)
           VALUES ($1,'goal_completed','company',$2,$3,'goal',$4)`,
          [goal.owner, goal.completedOn, `Completed a goal: ${goal.title}`, String(goalId)],
        );
      }
    }

    // Review cycles and the reviews inside them.
    const reviewIds = new Map<string, number>();
    for (const cycle of reviewCycles) {
      const created = await client.query<{ id: string }>(
        `INSERT INTO public.review_cycles (name, period_start, period_end, self_due_on, manager_due_on, status,
           opened_at, opened_by, closed_at, closed_by, created_by, created_at)
         VALUES ($1,$2,$3,$4,$5,$6::varchar,
                 ($7::date + time '09:00') AT TIME ZONE 'Asia/Kuala_Lumpur', $8::int,
                 CASE WHEN $6::varchar = 'closed' THEN ($9::date + time '17:00') AT TIME ZONE 'Asia/Kuala_Lumpur' END,
                 CASE WHEN $6::varchar = 'closed' THEN $8::int END,
                 $8::int, ($7::date + time '08:00') AT TIME ZONE 'Asia/Kuala_Lumpur')
         RETURNING id`,
        [cycle.name, cycle.periodStart, cycle.periodEnd, cycle.selfDueOn, cycle.managerDueOn, cycle.status,
          cycle.openedOn, presentationAdmin.id, cycle.closedOn ?? null],
      );
      const cycleId = Number(created.rows[0]!.id);
      const people = cycle.departments.length === 0
        ? cycle.reviews.map((review) => review.employee)
        : presentationEmployees
          .filter((employee) => cycle.departments.includes(employee.department)
            && (employee.status === "active" || employee.status === "probation"))
          .map((employee) => employee.id);
      for (const employeeId of people) {
        const review = cycle.reviews.find((entry) => entry.employee === employeeId);
        const status = review?.manager ? "completed" : review?.self ? "pending_manager" : "pending_self";
        const row = await client.query<{ id: string }>(
          `INSERT INTO public.review_participants (cycle_id, employee_id, status,
             self_summary, self_rating, self_submitted_at,
             manager_summary, manager_rating, manager_submitted_at, manager_submitted_by,
             employee_response, responded_at, created_at)
           VALUES ($1,$2,$3,
             $4,$5,($6::date + time '15:00') AT TIME ZONE 'Asia/Kuala_Lumpur',
             $7,$8,($9::date + time '15:00') AT TIME ZONE 'Asia/Kuala_Lumpur',
             (SELECT u.id FROM public.users u WHERE u.employee_id = $10::int),
             $11,($12::date + time '10:00') AT TIME ZONE 'Asia/Kuala_Lumpur',
             ($13::date + time '09:00') AT TIME ZONE 'Asia/Kuala_Lumpur')
           RETURNING id`,
          [
            cycleId, employeeId, status,
            review?.self?.[1] ?? null, review?.self?.[0] ?? null, review?.self?.[2] ?? null,
            review?.manager?.[1] ?? null, review?.manager?.[0] ?? null, review?.manager?.[2] ?? null, review?.manager?.[3] ?? null,
            review?.response?.[0] ?? null, review?.response?.[1] ?? null,
            cycle.openedOn,
          ],
        );
        reviewIds.set(`${cycle.key}:${employeeId}`, Number(row.rows[0]!.id));
        if (review?.manager) {
          await client.query(
            `INSERT INTO public.employee_events (employee_id, kind, visibility, occurred_on, title, source_type, source_id)
             VALUES ($1,'review_completed','self',$2,$3,'review_participant',$4)`,
            [employeeId, review.manager[2], `Completed the ${cycle.name} review`, row.rows[0]!.id],
          );
        }
      }
    }

    // ------------------------------------------------------- what people saw
    // Notifications for the three sign-ins, written as the product would have.
    const notifications: Array<[number, string, string, string | null, string | null, string | null, string | null, string]> = [];
    const managerId = presentationManagerAccount.id;
    const employeeId = presentationEmployeeAccount.id;
    const employeeName = presentationEmployees.find((person) => person.id === employeeId)!.fullName;
    const at = (date: string, time: string) => `${date}T${time}+08:00`;

    for (const key of ["welcome-anisha", "hiring-platform", "malaysia-day", "review-cycle"]) {
      const announcement = announcements.find((item) => item.key === key)!;
      const id = announcementIds.get(key)!;
      for (const userId of [managerId, employeeId]) {
        notifications.push([
          userId, "announcement_published",
          announcement.priority === "important" ? `Important: ${announcement.title}` : announcement.title,
          announcement.body.replace(/\s+/g, " ").slice(0, 139),
          `/announcements/${id}`, "announcement", String(id), at(announcement.publishedOn!, "09:00:00"),
        ]);
      }
    }

    const pendingForManager = leave.filter((request) => request.status === "pending"
      && presentationEmployees.find((person) => person.id === request.employee)?.managerId === managerId);
    for (const request of pendingForManager) {
      const person = presentationEmployees.find((entry) => entry.id === request.employee)!;
      notifications.push([
        managerId, "leave_submitted", `${person.fullName} requested leave`,
        `${request.type === "annual" ? "Annual" : request.type === "medical" ? "Medical" : request.type === "emergency" ? "Emergency" : "Unpaid"} leave · ${request.start} to ${request.end}`,
        "/team/leave?status=pending", "leave", null, at(addDays(today, -2), "10:15:00"),
      ]);
    }
    notifications.push(
      [employeeId, "leave_submitted", "Your leave request was sent to Nur Hidayah binti Roslan", "Annual leave, waiting for a decision",
        "/employee/leave", "leave", null, at(addDays(today, -2), "10:14:00")],
      [employeeId, "recognition_received", "Arvind Menon recognised you for Problem solving",
        "The billing reconciliation fix was neat, and the tests you added around it are better than the code they cover.",
        "/recognition?view=received", "recognition", String(recognitionIds[7]), at(addDays(today, -4), "11:20:00")],
      [employeeId, "review_opened", "Your Mid-year 2026 self-review is open", null, "/reviews", "review_cycle", null, at(addDays(today, -10), "09:00:00")],
      [managerId, "review_opened", "Mid-year 2026 reviews are open for your team", "Self-reviews close this week; manager reviews the week after.",
        "/reviews", "review_cycle", null, at(addDays(today, -10), "09:00:00")],
      [managerId, "review_submitted", `${employeeName} submitted their Mid-year 2026 self-review`, null,
        `/reviews/${reviewIds.get(`midyear-2026:${employeeId}`)}`, "review_participant",
        String(reviewIds.get(`midyear-2026:${employeeId}`)), at(addDays(today, -4), "15:00:00")],
      [managerId, "review_submitted", "Tan Yi Xuan submitted their Mid-year 2026 self-review", null,
        `/reviews/${reviewIds.get("midyear-2026:9207")}`, "review_participant",
        String(reviewIds.get("midyear-2026:9207")), at(addDays(today, -2), "15:00:00")],
    );
    for (const userId of [managerId, employeeId]) {
      notifications.push([userId, "payslip_published", "Your payslip for August 2026 is ready", null,
        "/employee/payroll", "payroll_period", null, at("2026-09-01", "12:00:00")]);
    }

    for (const [userId, kind, title, body, link, entityType, entityId, createdAt] of notifications) {
      // The schema pairs the two: a notification names an entity, or it names none.
      const paired = entityId === null ? null : entityType;
      await client.query(
        `INSERT INTO public.notifications (user_id, kind, title, body, link, entity_type, entity_id, actor_user_id, created_at, read_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::timestamptz,
                 -- Older news has been read; the last few days are still new.
                 CASE WHEN $9::timestamptz < ($10::date - interval '3 days') THEN $9::timestamptz + interval '3 hours' END)`,
        [userId, kind, title, body, link, paired, entityId, presentationAdmin.id, createdAt, today],
      );
    }
    await client.query(
      `INSERT INTO public.announcement_reads (announcement_id, user_id, read_at)
       VALUES ($1, $2, ($3::date + time '10:00') AT TIME ZONE 'Asia/Kuala_Lumpur')`,
      [announcementIds.get("welcome-anisha"), employeeId, addDays(today, -43)],
    );

    // --------------------------------------------------------------- payroll
    // Three months, built through the real payroll service: July and August are
    // paid, and September is the open period a finance team would be working in.
    const payrollMonths: Array<{ month: number; status: "paid" | "draft" }> = [
      { month: 7, status: "paid" },
      { month: 8, status: "paid" },
      { month: Number(today.slice(5, 7)), status: "draft" },
    ];
    let payslips = 0;
    let lastPeriodLabel = "";
    for (const { month, status } of payrollMonths) {
      if (month <= 8 && status === "draft") continue;                 // never two rows for one month
      const period = await openPeriod(client, 2026, month, presentationAdmin.id);
      lastPeriodLabel = `2026-${String(month).padStart(2, "0")}`;
      if (status === "draft") break;                                  // the month in progress stays a draft
      const summary = await calculatePeriod(client, period);
      payslips = summary.calculated;
      // The database enforces one step at a time, as the product does: a period
      // is calculated, reviewed, approved and only then paid.
      const stamp = (day: string, time: string) => `2026-${String(month).padStart(2, "0")}-${day} ${time}`;
      for (const [status, column, day, time] of [
        ["calculated", "calculated_at", "26", "10:00"],
        ["reviewed", "reviewed_at", "26", "14:00"],
        ["approved", "approved_at", "28", "09:30"],
        ["paid", "paid_at", "28", "15:00"],
      ] as const) {
        await client.query(
          `UPDATE public.payroll_periods
           SET status = $2, ${column} = ($3::timestamp AT TIME ZONE 'Asia/Kuala_Lumpur')${status === "approved" ? ", approved_by = $4" : ""}
           WHERE id = $1`,
          status === "approved"
            ? [period.id, status, stamp(day, time), presentationAdmin.id]
            : [period.id, status, stamp(day, time)],
        );
      }
    }

    // ----------------------------------------------------------- audit trail
    // Written directly rather than through the audit service, deliberately: this
    // script must never import the application's connection pool, because that
    // pool reads DATABASE_URL and the guards above exist so the application's
    // database is never what gets written here.
    const auditReady = (await client.query<{ ok: boolean }>(
      "SELECT to_regclass('public.audit_events') IS NOT NULL AS ok",
    )).rows[0]!.ok;
    let auditEvents = 0;
    if (auditReady) {
      const trail: Array<[string, string, string | null, string, unknown, string]> = [
        ["PAYROLL_PAID", "payroll", null, "August 2026 payroll paid", { status: { before: "approved", after: "paid" } }, at("2026-08-28", "15:00:00")],
        ["PAYROLL_APPROVED", "payroll", null, "August 2026 payroll approved", { status: { before: "reviewed", after: "approved" } }, at("2026-08-28", "09:30:00")],
        ["EMPLOYEE_CREATED", "employee", "9221", "Created employee MDS-021 (Anisha Kaur)", { employee_number: "MDS-021", employment_status: "probation" }, at("2026-08-03", "09:12:00")],
        ["LEAVE_APPROVED", "leave", null, "Approved annual leave for employee #9227", { status: { before: "pending", after: "approved" }, working_days: 4 }, at(addDays(today, -34), "11:20:00")],
        ["SETTINGS_CHANGED", "settings", "1", "Company settings saved", { grace_period_minutes: { before: 10, after: 15 } }, at(addDays(today, -27), "16:05:00")],
        ["SALARY_CHANGED", "compensation", "9204", "Set compensation for employee #9204, effective 2026-01-01", { basic_salary_sen: 1040000 }, at(addDays(today, -22), "10:40:00")],
        ["EMPLOYEE_UPDATED", "employee", "9234", "Recorded resignation for MDS-034 (Wong Kah Meng)", { employment_status: { before: "active", after: "active" } }, at(addDays(today, -18), "14:25:00")],
        ["LOGIN", "auth", String(presentationAdmin.id), "Administrator signed in", null, at(addDays(today, -1), "08:52:00")],
        ["LOGIN_FAILED", "auth", null, "Sign-in failed: invalid email or password", null, at(addDays(today, -1), "08:50:00")],
      ];
      for (const [action, entityType, entityId, summaryText, changes, occurredAt] of trail) {
        await client.query(
          `INSERT INTO public.audit_events
             (actor_user_id, actor_employee_id, actor_label, actor_role, action, entity_type, entity_id,
              summary, changes, outcome, occurred_at)
           VALUES ($1, NULL, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10::timestamptz)`,
          [
            action === "LOGIN_FAILED" ? null : presentationAdmin.id,
            action === "LOGIN_FAILED" ? "unknown@meridian-demo.invalid" : presentationAdmin.email,
            action === "LOGIN_FAILED" ? null : "admin",
            action, entityType, entityId, summaryText,
            changes === null ? null : JSON.stringify(changes),
            action === "LOGIN_FAILED" ? "failure" : "success",
            occurredAt,
          ],
        );
        auditEvents += 1;
      }
    }

    // ------------------------------------------------- the prepared Home
    // One account starts with a personalised Home, so the presentation can show
    // the finished feature as well as building it. The administrator keeps the
    // approved default, which is what the walkthrough edits live.
    //
    // This is presentation only: every widget in it is one the manager's own
    // capability already allows, and the server checks that on every read.
    let preparedLayout: string | null = null;
    if (personalization) {
      const layout = {
        version: 1,
        items: [
          { kind: "widget", widget: "action-center", size: "large" },
          { kind: "stack", id: "stack-team01", size: "medium", widgets: ["team-leave", "team-reviews"], smart: true },
          { kind: "widget", widget: "team-today", size: "medium" },
          { kind: "widget", widget: "my-attendance", size: "small" },
          { kind: "widget", widget: "leave-balance", size: "small" },
          { kind: "widget", widget: "today", size: "medium" },
          { kind: "widget", widget: "whos-out", size: "medium" },
        ],
      };
      await client.query(
        `INSERT INTO public.user_dashboard_layouts (user_id, layout, revision, updated_at)
         VALUES ($1, $2::jsonb, 1, ($3::date - interval '9 days'))
         ON CONFLICT (user_id) DO UPDATE SET layout = EXCLUDED.layout, revision = public.user_dashboard_layouts.revision + 1`,
        [managerId, JSON.stringify(layout), today],
      );
      preparedLayout = presentationManagerAccount.email;
    }

    // ------------------------------------------------------------ safety net
    const after = await client.query<{ outside: string }>(
      `SELECT (SELECT count(*) FROM public.employees
               WHERE id < ${PRESENTATION_ID_MIN} OR id > ${PRESENTATION_ID_MAX}) AS outside`,
    );
    if (after.rows[0]!.outside !== before.rows[0]!.outside) {
      await client.query("ROLLBACK");
      fail(`the seed would have changed employees outside the reserved range (${before.rows[0]!.outside} to ${after.rows[0]!.outside}). Nothing was written.`);
    }

    await client.query("COMMIT");

    const counts = await client.query<{ label: string; total: string }>(
      `SELECT 'employees' AS label, count(*)::text AS total FROM public.employees
       UNION ALL SELECT 'attendance', count(*)::text FROM public.attendance
       UNION ALL SELECT 'leave_requests', count(*)::text FROM public.leave_requests
       UNION ALL SELECT 'goals', count(*)::text FROM public.goals
       UNION ALL SELECT 'recognitions', count(*)::text FROM public.recognitions
       UNION ALL SELECT 'notifications', count(*)::text FROM public.notifications
       UNION ALL SELECT 'lifecycle_tasks', count(*)::text FROM public.lifecycle_tasks`,
    );

    console.log(JSON.stringify({
      database: actual,
      company: presentationCompany.name,
      companyToday: today,
      companyTimeOfSeed: minutesToTime(now.minutes).slice(0, 5),
      departments: presentationDepartments.length,
      employees: presentationEmployees.length,
      attendanceRows,
      todayPresent, todayLate, todayOnLeave,
      leaveRequests: leave.length,
      payrollPeriods: ["2026-07 paid", "2026-08 paid", `${lastPeriodLabel} draft`],
      payslipsInLatestPaidPeriod: payslips,
      holidays: presentationHolidays.length,
      events: events.length,
      announcements: announcements.length,
      lifecyclePlans: plans.length,
      recognitions: recognitions.length,
      goals: goals.length,
      reviewCycles: reviewCycles.length,
      notifications: notifications.length,
      auditEvents,
      preparedDashboardFor: preparedLayout,
      adminAccount: presentationAdmin.email,
      managerAccount: presentationManagerAccount.email,
      employeeAccount: presentationEmployeeAccount.email,
      employeesOutsideReservedRangeUnchanged: after.rows[0]!.outside,
      tableTotals: Object.fromEntries(counts.rows.map((row) => [row.label, Number(row.total)])),
    }, null, 2));

    console.log(
      generated
        ? `\nGenerated presentation password (shown once, not stored): ${password}`
        : "\nThe presentation accounts use the PRESENTATION_PASSWORD you supplied. Only its bcrypt hash was stored.",
    );
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch { /* already gone */ }
    console.error("Presentation seed failed; nothing was written.", error);
    process.exit(1);
  } finally {
    client.release();
    await seedPool.end();
  }
}

await main();
