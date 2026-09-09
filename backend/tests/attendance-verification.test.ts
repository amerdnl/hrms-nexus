import assert from "node:assert/strict";
import { test } from "node:test";
import {
  MAX_ACCURACY_METERS,
  distanceMeters,
  evaluateLateness,
  evaluateLocation,
  getZonedNow,
  statusForMethod,
  toMinutes,
  validateReportedPosition,
  verificationMethods,
} from "../src/utils/attendanceVerification.js";
import { normalizeToken } from "../src/services/attendanceQrService.js";

const office = { office_latitude: 3.1390, office_longitude: 101.6869, attendance_radius_meters: 100 };
const shift = { work_start_time: "09:00", work_end_time: "17:00", grace_period_minutes: 15 };

// ------------------------------------------------------------ authoritative clock

test("the zoned clock derives date, time and weekday from the configured zone", () => {
  // A fixed instant: 2026-09-09T16:30:00Z.
  const instant = new Date(Date.UTC(2026, 8, 9, 16, 30, 0));

  const utc = getZonedNow("UTC", instant);
  assert.deepEqual({ date: utc.date, time: utc.time, weekday: utc.weekday },
    { date: "2026-09-09", time: "16:30:00", weekday: 3 });

  // +08:00 puts the same instant late in the same evening.
  const kl = getZonedNow("Asia/Kuala_Lumpur", instant);
  assert.deepEqual({ date: kl.date, time: kl.time }, { date: "2026-09-10", time: "00:30:00" });

  // -05:00 puts it earlier the same day.
  const ny = getZonedNow("America/New_York", instant);
  assert.deepEqual({ date: ny.date, time: ny.time }, { date: "2026-09-09", time: "12:30:00" });
});

test("the configured zone decides which calendar day a clock action belongs to", () => {
  // 17:10 UTC is already the next day in Kuala Lumpur.
  const instant = new Date(Date.UTC(2026, 8, 9, 17, 10, 0));
  assert.equal(getZonedNow("UTC", instant).date, "2026-09-09");
  assert.equal(getZonedNow("Asia/Kuala_Lumpur", instant).date, "2026-09-10");
});

// ------------------------------------------------------------------- lateness

test("lateness follows the configured start time and grace period", () => {
  // The master brief's worked example: 09:00 start, 15 minute grace.
  assert.deepEqual(evaluateLateness("08:55:00", shift),
    { status: "present", lateMinutes: 0, elapsedMinutes: -5 });
  assert.deepEqual(evaluateLateness("09:07:00", shift),
    { status: "present", lateMinutes: 0, elapsedMinutes: 7 });
  assert.deepEqual(evaluateLateness("09:22:00", shift),
    { status: "late", lateMinutes: 22, elapsedMinutes: 22 });
});

test("the grace boundary itself is on time, one minute past it is not", () => {
  assert.equal(evaluateLateness("09:15:00", shift).status, "present");
  assert.equal(evaluateLateness("09:16:00", shift).status, "late");
  assert.equal(evaluateLateness("09:16:00", shift).lateMinutes, 16);
  // Exactly on the start time is never late, whatever the grace.
  assert.equal(evaluateLateness("09:00:00", { ...shift, grace_period_minutes: 0 }).status, "present");
  assert.equal(evaluateLateness("09:01:00", { ...shift, grace_period_minutes: 0 }).status, "late");
});

test("changing the configured start time moves the boundary with it", () => {
  const early = { work_start_time: "07:30", work_end_time: "16:00", grace_period_minutes: 0 };
  assert.equal(evaluateLateness("07:29:00", early).status, "present");
  assert.equal(evaluateLateness("07:31:00", early).lateMinutes, 1);
});

test("an overnight shift treats the early hours as the same shift, not a day late", () => {
  const night = { work_start_time: "22:00", work_end_time: "06:00", grace_period_minutes: 10 };
  // Before the start is simply early, never wrapped into a huge lateness.
  assert.equal(evaluateLateness("21:00:00", night).status, "present");
  assert.equal(evaluateLateness("22:05:00", night).status, "present");
  assert.equal(evaluateLateness("22:15:00", night).lateMinutes, 15);
  // The far side of midnight belongs to the shift that started the evening before.
  assert.equal(evaluateLateness("01:00:00", night).lateMinutes, 180);
});

test("toMinutes accepts both stored and configured time shapes", () => {
  assert.equal(toMinutes("09:00"), 540);
  assert.equal(toMinutes("09:07:45"), 547);
  assert.equal(toMinutes("00:00"), 0);
});

// ------------------------------------------------------------------ geofence

test("distance is a great-circle measure", () => {
  assert.equal(Math.round(distanceMeters(
    { latitude: 3.1390, longitude: 101.6869 },
    { latitude: 3.1390, longitude: 101.6869 },
  )), 0);
  // Roughly 111 km per degree of latitude.
  const oneDegree = distanceMeters(
    { latitude: 0, longitude: 0 }, { latitude: 1, longitude: 0 },
  );
  assert.ok(oneDegree > 110_000 && oneDegree < 112_000, String(oneDegree));
});

