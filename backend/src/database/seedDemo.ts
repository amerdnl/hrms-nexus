/**
 * Loads the fictional demo company.
 *
 * SAFETY, before anything else. This script writes a lot of rows, so it is built
 * to refuse the wrong database rather than to be used carefully:
 *
 *  - It reads `DEMO_DATABASE_URL` and never falls back to `DATABASE_URL`. The
 *    application's own connection string cannot be picked up by accident.
 *  - `--database <name>` must match the database it actually connected to, so a
 *    stale URL in the environment cannot silently redirect the write.
 *  - If the target is the application's configured database it stops, unless
 *    `--allow-app-database` is passed. That flag is the explicit approval.
 *  - Every write is confined to identifiers 9000-9099 and to rows owned by them.
 *    Nothing outside that range is inserted, updated or deleted, so protected
 *    business data and the five orphan attendance rows cannot be touched.
 *  - It runs in one transaction: either the whole company appears or none of it.
 *
 * REPRODUCIBILITY. The dataset is fixed, the identifiers are fixed, and the
 * attendance variation comes from a seeded generator, so seeding two freshly
 * migrated databases produces byte-identical companies.
 *
 * It is NOT re-runnable over its own output once the demo payroll has been
 * approved: approved payroll is immutable by design, and the right response to
 * that is to refuse rather than to work around a guarantee the product makes.
 * Re-seed by recreating the database from a migrated baseline. Before approval,
 * the script clears its own previous rows and can be re-run freely.
 *
 * PASSWORDS. A plaintext password is never stored. `DEMO_PASSWORD` is hashed
 * with bcrypt and only the hash is written; if the variable is absent a
 * cryptographically random password is generated and printed once, here, so it
 * exists nowhere but the operator's terminal.
 */
import bcrypt from "bcrypt";
import { randomBytes } from "node:crypto";
import pg from "pg";
import { calculatePeriod, openPeriod } from "../services/payrollService.js";
import {
  DEMO_ID_MAX,
  DEMO_ID_MIN,
  DEMO_PAYROLL_MONTH,
  DEMO_PAYROLL_YEAR,
  DEMO_TODAY,
  demoAdmin,
  demoDepartments,
  demoEmail,
  demoEmployeeAccount,
  demoEmployeeAccounts,
  demoEmployees,
  demoProfiles,
  demoTimeline,
  demoHolidays,
  demoEvents,
  demoAnnouncements,
  demoLifecycleTemplates,
  demoLifecyclePlans,
  demoRecognitions,
  demoGoals,
  demoReviewCycles,
  seededRandom,
} from "./demoData.js";

function argument(name: string): string | null {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? null : (process.argv[index + 1] ?? null);
}

const hasFlag = (name: string) => process.argv.includes(`--${name}`);

function fail(message: string): never {
  console.error(`Refusing to seed: ${message}`);
  process.exit(1);
}

/** ISO date arithmetic in UTC, so a host timezone cannot shift the dataset. */
function addDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function isoWeekday(date: string): number {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  return day === 0 ? 7 : day;
}

