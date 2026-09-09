import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { once } from "node:events";
import { test } from "node:test";
import jwt from "jsonwebtoken";
import pg from "pg";
import { loadMigrations, runMigrations } from "../src/database/migrations.js";
import { getZonedNow } from "../src/utils/attendanceVerification.js";

// Explicit opt-in; the only permitted host is the isolated, internal Docker lab.
// Every write below happens in a disposable clone, never in the source database.
test("Attendance verification: migration 0005 and the authenticated QR workflow", {
  skip: process.env.HR_NEXUS_ATTENDANCE_LAB !== "1", timeout: 180_000,
}, async (t) => {
  const suffix = randomBytes(5).toString("hex");
  const host = "hr-nexus-v2-migration-lab";
  const admin = new pg.Pool({ host, user: "postgres", database: "postgres" });
  const database = `hr_nexus_attendance_${suffix}`;
  let pool: pg.Pool | undefined;
  let appPool: pg.Pool | undefined;
  let server: ReturnType<import("express").Express["listen"]> | undefined;

  const OFFICE = { latitude: 3.1390, longitude: 101.6869 };

  try {
    await admin.query(`CREATE DATABASE "${database}" TEMPLATE hr_nexus_v2_settings_baseline`);
    pool = new pg.Pool({ host, user: "postgres", database });
    const db = pool;

    const orphansBefore = (await db.query(
      `SELECT id, employee_id FROM public.attendance a
       WHERE NOT EXISTS (SELECT 1 FROM public.employees e WHERE e.id = a.employee_id) ORDER BY id`,
    )).rows;

    async function businessFingerprint() {
      return (await db.query(
        `SELECT count(*)::integer AS rows,
                md5(COALESCE(jsonb_agg(to_jsonb(t) ORDER BY id)::text,'[]')) AS digest
         FROM public.attendance t`,
      )).rows[0];
    }
    const attendanceBefore = await businessFingerprint();

    const migrations = await loadMigrations();
    const fifth = migrations.find((migration) => migration.version === "0005")!;
    assert.equal(fifth.filename, "0005_attendance_verification.sql");

    await t.test("0005 applies additively and leaves existing attendance untouched", async () => {
      assert.deepEqual(
        (await runMigrations(db, { mode: "apply", database })).newlyApplied,
        ["0002", "0003", "0004", "0005"],
      );

      // Adding nullable columns must not rewrite a single existing row.
      const after = await businessFingerprint();
      assert.equal(after.rows, attendanceBefore.rows);
      assert.deepEqual(
        (await db.query(
          `SELECT id, employee_id FROM public.attendance a
           WHERE NOT EXISTS (SELECT 1 FROM public.employees e WHERE e.id = a.employee_id) ORDER BY id`,
        )).rows,
        orphansBefore,
      );
      // Every legacy row keeps NULL verification metadata; nothing was invented.
      assert.equal((await db.query(
        `SELECT count(*)::integer FROM public.attendance
         WHERE verification_method IS NOT NULL OR verification_status IS NOT NULL
            OR check_in_latitude IS NOT NULL OR late_minutes IS NOT NULL`,
      )).rows[0].count, 0);

      const tables = (await db.query(
        `SELECT tablename FROM pg_tables WHERE schemaname='public'
           AND tablename LIKE 'attendance_qr%' ORDER BY tablename`,
      )).rows.map((row) => row.tablename);
      assert.deepEqual(tables, ["attendance_qr_challenges", "attendance_qr_uses"]);
    });

    await t.test("repeat apply is a no-op with exactly one 0005 ledger row", async () => {
      assert.deepEqual((await runMigrations(db, { mode: "apply", database })).newlyApplied, []);
      assert.equal((await db.query(
        "SELECT count(*)::integer FROM schema_migrations WHERE version='0005'",
      )).rows[0].count, 1);
    });

    await t.test("the database rejects impossible verification metadata", async () => {
      const client = await db.connect();
      try {
        await client.query("BEGIN");
        for (const sql of [
          "UPDATE attendance SET verification_method='SOMETHING_ELSE' WHERE id=1",
          "UPDATE attendance SET verification_status='trusted' WHERE id=1",
          "UPDATE attendance SET check_in_latitude=91, check_in_longitude=0 WHERE id=1",
          "UPDATE attendance SET check_in_latitude=0 WHERE id=1",
          "UPDATE attendance SET check_in_accuracy_meters=-1 WHERE id=1",
          "UPDATE attendance SET late_minutes=-5 WHERE id=1",
        ]) {
          await client.query("SAVEPOINT probe");
          await assert.rejects(client.query(sql), { code: "23514" }, sql);
          await client.query("ROLLBACK TO SAVEPOINT probe");
        }
      } finally {
        await client.query("ROLLBACK");
        client.release();
      }
    });

    // ---------------------------------------------------- authenticated setup

    await db.query(
      `INSERT INTO public.departments (name, description) VALUES ('Engineering','Lab')
         ON CONFLICT (name) DO NOTHING;
       INSERT INTO public.employees (id, employee_number, full_name, department_id, employment_status)
       VALUES (9200, 'ATT-LAB-1', 'Attendance Lab Employee',
               (SELECT id FROM public.departments WHERE name='Engineering'), 'active'),
              (9201, 'ATT-LAB-2', 'Second Lab Employee',
               (SELECT id FROM public.departments WHERE name='Engineering'), 'active');
       INSERT INTO public.users (id, employee_id, email, password_hash, role, is_active)
       VALUES (9200, NULL, 'att-admin@example.invalid', 'unusable-lab-hash', 'admin', TRUE),
              (9201, 9200, 'att-one@example.invalid', 'unusable-lab-hash', 'employee', TRUE),
              (9202, 9201, 'att-two@example.invalid', 'unusable-lab-hash', 'employee', TRUE)`,
    );

    process.env.DATABASE_URL = `postgresql://postgres@${host}/${database}`;
    process.env.JWT_SECRET = randomBytes(32).toString("hex");
    const { default: app } = await import("../src/app.js");
    ({ default: appPool } = await import("../src/config/db.js"));
    server = app.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const base = `http://127.0.0.1:${address.port}/api/attendance`;

    const adminToken = jwt.sign({ role: "admin", employeeId: null }, process.env.JWT_SECRET, {
      subject: "9200", expiresIn: "30m",
    });
    const employeeToken = jwt.sign({ role: "employee", employeeId: 9200 }, process.env.JWT_SECRET, {
      subject: "9201", expiresIn: "30m",
    });
    const otherEmployeeToken = jwt.sign({ role: "employee", employeeId: 9201 }, process.env.JWT_SECRET, {
      subject: "9202", expiresIn: "30m",
    });

    const call = (method: string, endpoint: string, body?: unknown, token: string | null = adminToken) =>
      fetch(`${base}${endpoint}`, {
        method,
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });

    const read = async (response: Response) => {
      const text = await response.text();
      return { status: response.status, body: text ? JSON.parse(text) : {} };
    };

    /** Issues a fresh office QR and returns its code. */
    async function freshCode(): Promise<string> {
      const issued = await read(await call("POST", "/qr", {}));
      assert.equal(issued.status, 201, JSON.stringify(issued.body));
      return issued.body.data.code;
    }

    const atOffice = { ...OFFICE, accuracyMeters: 8 };

    async function configureOffice(overrides: Record<string, unknown> = {}) {
      await db.query(
        `UPDATE public.company_settings SET
           timezone = COALESCE($1, timezone),
           office_latitude = $2, office_longitude = $3,
           attendance_radius_meters = COALESCE($4, attendance_radius_meters),
           work_start_time = COALESCE($5::time, work_start_time),
           work_end_time = COALESCE($6::time, work_end_time),
           grace_period_minutes = COALESCE($7, grace_period_minutes)
         WHERE id = 1`,
        [
          overrides.timezone ?? null,
          overrides.office_latitude === null ? null : (overrides.office_latitude ?? OFFICE.latitude),
          overrides.office_longitude === null ? null : (overrides.office_longitude ?? OFFICE.longitude),
          overrides.attendance_radius_meters ?? null,
          overrides.work_start_time ?? null,
          overrides.work_end_time ?? null,
          overrides.grace_period_minutes ?? null,
        ],
      );
    }

    const clearAttendance = () =>
      db.query("DELETE FROM public.attendance WHERE employee_id IN (9200, 9201)");

    await t.test("attendance fails closed while the office location is unconfigured", async () => {
      await configureOffice({ office_latitude: null, office_longitude: null });

      // An administrator cannot even mint a code that could never be accepted.
      const issued = await read(await call("POST", "/qr", {}));
      assert.equal(issued.status, 503);
      assert.equal(issued.body.code, "office_not_configured");

      const attempt = await read(await call(
        "POST", "/check-in", { token: "anything", position: atOffice }, employeeToken,
      ));
      assert.equal(attempt.status, 503);
      assert.equal(attempt.body.code, "office_not_configured");

      const status = await read(await call("GET", "/verification-status", undefined, employeeToken));
      assert.equal(status.body.data.configured, false);

      assert.equal((await db.query("SELECT count(*)::integer FROM attendance WHERE employee_id=9200")).rows[0].count, 0);
    });

    await configureOffice({ timezone: "Asia/Kuala_Lumpur", attendance_radius_meters: 100 });

    await t.test("only administrators may issue office codes", async () => {
      assert.equal((await call("POST", "/qr", {}, null)).status, 401);
      assert.equal((await call("POST", "/qr", {}, employeeToken)).status, 403);
      const issued = await read(await call("POST", "/qr", {}));
      assert.equal(issued.status, 201);
      assert.match(issued.body.data.qr_svg, /^data:image\/svg\+xml;base64,/);
      assert.ok(issued.body.data.ttl_seconds >= 30 && issued.body.data.ttl_seconds <= 60);
      // Only the hash is stored; the issued code must not be recoverable.
      const stored = (await db.query("SELECT token_hash FROM attendance_qr_challenges ORDER BY id DESC LIMIT 1")).rows[0];
      assert.match(stored.token_hash, /^[0-9a-f]{64}$/);
      assert.notEqual(stored.token_hash, issued.body.data.code);
    });

    await t.test("a valid code inside the radius records a verified check-in", async () => {
      await clearAttendance();
      const result = await read(await call(
        "POST", "/check-in", { token: await freshCode(), position: atOffice }, employeeToken,
      ));
      assert.equal(result.status, 201, JSON.stringify(result.body));

      const row = (await db.query("SELECT * FROM attendance WHERE employee_id=9200")).rows[0];
      assert.equal(row.verification_method, "QR_LOCATION");
      assert.equal(row.verification_status, "verified");
      assert.equal(Number(row.check_in_distance_meters), 0);
      assert.equal(Number(row.check_in_accuracy_meters), 8);
      assert.equal(row.is_manual, false);
      assert.ok(row.check_in_time);
      // Only what the verification needed: no check-out trail exists yet.
      assert.equal(row.check_out_latitude, null);
      assert.equal(row.check_out_time, null);
    });

    await t.test("the recorded time is the server's, not anything the client sends", async () => {
      await clearAttendance();
      const before = getZonedNow("Asia/Kuala_Lumpur");
      const result = await read(await call("POST", "/check-in", {
        token: await freshCode(),
        position: atOffice,
        // All of these are ignored: the client never sets official time or status.
        checkInTime: "03:00:00",
        attendanceDate: "2001-01-01",
        status: "present",
        lateMinutes: 0,
        verificationMethod: "ADMIN_OVERRIDE",
      }, employeeToken));
      assert.equal(result.status, 201);

      const row = (await db.query("SELECT * FROM attendance WHERE employee_id=9200")).rows[0];
      assert.notEqual(row.check_in_time, "03:00:00");
      assert.equal(row.attendance_date.toISOString().slice(0, 10), before.date);
      assert.equal(row.verification_method, "QR_LOCATION");
    });

    await t.test("a code cannot be replayed, reused after expiry, or forged", async () => {
      await clearAttendance();
      const code = await freshCode();

      // First use succeeds.
      assert.equal((await call("POST", "/check-in", { token: code, position: atOffice }, employeeToken)).status, 201);

      // The same employee cannot use that code again for the same action, even
      // though it has not expired.
      await clearAttendance();
      const replay = await read(await call("POST", "/check-in", { token: code, position: atOffice }, employeeToken));
      assert.equal(replay.status, 409);
      assert.equal(replay.body.code, "replayed_code");

      // A different employee may still use the code that is on screen.
      const shared = await read(await call("POST", "/check-in", { token: code, position: atOffice }, otherEmployeeToken));
      assert.equal(shared.status, 201, JSON.stringify(shared.body));

      // Expiry is enforced by the database clock.
      const expiring = await freshCode();
      await db.query(
        `UPDATE attendance_qr_challenges
         SET issued_at = CURRENT_TIMESTAMP - INTERVAL '2 minutes',
             expires_at = CURRENT_TIMESTAMP - INTERVAL '1 second'
         WHERE id = (SELECT max(id) FROM attendance_qr_challenges)`,
      );
      await clearAttendance();
      const expired = await read(await call("POST", "/check-in", { token: expiring, position: atOffice }, employeeToken));
      assert.equal(expired.status, 410);
      assert.equal(expired.body.code, "expired_code");

      // Unknown, tampered and malformed codes are all simply unrecognised.
      for (const bad of [
        "totally-made-up", `${await freshCode()}x`, "HRNEXUS1:", "", "   ",
        "a".repeat(500), "'; DROP TABLE attendance; --",
      ]) {
        const response = await read(await call("POST", "/check-in", { token: bad, position: atOffice }, employeeToken));
        assert.ok([400, 409].includes(response.status), `${bad} -> ${response.status}`);
        assert.notEqual(response.status, 500);
      }

      assert.equal((await db.query("SELECT count(*)::integer FROM attendance WHERE employee_id=9200")).rows[0].count, 0);
      await clearAttendance();
    });

    await t.test("location outside the radius, or too vague, is refused", async () => {
      await clearAttendance();

      // About 1.1 km away.
      const far = await read(await call("POST", "/check-in", {
        token: await freshCode(),
        position: { latitude: 3.1490, longitude: 101.6869, accuracyMeters: 10 },
      }, employeeToken));
      assert.equal(far.status, 403);
      assert.equal(far.body.code, "outside");
      assert.match(far.body.message, /outside the approved 100 m radius/);

      const vague = await read(await call("POST", "/check-in", {
        token: await freshCode(),
        position: { ...OFFICE, accuracyMeters: 400 },
      }, employeeToken));
      assert.equal(vague.status, 422);
      assert.equal(vague.body.code, "accuracy");

      for (const position of [undefined, null, {}, { latitude: 3.139 }, { latitude: 91, longitude: 0, accuracyMeters: 1 }]) {
        const response = await read(await call("POST", "/check-in", {
          token: await freshCode(), position,
        }, employeeToken));
        assert.equal(response.status, 400, JSON.stringify(position));
        assert.equal(response.body.code, "missing_location");
      }

      const noCode = await read(await call("POST", "/check-in", { position: atOffice }, employeeToken));
      assert.equal(noCode.status, 400);
      assert.equal(noCode.body.code, "missing_code");

      // A refused attempt must never leave a record behind.
      assert.equal((await db.query("SELECT count(*)::integer FROM attendance WHERE employee_id=9200")).rows[0].count, 0);
    });

    await t.test("a refused location does not consume the employee's use of the code", async () => {
      await clearAttendance();
      const code = await freshCode();

      const refused = await read(await call("POST", "/check-in", {
        token: code, position: { latitude: 3.1490, longitude: 101.6869, accuracyMeters: 10 },
      }, employeeToken));
      assert.equal(refused.status, 403);

      // Stepping inside the radius and rescanning the same on-screen code works.
      const accepted = await read(await call("POST", "/check-in", { token: code, position: atOffice }, employeeToken));
      assert.equal(accepted.status, 201, JSON.stringify(accepted.body));
    });

    await t.test("duplicate check-in and out-of-order check-out are refused", async () => {
      await clearAttendance();
      assert.equal((await call("POST", "/check-in", { token: await freshCode(), position: atOffice }, employeeToken)).status, 201);

      const duplicate = await read(await call("POST", "/check-in", { token: await freshCode(), position: atOffice }, employeeToken));
      assert.equal(duplicate.status, 409);
      assert.equal(duplicate.body.code, "already_checked_in");

      assert.equal((await call("PATCH", "/check-out", { token: await freshCode(), position: atOffice }, employeeToken)).status, 200);

      const secondCheckout = await read(await call("PATCH", "/check-out", { token: await freshCode(), position: atOffice }, employeeToken));
      assert.equal(secondCheckout.status, 409);
      assert.equal(secondCheckout.body.code, "already_checked_out");

      const row = (await db.query("SELECT * FROM attendance WHERE employee_id=9200")).rows[0];
      assert.ok(row.check_out_time);
      assert.equal(Number(row.check_out_distance_meters), 0);

      await clearAttendance();
      const orphanCheckout = await read(await call("PATCH", "/check-out", { token: await freshCode(), position: atOffice }, employeeToken));
      assert.equal(orphanCheckout.status, 404);
      assert.equal(orphanCheckout.body.code, "not_checked_in");
    });

    await t.test("lateness follows the configured start time and grace boundary", async () => {
      const zonedNow = () => getZonedNow("Asia/Kuala_Lumpur");
      const shiftStart = (minutesAgo: number) => {
        const [h, m] = zonedNow().time.split(":").map(Number);
        const total = (h! * 60 + m! - minutesAgo + 1440) % 1440;
        return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
      };

      // Started 10 minutes ago with a 15 minute grace: inside the boundary.
      await clearAttendance();
      await configureOffice({ work_start_time: shiftStart(10), work_end_time: "23:30", grace_period_minutes: 15 });
      assert.equal((await call("POST", "/check-in", { token: await freshCode(), position: atOffice }, employeeToken)).status, 201);
      let row = (await db.query("SELECT * FROM attendance WHERE employee_id=9200")).rows[0];
      assert.equal(row.status, "present");
      assert.equal(row.late_minutes, 0);

      // Started 40 minutes ago with the same grace: past the boundary.
      await clearAttendance();
      await configureOffice({ work_start_time: shiftStart(40), work_end_time: "23:30", grace_period_minutes: 15 });
      assert.equal((await call("POST", "/check-in", { token: await freshCode(), position: atOffice }, employeeToken)).status, 201);
      row = (await db.query("SELECT * FROM attendance WHERE employee_id=9200")).rows[0];
      assert.equal(row.status, "late");
      assert.ok(row.late_minutes >= 39 && row.late_minutes <= 41, `late_minutes=${row.late_minutes}`);

      // Lateness is snapshotted: moving the start time later must not rewrite it.
      await configureOffice({ work_start_time: shiftStart(0), work_end_time: "23:30", grace_period_minutes: 15 });
      row = (await db.query("SELECT * FROM attendance WHERE employee_id=9200")).rows[0];
      assert.ok(row.late_minutes >= 39, "stored lateness must not follow later settings changes");
      await clearAttendance();
    });

    await t.test("the configured timezone decides the attendance date", async () => {
      await configureOffice({ timezone: "Pacific/Kiritimati", work_start_time: "09:00", work_end_time: "17:00" });
      await clearAttendance();
      assert.equal((await call("POST", "/check-in", { token: await freshCode(), position: atOffice }, employeeToken)).status, 201);
      let row = (await db.query("SELECT * FROM attendance WHERE employee_id=9200")).rows[0];
      assert.equal(row.attendance_date.toISOString().slice(0, 10), getZonedNow("Pacific/Kiritimati").date);

      // The read path must agree with the write path.
      const today = await read(await call("GET", "/today", undefined, employeeToken));
      assert.equal(today.body.data.attendanceDate, getZonedNow("Pacific/Kiritimati").date);

      await configureOffice({ timezone: "Pacific/Niue" });
      await clearAttendance();
      assert.equal((await call("POST", "/check-in", { token: await freshCode(), position: atOffice }, employeeToken)).status, 201);
      row = (await db.query("SELECT * FROM attendance WHERE employee_id=9200")).rows[0];
      assert.equal(row.attendance_date.toISOString().slice(0, 10), getZonedNow("Pacific/Niue").date);

      await configureOffice({ timezone: "Asia/Kuala_Lumpur" });
      await clearAttendance();
    });

    await t.test("an overnight shift treats the early hours as the same shift", async () => {
      // Start 22:00, end 06:00. Whatever the wall clock is now, an arrival before
      // the start must be early rather than an entire day late.
      await configureOffice({ work_start_time: "22:00", work_end_time: "06:00", grace_period_minutes: 10 });
      await clearAttendance();
      assert.equal((await call("POST", "/check-in", { token: await freshCode(), position: atOffice }, employeeToken)).status, 201);
      const row = (await db.query("SELECT * FROM attendance WHERE employee_id=9200")).rows[0];
      // Either early (present) or genuinely into the shift, never a 1000+ minute wrap.
      assert.ok(row.late_minutes < 720, `late_minutes=${row.late_minutes}`);
      await configureOffice({ work_start_time: "09:00", work_end_time: "17:00", grace_period_minutes: 15 });
      await clearAttendance();
    });

    await t.test("administrator overrides record their method and never claim verification", async () => {
      const cases: Array<[string, string]> = [
        ["ADMIN_OVERRIDE", "manual"],
        ["REMOTE_APPROVED", "exception"],
        ["FIELD_WORK", "exception"],
      ];

      for (const [method, expectedStatus] of cases) {
        await db.query("DELETE FROM attendance WHERE employee_id=9201");
        const created = await read(await call("POST", "/manual", {
          employeeId: 9201,
          attendanceDate: getZonedNow("Asia/Kuala_Lumpur").date,
          checkInTime: "09:00:00",
          status: "present",
          adminNote: `Lab ${method}`,
          verificationMethod: method,
        }));
        assert.equal(created.status, 201, JSON.stringify(created.body));

        const row = (await db.query("SELECT * FROM attendance WHERE employee_id=9201")).rows[0];
        assert.equal(row.verification_method, method);
        assert.equal(row.verification_status, expectedStatus);
        assert.equal(row.is_manual, true);
        // An administrator record must never masquerade as a verified scan.
        assert.notEqual(row.verification_status, "verified");
        assert.equal(row.check_in_latitude, null);
      }

      // An administrator cannot declare a record to be a verified QR scan.
      const forged = await read(await call("POST", "/manual", {
        employeeId: 9201,
        attendanceDate: getZonedNow("Asia/Kuala_Lumpur").date,
        checkInTime: "09:00:00",
        status: "present",
        verificationMethod: "QR_LOCATION",
      }));
      assert.equal(forged.status, 400);

      const unknown = await read(await call("POST", "/manual", {
        employeeId: 9201,
        attendanceDate: getZonedNow("Asia/Kuala_Lumpur").date,
        checkInTime: "09:00:00",
        status: "present",
        verificationMethod: "TOTALLY_MADE_UP",
      }));
      assert.equal(unknown.status, 400);
      await db.query("DELETE FROM attendance WHERE employee_id=9201");
    });

    await t.test("clock endpoints require an authenticated employee account", async () => {
      for (const [method, endpoint] of [["POST", "/check-in"], ["PATCH", "/check-out"]] as const) {
        assert.equal((await call(method, endpoint, { token: "x", position: atOffice }, null)).status, 401);
        // A standalone administrator has no employee record to clock.
        assert.equal((await call(method, endpoint, { token: "x", position: atOffice }, adminToken)).status, 401);
      }
      assert.equal((await call("GET", "/today", undefined, null)).status, 401);
    });

    await t.test("verified records and their history survive an administrator edit", async () => {
      await clearAttendance();
      assert.equal((await call("POST", "/check-in", { token: await freshCode(), position: atOffice }, employeeToken)).status, 201);
      const original = (await db.query("SELECT * FROM attendance WHERE employee_id=9200")).rows[0];

      const edited = await read(await call("PATCH", `/${original.id}`, {
        checkOutTime: "18:30:00",
        adminNote: "Forgot to clock out",
      }));
      assert.equal(edited.status, 200, JSON.stringify(edited.body));

      const after = (await db.query("SELECT * FROM attendance WHERE employee_id=9200")).rows[0];
      assert.equal(after.check_out_time, "18:30:00");
      // The original verified check-in evidence is preserved, not overwritten.
      assert.equal(after.verification_method, "QR_LOCATION");
      assert.equal(after.check_in_time, original.check_in_time);
      assert.equal(Number(after.check_in_distance_meters), 0);
      assert.equal(after.id, original.id);
      await clearAttendance();
    });

    await t.test("the protected orphan attendance rows are untouched by the whole suite", async () => {
      assert.deepEqual(
        (await db.query(
          `SELECT id, employee_id FROM public.attendance a
           WHERE NOT EXISTS (SELECT 1 FROM public.employees e WHERE e.id = a.employee_id) ORDER BY id`,
        )).rows,
        orphansBefore,
      );
      assert.equal((await db.query(
        "SELECT count(*)::integer FROM attendance_integrity_exceptions",
      )).rows[0].count, 5);
    });
  } finally {
    if (server) await new Promise<void>((resolve) => server!.close(() => resolve()));
    if (appPool) await appPool.end();
    if (pool) await pool.end();
    await admin.end();
  }
});