test("a fix inside the radius is accepted and its distance recorded", () => {
  const result = evaluateLocation(
    { latitude: 3.1390, longitude: 101.6869, accuracyMeters: 10 }, office,
  );
  assert.equal(result.ok, true);
  if (result.ok) assert.ok(result.distanceMeters < 1);
});

test("a fix outside the radius is refused and reports how far away it is", () => {
  // About 1.1 km north of the office.
  const result = evaluateLocation(
    { latitude: 3.1490, longitude: 101.6869, accuracyMeters: 10 }, office,
  );
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.reason, "outside");
    assert.ok((result.distanceMeters ?? 0) > 1000);
  }
});

test("accuracy widens the geofence only up to the capped allowance", () => {
  // ~120 m away: outside the 100 m radius, but inside radius + 50 m allowance.
  const near = { latitude: 3.14008, longitude: 101.6869 };
  assert.equal(evaluateLocation({ ...near, accuracyMeters: 5 }, office).ok, false);
  assert.equal(evaluateLocation({ ...near, accuracyMeters: 50 }, office).ok, true);

  // A client claiming enormous precision loss cannot stretch the fence to reach
  // the office from a kilometre away.
  const far = { latitude: 3.1490, longitude: 101.6869, accuracyMeters: MAX_ACCURACY_METERS };
  assert.equal(evaluateLocation(far, office).ok, false);
});

test("an unusably vague fix is refused rather than stretched", () => {
  const result = evaluateLocation(
    { latitude: 3.1390, longitude: 101.6869, accuracyMeters: MAX_ACCURACY_METERS + 1 }, office,
  );
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.reason, "accuracy");
});

test("an unconfigured office fails closed, never open", () => {
  for (const unset of [
    { office_latitude: null, office_longitude: null, attendance_radius_meters: 100 },
    { office_latitude: 3.139, office_longitude: null, attendance_radius_meters: 100 },
  ]) {
    const result = evaluateLocation(
      { latitude: 3.1390, longitude: 101.6869, accuracyMeters: 5 }, unset,
    );
    assert.equal(result.ok, false, JSON.stringify(unset));
    if (!result.ok) assert.equal(result.reason, "not_configured");
  }
});

// ------------------------------------------------------------------- payloads

test("only well-formed coordinates are accepted from a client", () => {
  const good = validateReportedPosition({ latitude: 3.139, longitude: 101.6869, accuracyMeters: 12 });
  assert.equal(good.valid, true);
  assert.deepEqual(good.position, { latitude: 3.139, longitude: 101.6869, accuracyMeters: 12 });

  for (const bad of [
    undefined, null, "here", [],
    { latitude: 91, longitude: 0, accuracyMeters: 1 },
    { latitude: 0, longitude: 181, accuracyMeters: 1 },
    { latitude: 0, longitude: 0, accuracyMeters: -1 },
    { latitude: "3.139", longitude: 101.6869, accuracyMeters: 1 },
    { latitude: Number.NaN, longitude: 0, accuracyMeters: 1 },
    { longitude: 101.6869, accuracyMeters: 1 },
  ]) {
    assert.equal(validateReportedPosition(bad).valid, false, JSON.stringify(bad));
  }
});

test("a scanned payload and a typed code normalise to the same token", () => {
  assert.equal(normalizeToken("HRNEXUS1:abc123"), "abc123");
  assert.equal(normalizeToken("  abc123  "), "abc123");
  // Whitespace groups the code for readability and is cosmetic.
  assert.equal(normalizeToken("abc 123"), "abc123");
  assert.equal(normalizeToken("HRNEXUS1:ab c1 23"), "abc123");
});

test("base64url punctuation is data, never stripped as formatting", () => {
  // "-" and "_" are real base64url characters. Treating them as separators
  // corrupted roughly half of all issued codes.
  assert.equal(normalizeToken("ab-c_123"), "ab-c_123");
  assert.equal(normalizeToken("HRNEXUS1:ab-c_123"), "ab-c_123");
  assert.equal(normalizeToken(" ab-c_123 "), "ab-c_123");
});

// -------------------------------------------------------------------- methods

test("the four approved methods are supported and only QR is self-verified", () => {
  assert.deepEqual([...verificationMethods],
    ["QR_LOCATION", "ADMIN_OVERRIDE", "REMOTE_APPROVED", "FIELD_WORK"]);
  assert.equal(statusForMethod("QR_LOCATION"), "verified");
  assert.equal(statusForMethod("ADMIN_OVERRIDE"), "manual");
  assert.equal(statusForMethod("REMOTE_APPROVED"), "exception");
  assert.equal(statusForMethod("FIELD_WORK"), "exception");
});