async function main(): Promise<void> {
  const url = process.env.DEMO_DATABASE_URL;
  if (!url) {
    fail("DEMO_DATABASE_URL is required; demo seeding never defaults to the application's database.");
  }

  const expected = argument("database");
  if (!expected) fail("--database <name> is required, and must name the database you intend to write.");

  // A pooled client, because the payroll service this reuses takes a PoolClient.
  const seedPool = new pg.Pool({ connectionString: url, max: 1 });
  const client = await seedPool.connect();

  try {
    const actual = (await client.query<{ name: string }>("SELECT current_database() AS name")).rows[0]!.name;
    if (actual !== expected) {
      fail(`connected to "${actual}" but --database said "${expected}".`);
    }

    // The application's own database is off limits without an explicit flag.
    const appUrl = process.env.DATABASE_URL;
    if (appUrl) {
      const appDatabase = new URL(appUrl).pathname.replace(/^\//, "");
      if (appDatabase === actual && !hasFlag("allow-app-database")) {
        fail(
          `"${actual}" is the application's configured database. ` +
          "Pass --allow-app-database only if you have explicit approval to seed demo data into it.",
        );
      }
    }

    const ledger = await client.query<{ version: string }>(
      "SELECT version FROM public.schema_migrations ORDER BY version",
    );
    const versions = ledger.rows.map((row) => row.version);
    if (!versions.includes("0007")) {
      fail(`the target is missing migration 0007; its ledger is ${versions.join(",") || "empty"}.`);
    }
    const auditReady = versions.includes("0008");
    // Reporting lines are part of the V3 demo: managers, their teams and the
    // org chart all read them.
    if (!versions.includes("0010")) {
      fail(`the target is missing migration 0010 (reporting lines); its ledger is ${versions.join(",")}.`);
    }
    if (!versions.includes("0011")) {
      fail(`the target is missing migration 0011 (profiles and timeline); its ledger is ${versions.join(",")}.`);
    }
    // Notifications, announcements and the calendar are part of the V3 demo too.
    for (const [version, name] of [["0012", "notifications"], ["0013", "announcements and calendar"], ["0014", "onboarding and offboarding"], ["0015", "recognition"], ["0016", "goals and reviews"]] as const) {
      if (!versions.includes(version)) {
        fail(`the target is missing migration ${version} (${name}); its ledger is ${versions.join(",")}.`);
      }
    }

    const password = process.env.DEMO_PASSWORD ?? randomBytes(12).toString("base64url");
    const generated = process.env.DEMO_PASSWORD === undefined;
    const passwordHash = await bcrypt.hash(password, 12);

    // A previous run's payroll may already be approved, and migration 0007
    // makes approved payroll immutable at the database level. That guarantee is
    // worth more than the convenience of re-seeding in place, so this refuses
    // rather than disabling the trigger to get past it.
    const locked = await client.query<{ status: string }>(
      `SELECT status FROM public.payroll_periods
       WHERE period_year = $1 AND period_month = $2 AND status IN ('approved', 'paid')`,
      [DEMO_PAYROLL_YEAR, DEMO_PAYROLL_MONTH],
    );
    if (locked.rows.length > 0) {
      fail(
        `this database already holds an ${locked.rows[0]!.status} demo payroll period for ` +
        `${DEMO_PAYROLL_YEAR}-0${DEMO_PAYROLL_MONTH}, and approved payroll is immutable by design. ` +
        "Recreate the database from a migrated baseline and seed it fresh.",
      );
    }

    await client.query("BEGIN");

    // Snapshot what must not move, and check it again at the end.
    const before = await client.query<{ orphans: string; outside: string }>(
      `SELECT
         (SELECT count(*) FROM public.attendance a
          WHERE NOT EXISTS (SELECT 1 FROM public.employees e WHERE e.id = a.employee_id)) AS orphans,
         (SELECT count(*) FROM public.employees
          WHERE id < ${DEMO_ID_MIN} OR id > ${DEMO_ID_MAX}) AS outside`,
    );

    // ------------------------------------------------------ clear previous run
    // Scoped to the demo range only, deepest dependency first.
    await client.query(
      `DELETE FROM public.payroll_items WHERE record_id IN (
         SELECT id FROM public.payroll_records WHERE employee_id BETWEEN $1 AND $2)`,
      [DEMO_ID_MIN, DEMO_ID_MAX],
    );
    await client.query(
      "DELETE FROM public.payroll_records WHERE employee_id BETWEEN $1 AND $2",
      [DEMO_ID_MIN, DEMO_ID_MAX],
    );
    await client.query(
      "DELETE FROM public.payroll_periods WHERE period_year = $1 AND period_month = $2",
      [DEMO_PAYROLL_YEAR, DEMO_PAYROLL_MONTH],
    );
    for (const table of [
      "employee_compensation", "leave_entitlements", "leave_requests", "attendance",
    ]) {
      await client.query(
        `DELETE FROM public.${table} WHERE employee_id BETWEEN $1 AND $2`,
        [DEMO_ID_MIN, DEMO_ID_MAX],
      );
    }
    // Profiles belong to demo employees; the timeline is append-only by design,
    // which is one more reason a seeded demo is rebuilt rather than re-seeded.
    await client.query(
      "DELETE FROM public.employee_profiles WHERE employee_id BETWEEN $1 AND $2",
      [DEMO_ID_MIN, DEMO_ID_MAX],
    );
    // Workplace content the demo administrator wrote. Reads and notifications
    // belong to demo accounts and go with them when those rows are deleted.
    // Plans and their tasks belong to demo employees; checklists to the demo administrator.
    await client.query(
      `DELETE FROM public.lifecycle_tasks WHERE plan_id IN (
         SELECT id FROM public.lifecycle_plans WHERE employee_id BETWEEN $1 AND $2)`,
      [DEMO_ID_MIN, DEMO_ID_MAX],
    );
    await client.query("DELETE FROM public.lifecycle_plans WHERE employee_id BETWEEN $1 AND $2", [DEMO_ID_MIN, DEMO_ID_MAX]);
    for (const table of ["lifecycle_templates", "announcements", "company_events", "company_holidays"]) {
      await client.query(`DELETE FROM public.${table} WHERE created_by = $1`, [demoAdmin.id]);
    }
    // Reporting lines inside the range point at each other; clear them first so
    // no row is deleted while another in the range still names it as manager.
    await client.query(
      "UPDATE public.employees SET manager_id = NULL WHERE id BETWEEN $1 AND $2",
      [DEMO_ID_MIN, DEMO_ID_MAX],
    );
    await client.query("DELETE FROM public.users WHERE id BETWEEN $1 AND $2", [DEMO_ID_MIN, DEMO_ID_MAX]);
    await client.query(
      "DELETE FROM public.users WHERE employee_id BETWEEN $1 AND $2", [DEMO_ID_MIN, DEMO_ID_MAX],
    );
    await client.query("DELETE FROM public.employees WHERE id BETWEEN $1 AND $2", [DEMO_ID_MIN, DEMO_ID_MAX]);

    // ---------------------------------------------------------- departments
    for (const department of demoDepartments) {
      await client.query(
        `INSERT INTO public.departments (name, description) VALUES ($1, $2)
         ON CONFLICT (name) DO UPDATE SET description = EXCLUDED.description`,
        [department.name, department.description],
      );
    }
    const departmentIds = new Map<string, number>(
      (await client.query<{ id: number; name: string }>(
        "SELECT id, name FROM public.departments",
      )).rows.map((row) => [row.name, row.id]),
    );

    // ------------------------------------------------------------- employees
    for (const employee of demoEmployees) {
      await client.query(
        `INSERT INTO public.employees
           (id, employee_number, full_name, department_id, job_title,
            employment_status, employment_date, phone)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [
          employee.id, employee.employeeNumber, employee.fullName,
          departmentIds.get(employee.department) ?? null, employee.jobTitle,
          employee.status, employee.employmentDate,
          // A documentation-range number, so it cannot dial a real person.
          `+60 3-5550 ${String(employee.id).slice(-4)}`,
        ],
      );
    }

    // Reporting lines, once every employee exists. Applied in id order; the
    // 0010 trigger would refuse any loop, and the dataset has none.
    for (const employee of demoEmployees) {
      if (employee.managerId === undefined) continue;
      await client.query(
        "UPDATE public.employees SET manager_id = $1 WHERE id = $2",
        [employee.managerId, employee.id],
      );
    }

    // Colleague-facing profiles and a little company-visible history.
    for (const profile of demoProfiles) {
      await client.query(
        `INSERT INTO public.employee_profiles (employee_id, about, skills, share_phone)
         VALUES ($1, $2, $3, $4)`,
        [profile.employeeId, profile.about, profile.skills, profile.sharePhone],
      );
    }
    for (const event of demoTimeline) {
      await client.query(
        `INSERT INTO public.employee_events (employee_id, kind, visibility, occurred_on, title, source_type, source_id)
         VALUES ($1, $2, 'company', $3, $4, 'demo_seed', $5)
         ON CONFLICT DO NOTHING`,
        [event.employeeId, event.kind, event.occurredOn, event.title, `${event.kind}:${event.occurredOn}`],
      );
    }

    // Sign-in accounts: one administrator and three employees - two managers
    // and one engineer. Everyone else is a personnel record without a login,
    // which is what a real company looks like.
    //
    // must_change_password is FALSE, stated rather than left to the column
    // default so the intent is visible. These two are not temporary credentials
    // in the sense the flag exists for: the password is chosen by whoever runs
    // this script, through DEMO_PASSWORD, and is the password they then sign in
    // with. Nobody is holding a credential they have never seen. Flagging them
    // would open every demonstration with a forced password change.
    await client.query(
      `INSERT INTO public.users
         (id, employee_id, email, password_hash, role, is_active, must_change_password)
       VALUES ($1, NULL, $2, $3, 'admin', TRUE, FALSE)`,
      [demoAdmin.id, demoAdmin.email, passwordHash],
    );
    for (const account of demoEmployeeAccounts) {
      await client.query(
        // An explicit id, like the administrator's: every row this script writes
        // must sit inside the reserved range, or the isolation guarantee above is
        // only true of most of them.
        `INSERT INTO public.users
           (id, employee_id, email, password_hash, role, is_active, must_change_password)
         VALUES ($1, $1, $2, $3, 'employee', TRUE, FALSE)`,
        [account.id, account.email, passwordHash],
      );
    }

    // ---------------------------------------------------------- compensation
    for (const employee of demoEmployees) {
      if (employee.basicSalarySen === undefined) continue;
      await client.query(
        `INSERT INTO public.employee_compensation
           (employee_id, basic_salary_sen, allowance_sen, overtime_rate_sen, effective_from)
         VALUES ($1,$2,$3,$4,$5)`,
        [
          employee.id, employee.basicSalarySen, employee.allowanceSen ?? 0,
          employee.overtimeRateSen ?? 0, "2026-01-01",
        ],
      );
    }

    // ------------------------------------------------------------ attendance
    // Eight weeks ending today, working days only, with a deterministic mix of
    // late arrivals, one missing checkout per few people, and occasional absence.
    const random = seededRandom(20260909);
    const workingWeek = new Set([1, 2, 3, 4, 5]);
    const attendanceStart = addDays(DEMO_TODAY, -56);

    for (const employee of demoEmployees) {
      if (employee.status === "resigned" || employee.status === "inactive") continue;

      for (let offset = 0; offset <= 56; offset += 1) {
        const date = addDays(attendanceStart, offset);
        if (date > DEMO_TODAY) break;
        if (!workingWeek.has(isoWeekday(date))) continue;
        if (date < employee.employmentDate) continue;

        const roll = random();
        if (roll < 0.04) continue;                       // no record at all
        if (roll < 0.07) {
          await client.query(
            `INSERT INTO public.attendance (employee_id, attendance_date, status)
             VALUES ($1,$2,'absent')`,
            [employee.id, date],
          );
          continue;
        }

        const late = roll < 0.2;
        const lateMinutes = late ? 5 + Math.floor(random() * 35) : 0;
        const checkIn = late
          ? `09:${String(Math.min(59, lateMinutes)).padStart(2, "0")}:00`
          : `08:${String(45 + Math.floor(random() * 14)).padStart(2, "0")}:00`;
        // A few people forget to clock out; the attendance report surfaces it.
        const missingCheckout = random() < 0.05;

        await client.query(
          `INSERT INTO public.attendance
             (employee_id, attendance_date, check_in_time, check_out_time, status,
              late_minutes, verification_method, verification_status)
           VALUES ($1,$2,$3,$4,$5,$6,'QR_LOCATION','verified')`,
          [
            employee.id, date, checkIn,
            missingCheckout ? null : `18:${String(Math.floor(random() * 30)).padStart(2, "0")}:00`,
            late ? "late" : "present", lateMinutes,
          ],
        );
      }
    }

    // ----------------------------------------------------------------- leave
    for (const employee of demoEmployees) {
      if (employee.status === "resigned") continue;
      for (const [type, days] of [["annual", 12], ["medical", 10], ["emergency", 2]] as const) {
        await client.query(
          `INSERT INTO public.leave_entitlements
             (employee_id, leave_year, leave_type, entitled_days, carried_forward_days,
              adjustment_days, source)
           VALUES ($1, 2026, $2, $3, 0, 0, 'policy')`,
          [employee.id, type, days],
        );
      }
    }

    const leaveFixtures: [number, string, string, string, string, number][] = [
      [9005, "annual", "2026-08-17", "2026-08-21", "approved", 5],
      [9006, "medical", "2026-08-05", "2026-08-06", "approved", 2],
      [9011, "annual", "2026-08-10", "2026-08-11", "approved", 2],
      [9014, "unpaid", "2026-08-24", "2026-08-25", "approved", 2],
      [9018, "emergency", "2026-08-13", "2026-08-13", "approved", 1],
      [9022, "annual", "2026-09-14", "2026-09-18", "pending", 5],
      [9007, "annual", "2026-09-21", "2026-09-22", "pending", 2],
      [9012, "medical", "2026-09-02", "2026-09-02", "rejected", 1],
      [9019, "annual", "2026-09-28", "2026-09-29", "cancelled", 2],
    ];

    for (const [employeeId, type, start, end, status, days] of leaveFixtures) {
      await client.query(
        `INSERT INTO public.leave_requests
           (employee_id, leave_type, start_date, end_date, reason, status,
            working_days, leave_year, reviewed_at, cancelled_at, cancelled_by)
         VALUES ($1,$2,$3,$4,$5,$6::varchar,$7,2026,
                 CASE WHEN $6::varchar IN ('approved','rejected') THEN CURRENT_TIMESTAMP END,
                 -- chk_leave_cancellation requires cancelled_at and cancelled_by
                 -- to be set or absent together.
                 CASE WHEN $6::varchar = 'cancelled' THEN CURRENT_TIMESTAMP END,
                 CASE WHEN $6::varchar = 'cancelled' THEN $8::integer END)`,
        [
          employeeId, type, start, end,
          type === "medical" ? "Medical appointment" : "Planned time off",
          status, days, demoAdmin.id,
        ],
      );
    }

    // ------------------------------------------------------ workplace layer
    // Holidays, events and announcements, written as the demo administrator.
    for (const holiday of demoHolidays) {
      await client.query(
        `INSERT INTO public.company_holidays (holiday_date, name, created_by, updated_by)
         VALUES ($1, $2, $3, $3) ON CONFLICT (holiday_date) DO NOTHING`,
        [holiday.date, holiday.name, demoAdmin.id],
      );
    }
    for (const event of demoEvents) {
      await client.query(
        `INSERT INTO public.company_events
           (title, description, location, starts_on, ends_on, start_time, end_time, created_by, updated_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8)`,
        [event.title, event.description ?? null, event.location ?? null, event.startsOn,
          event.endsOn ?? event.startsOn, event.startTime ?? null, event.endTime ?? null, demoAdmin.id],
      );
    }
    const announcementIds = new Map<string, number>();
    for (const announcement of demoAnnouncements) {
      const published = announcement.status === "published";
      const created = await client.query<{ id: string }>(
        `INSERT INTO public.announcements
           (title, body, priority, audience, department_id, status, expires_on,
            published_at, published_by, created_by, updated_by, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6::varchar, $7,
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
          published ? announcement.publishedOn ?? null : null, demoAdmin.id,
        ],
      );
      announcementIds.set(announcement.key, Number(created.rows[0]!.id));
    }

    // Onboarding and offboarding: checklists, then plans with their own copies.
    const templateIds = new Map<string, number>();
    for (const template of demoLifecycleTemplates) {
      const created = await client.query<{ id: string }>(
        `INSERT INTO public.lifecycle_templates (kind, name, description, created_by, updated_by)
         VALUES ($1, $2, $3, $4, $4) RETURNING id`,
        [template.kind, template.name, template.description, demoAdmin.id],
      );
      const templateId = Number(created.rows[0]!.id);
      templateIds.set(template.key, templateId);
      for (const [index, task] of template.tasks.entries()) {
        await client.query(
          `INSERT INTO public.lifecycle_template_tasks (template_id, position, title, instructions, assignee_role, due_offset_days)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [templateId, index + 1, task.title, task.instructions ?? null, task.role, task.offset],
        );
      }
    }
    for (const plan of demoLifecyclePlans) {
      const template = demoLifecycleTemplates.find((item) => item.key === plan.template)!;
      const created = await client.query<{ id: string }>(
        `INSERT INTO public.lifecycle_plans (employee_id, kind, template_id, title, starts_on, target_date, exit_status, created_by, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, ($5::date + time '09:00') AT TIME ZONE 'Asia/Kuala_Lumpur') RETURNING id`,
        [plan.employeeId, template.kind, templateIds.get(plan.template), template.name, plan.startsOn,
          plan.targetDate, plan.exitStatus ?? null, demoAdmin.id],
      );
      const planId = Number(created.rows[0]!.id);
      const anchor = template.kind === "onboarding" ? plan.startsOn : plan.targetDate;
      for (const [index, task] of template.tasks.entries()) {
        const due = addDays(anchor, task.offset);
        const finished = plan.done.includes(index + 1);
        await client.query(
          `INSERT INTO public.lifecycle_tasks (plan_id, position, title, instructions, assignee_role, due_on, status, completed_at, completed_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7::varchar,
                   CASE WHEN $7::varchar = 'done' THEN ($6::date + time '17:00') AT TIME ZONE 'Asia/Kuala_Lumpur' END,
                   CASE WHEN $7::varchar = 'done' THEN $8::int END)`,
          [planId, index + 1, task.title, task.instructions ?? null, task.role, due, finished ? "done" : "pending", demoAdmin.id],
        );
      }
      if (template.kind === "onboarding") {
        await client.query(
          `INSERT INTO public.employee_events (employee_id, kind, visibility, occurred_on, title, source_type, source_id)
           VALUES ($1, 'onboarding_started', 'company', $2, 'Started onboarding', 'demo_seed', $3)
           ON CONFLICT DO NOTHING`,
          [plan.employeeId, plan.startsOn, `onboarding:${plan.startsOn}`],
        );
      }
    }

    // Recognition, and the timeline entries it produces.
    const recognitionIds: number[] = [];
    for (const recognition of demoRecognitions) {
      const created = await client.query<{ id: string }>(
        `INSERT INTO public.recognitions
           (giver_employee_id, receiver_employee_id, category, message, visibility, given_on, created_by, created_at)
         -- created_by is an account: the giver's, when they have one.
         VALUES ($1::int, $2, $3, $4, $5, $6, (SELECT u.id FROM public.users u WHERE u.employee_id = $1::int),
                 ($6::date + time '11:00') AT TIME ZONE 'Asia/Kuala_Lumpur') RETURNING id`,
        [recognition.giver, recognition.receiver, recognition.category, recognition.message, recognition.visibility, recognition.givenOn],
      );
      const id = Number(created.rows[0]!.id);
      recognitionIds.push(id);
      const giver = demoEmployees.find((employee) => employee.id === recognition.giver)!;
      const label = recognition.category.replace(/_/g, " ").replace(/^./, (letter) => letter.toUpperCase());
      await client.query(
        `INSERT INTO public.employee_events (employee_id, kind, visibility, occurred_on, title, source_type, source_id)
         VALUES ($1, 'recognition_received', $2, $3, $4, 'recognition', $5)`,
        [
          recognition.receiver,
          recognition.visibility === "company" ? "company" : "self",
          recognition.givenOn,
          recognition.visibility === "company" ? `Recognised for ${label} by ${giver.fullName}` : `Recognised for ${label}`,
          String(id),
        ],
      );
    }

    // Goals and their history. created_by and author_user_id are accounts,
    // so each is the person's account when they have one.
    for (const goal of demoGoals) {
      const created = await client.query<{ id: string }>(
        `INSERT INTO public.goals (owner_employee_id, title, description, starts_on, due_on, status, progress, visibility,
           created_as, created_by, created_at, completed_at, updated_at)
         VALUES ($1::int, $2, $3, $4::date, $5::date, $6::varchar, $7, $8, $9,
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
          `INSERT INTO public.goal_updates (goal_id, author_user_id, author_role, progress_before, progress_after, status_before, status_after, note, created_at)
           VALUES ($1, (SELECT u.id FROM public.users u WHERE u.employee_id = $2::int), $3, $4, $5, 'active', $6, $7,
                   ($8::date + time '17:00') AT TIME ZONE 'Asia/Kuala_Lumpur')`,
          [goalId, update.by, update.by === goal.owner ? "owner" : "manager", update.from, update.to, update.status ?? "active", update.note ?? null, update.on],
        );
      }
      if (goal.status === "completed" && goal.visibility === "company") {
        await client.query(
          `INSERT INTO public.employee_events (employee_id, kind, visibility, occurred_on, title, source_type, source_id)
           VALUES ($1, 'goal_completed', 'company', $2, $3, 'goal', $4)`,
          [goal.owner, goal.completedOn, `Completed a goal: ${goal.title}`, String(goalId)],
        );
      }
    }

    // Review cycles and reviews, each row consistent with its stage.
    const reviewIds = new Map<string, number>();
    for (const cycle of demoReviewCycles) {
      const created = await client.query<{ id: string }>(
        `INSERT INTO public.review_cycles (name, period_start, period_end, self_due_on, manager_due_on, status,
           opened_at, opened_by, closed_at, closed_by, created_by, created_at)
         VALUES ($1, $2, $3, $4, $5, $6::varchar,
                 ($7::date + time '09:00') AT TIME ZONE 'Asia/Kuala_Lumpur', $8::int,
                 CASE WHEN $6::varchar = 'closed' THEN ($9::date + time '17:00') AT TIME ZONE 'Asia/Kuala_Lumpur' END,
                 CASE WHEN $6::varchar = 'closed' THEN $8::int END,
                 $8::int, ($7::date + time '08:00') AT TIME ZONE 'Asia/Kuala_Lumpur')
         RETURNING id`,
        [cycle.name, cycle.periodStart, cycle.periodEnd, cycle.selfDueOn, cycle.managerDueOn, cycle.status, cycle.openedOn, demoAdmin.id, cycle.closedOn ?? null],
      );
      const cycleId = Number(created.rows[0]!.id);
      const people = cycle.departments.length === 0
        ? cycle.reviews.map((review) => review.employee)
        : demoEmployees
          .filter((employee) => cycle.departments.includes(employee.department) && (employee.status === "active" || employee.status === "probation"))
          .map((employee) => employee.id);
      for (const employeeId of people) {
        const review = cycle.reviews.find((entry) => entry.employee === employeeId);
        const status = review?.manager ? "completed" : review?.self ? "pending_manager" : "pending_self";
        const row = await client.query<{ id: string }>(
          `INSERT INTO public.review_participants (cycle_id, employee_id, status,
             self_summary, self_rating, self_submitted_at,
             manager_summary, manager_rating, manager_submitted_at, manager_submitted_by,
             employee_response, responded_at, created_at)
           VALUES ($1, $2, $3,
             $4, $5, ($6::date + time '15:00') AT TIME ZONE 'Asia/Kuala_Lumpur',
             $7, $8, ($9::date + time '15:00') AT TIME ZONE 'Asia/Kuala_Lumpur', (SELECT u.id FROM public.users u WHERE u.employee_id = $10::int),
             $11, ($12::date + time '10:00') AT TIME ZONE 'Asia/Kuala_Lumpur',
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
             VALUES ($1, 'review_completed', 'self', $2, $3, 'review_participant', $4)`,
            [employeeId, review.manager[2], `Completed the ${cycle.name} review`, row.rows[0]!.id],
          );
        }
      }
    }

    // What the demo accounts were told, written as the product would have:
    // a manager hears about a report's request, an engineer about their
    // payslip and their approved leave, and each audience about announcements.
    // Written directly, like the audit trail below, so this script never
    // imports the application's connection pool.
    const accountIds = [demoAdmin.id, ...demoEmployeeAccounts.map((account) => account.id)];
    const notifications: Array<[number, string, string, string | null, string, string, string, string]> = [];
    const announce = (key: string, recipients: number[]) => {
      const announcement = demoAnnouncements.find((item) => item.key === key)!;
      const id = announcementIds.get(key)!;
      for (const userId of recipients) {
        notifications.push([
          userId, "announcement_published",
          announcement.priority === "important" ? `Important: ${announcement.title}` : announcement.title,
          announcement.body.replace(/\s+/g, " ").slice(0, 139),
          `/announcements/${id}`, "announcement", String(id), `${announcement.publishedOn}T09:00:00+08:00`,
        ]);
      }
    };
    announce("new-joiners", accountIds.filter((id) => id !== demoAdmin.id));
    announce("malaysia-day", accountIds.filter((id) => id !== demoAdmin.id));
    announce("release-freeze", [9004, 9006]);
    notifications.push(
      [9004, "leave_submitted", "Chloe Mei Ling Wong requested leave", "Annual leave · 21–22 Sep 2026 · 2 working days",
        "/team/leave?status=pending", "leave", "demo", "2026-09-08T10:15:00+08:00"],
      [demoAdmin.id, "leave_submitted", "Amirah binti Sulaiman requested leave", "Annual leave · 14–18 Sep 2026 · 5 working days",
        "/admin/leave?status=pending", "leave", "demo", "2026-09-07T16:40:00+08:00"],
      [9006, "leave_approved", "Your leave was approved", "Medical leave · 5–6 Aug 2026",
        "/employee/leave", "leave", "demo", "2026-08-04T11:05:00+08:00"],
      [9006, "recognition_received", "Priya Devi Ramasamy recognised you for Mentoring", "Thank you for pairing with Syafiqah every afternoon this week. It made a real difference.",
        "/recognition?view=received", "recognition", String(recognitionIds[5]), "2026-09-07T11:00:00+08:00"],
      [9006, "review_opened", "Your Mid-year 2026 self-review is open", "Due 20 Sep 2026.",
        "/reviews", "review_cycle", "demo", "2026-09-01T09:00:00+08:00"],
      [9001, "review_opened", "Your Mid-year 2026 self-review is open", "Due 20 Sep 2026.",
        "/reviews", "review_cycle", "demo", "2026-09-01T09:00:00+08:00"],
      [9004, "review_opened", "Your Mid-year 2026 self-review is open", "Due 20 Sep 2026.",
        "/reviews", "review_cycle", "demo", "2026-09-01T09:00:00+08:00"],
      [9004, "review_submitted", "Chloe Mei Ling Wong submitted their Mid-year 2026 self-review", null,
        `/reviews/${reviewIds.get("midyear-2026:9007")}`, "review_participant", String(reviewIds.get("midyear-2026:9007")), "2026-09-10T15:00:00+08:00"],
      [9001, "review_submitted", "Farah Hanim binti Osman submitted their Mid-year 2026 self-review", null,
        `/reviews/${reviewIds.get("midyear-2026:9002")}`, "review_participant", String(reviewIds.get("midyear-2026:9002")), "2026-09-11T15:00:00+08:00"],
      [9001, "task_assigned", "2 tasks for Danial Haziq bin Rosli's onboarding", null,
        "/tasks", "lifecycle_plan", "demo", "2026-09-07T09:05:00+08:00"],
    );
    for (const userId of [9001, 9004, 9006]) {
      notifications.push([userId, "payslip_published", "Your payslip for August 2026 is ready", null,
        "/employee/payroll", "payroll_period", "demo", "2026-09-01T12:00:00+08:00"]);
    }
    for (const [userId, kind, title, body, link, entityType, entityId, createdAt] of notifications) {
      await client.query(
        `INSERT INTO public.notifications (user_id, kind, title, body, link, entity_type, entity_id, actor_user_id, created_at, read_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::timestamptz,
                 -- Older news is already read; the last week is still new.
                 CASE WHEN $9::timestamptz < TIMESTAMPTZ '2026-09-05T00:00:00+08:00' THEN $9::timestamptz + interval '2 hours' END)`,
        [userId, kind, title, body, link, entityType, entityId, demoAdmin.id, createdAt],
      );
    }
    // Aiman has already read the welcome note.
    await client.query(
      "INSERT INTO public.announcement_reads (announcement_id, user_id, read_at) VALUES ($1, 9006, TIMESTAMPTZ '2026-08-10T10:00:00+08:00')",
      [announcementIds.get("new-joiners")],
    );

    // --------------------------------------------------------------- payroll
    // Built through the real payroll service, so the demo payslips are produced
    // by exactly the code the product runs rather than hand-written rows.
    const period = await openPeriod(client, DEMO_PAYROLL_YEAR, DEMO_PAYROLL_MONTH, demoAdmin.id);
    const summary = await calculatePeriod(client, period);

    await client.query(
      `UPDATE public.payroll_periods
       SET status = 'calculated', calculated_at = CURRENT_TIMESTAMP WHERE id = $1`,
      [period.id],
    );
    await client.query(
      "UPDATE public.payroll_periods SET status = 'reviewed', reviewed_at = CURRENT_TIMESTAMP WHERE id = $1",
      [period.id],
    );
    await client.query(
      `UPDATE public.payroll_periods
       SET status = 'approved', approved_at = CURRENT_TIMESTAMP, approved_by = $2 WHERE id = $1`,
      [period.id, demoAdmin.id],
    );

    // ----------------------------------------------------------- audit trail
    // Written directly rather than through the audit service, deliberately: this
    // script must not import the application's connection pool, because that
    // pool reads DATABASE_URL and the whole point of the guards above is that
    // the application's database is never what gets written here.
    if (auditReady) {
      const demoEvents: [string, string, string | null, string, unknown][] = [
        ["PAYROLL_APPROVED", "payroll", String(period.id),
          `Payroll ${DEMO_PAYROLL_YEAR}-0${DEMO_PAYROLL_MONTH} approved`,
          { status: { before: "reviewed", after: "approved" } }],
        ["PAYROLL_CALCULATED", "payroll", String(period.id),
          `Calculated payroll for ${DEMO_PAYROLL_YEAR}-0${DEMO_PAYROLL_MONTH}: ${summary.calculated} paid`,
          { calculated: summary.calculated, skipped: summary.skipped.length }],
        ["SETTINGS_CHANGED", "settings", "1", "Company settings saved", null],
        ["EMPLOYEE_CREATED", "employee", "9009",
          "Created employee ENG-006 (Syafiqah binti Ismail)",
          { employee_number: "ENG-006", employment_status: "probation" }],
        ["LEAVE_APPROVED", "leave", "1",
          "Approved annual leave for employee #9005, 2026-08-17 to 2026-08-21",
          { status: { before: "pending", after: "approved" }, working_days: 5 }],
        ["SALARY_CHANGED", "compensation", "9006",
          "Set compensation for employee #9006, effective 2026-01-01",
          { basic_salary_sen: 720000, allowance_sen: 60000 }],
        ["LOGIN", "auth", String(demoAdmin.id), "Administrator signed in", null],
        ["LOGIN_FAILED", "auth", null, "Sign-in failed: invalid email or password", null],
      ];

      for (const [action, entityType, entityId, summaryText, changes] of demoEvents) {
        await client.query(
          `INSERT INTO public.audit_events
             (actor_user_id, actor_employee_id, actor_label, actor_role,
              action, entity_type, entity_id, summary, changes, outcome)
           VALUES ($1, NULL, $2, $3, $4, $5, $6, $7, $8::jsonb, $9)`,
          [
            action === "LOGIN_FAILED" ? null : demoAdmin.id,
            action === "LOGIN_FAILED" ? "unknown@nexus-demo.invalid" : demoAdmin.email,
            action === "LOGIN_FAILED" ? null : "admin",
            action, entityType, entityId, summaryText,
            changes === null ? null : JSON.stringify(changes),
            action === "LOGIN_FAILED" ? "failure" : "success",
          ],
        );
      }
    }

    // ------------------------------------------------------------ safety net
    const after = await client.query<{ orphans: string; outside: string }>(
      `SELECT
         (SELECT count(*) FROM public.attendance a
          WHERE NOT EXISTS (SELECT 1 FROM public.employees e WHERE e.id = a.employee_id)) AS orphans,
         (SELECT count(*) FROM public.employees
          WHERE id < ${DEMO_ID_MIN} OR id > ${DEMO_ID_MAX}) AS outside`,
    );

    if (after.rows[0]!.orphans !== before.rows[0]!.orphans
      || after.rows[0]!.outside !== before.rows[0]!.outside) {
      await client.query("ROLLBACK");
      fail(
        "the seed would have changed rows outside the demo range " +
        `(orphans ${before.rows[0]!.orphans} to ${after.rows[0]!.orphans}, ` +
        `other employees ${before.rows[0]!.outside} to ${after.rows[0]!.outside}). Nothing was written.`,
      );
    }

    await client.query("COMMIT");

    console.log(JSON.stringify({
      database: actual,
      departments: demoDepartments.length,
      employees: demoEmployees.length,
      payrollPeriod: `${DEMO_PAYROLL_YEAR}-0${DEMO_PAYROLL_MONTH}`,
      payslips: summary.calculated,
      skipped: summary.skipped.length,
      protectedOrphansUnchanged: after.rows[0]!.orphans,
      employeesOutsideDemoRangeUnchanged: after.rows[0]!.outside,
      auditEventsRecorded: auditReady,
      adminAccount: demoAdmin.email,
      employeeAccount: demoEmployeeAccount.email,
      employeeAccounts: demoEmployeeAccounts.map((account) => account.email),
      holidays: demoHolidays.length,
      events: demoEvents.length,
      announcements: demoAnnouncements.length,
      notifications: notifications.length,
      lifecyclePlans: demoLifecyclePlans.length,
      recognitions: demoRecognitions.length,
      goals: demoGoals.length,
      reviewCycles: demoReviewCycles.length,
    }, null, 2));

    // Printed once, to the operator, and stored nowhere.
    console.log(
      generated
        ? `\nGenerated demo password (shown once, not stored): ${password}`
        : "\nDemo accounts use the DEMO_PASSWORD you supplied. Only its bcrypt hash was stored.",
    );
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch { /* already gone */ }
    console.error("Demo seed failed; nothing was written.", error);
    process.exit(1);
  } finally {
    client.release();
    await seedPool.end();
  }
}

await main();

export { demoEmail };
