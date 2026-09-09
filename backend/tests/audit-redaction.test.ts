import assert from "node:assert/strict";
import { test } from "node:test";
import {
  diffChanges,
  fitChanges,
  isForbiddenKey,
  MAX_CHANGES_BYTES,
  REDACTED,
  sanitize,
} from "../src/utils/auditRedaction.js";

test("credential-shaped keys are refused by name", () => {
  for (const key of [
    "password", "Password", "newPassword", "password_hash", "passwordHash",
    "passwd", "token", "access_token", "refreshToken", "jwt", "secret",
    "clientSecret", "authorization", "apiKey", "api_key", "credential",
    "signature", "salt", "otp", "pin",
  ]) {
    assert.equal(isForbiddenKey(key), true, `${key} must be forbidden`);
  }
});

test("attendance verification payloads are refused by name", () => {
  for (const key of [
    "latitude", "check_in_latitude", "longitude", "check_out_longitude",
    "accuracy", "check_in_accuracy_meters", "coordinates", "geolocation",
    "qr_token", "qrCode", "challenge_id", "nonce",
  ]) {
    assert.equal(isForbiddenKey(key), true, `${key} must be forbidden`);
  }
});

test("ordinary business fields are kept", () => {
  for (const key of [
    "full_name", "employee_number", "status", "basic_salary_sen",
    "department_id", "working_days", "effective_from", "leave_type",
  ]) {
    assert.equal(isForbiddenKey(key), false, `${key} must be allowed`);
  }
});

test("a secret nested inside an object is still removed", () => {
  const sanitized = sanitize({
    employee: { name: "Aisyah", account: { email: "a@example.invalid", password: "hunter2" } },
  });

  const account = (sanitized as { employee: { account: Record<string, unknown> } })
    .employee.account;
  assert.equal(account.password, REDACTED);
  assert.equal(account.email, "a@example.invalid");
  assert.equal(JSON.stringify(sanitized).includes("hunter2"), false);
});

test("a long string is truncated rather than stored whole", () => {
  const sanitized = sanitize({ note: "x".repeat(5000) }) as { note: string };
  assert.ok(sanitized.note.length < 400, String(sanitized.note.length));
  assert.match(sanitized.note, /\[truncated\]$/);
});

test("deep nesting stops rather than recursing forever", () => {
  let deep: Record<string, unknown> = { value: "bottom" };
  for (let index = 0; index < 30; index += 1) deep = { nested: deep };
  const encoded = JSON.stringify(sanitize(deep));
  assert.ok(encoded.includes("[depth limit]"), encoded.slice(0, 120));
});

test("a diff reports only the fields that actually changed", () => {
  const changes = diffChanges(
    { full_name: "Aisyah", job_title: "Engineer", department_id: 1 },
    { full_name: "Aisyah Rahman", job_title: "Engineer", department_id: 1 },
  );
  assert.deepEqual(changes, {
    full_name: { before: "Aisyah", after: "Aisyah Rahman" },
  });
});

test("a diff never reads a forbidden field, even when it changed", () => {
  const changes = diffChanges(
    { password_hash: "$2b$12$old", full_name: "Aisyah" },
    { password_hash: "$2b$12$new", full_name: "Siti" },
  );
  assert.deepEqual(Object.keys(changes ?? {}), ["full_name"]);
  assert.equal(JSON.stringify(changes).includes("$2b$12$"), false);
});

test("an unchanged record produces no change set at all", () => {
  assert.equal(diffChanges({ a: 1 }, { a: 1 }), null);
});

test("an oversized change set degrades to a marker instead of failing", () => {
  const huge = Object.fromEntries(
    Array.from({ length: 200 }, (_, index) => [`field_${index}`, "y".repeat(280)]),
  );
  const fitted = fitChanges(huge) as { omitted?: string };
  assert.equal(typeof fitted.omitted, "string");

  const encoded = JSON.stringify(fitted);
  assert.ok(
    Buffer.byteLength(encoded, "utf8") <= MAX_CHANGES_BYTES,
    `still ${Buffer.byteLength(encoded, "utf8")} bytes`,
  );
});

test("fitChanges always satisfies the database ceiling", () => {
  for (const input of [
    null, undefined, "a string", 42, { nested: { deep: { value: "x".repeat(9000) } } },
    Array.from({ length: 500 }, (_, index) => index),
  ]) {
    const encoded = JSON.stringify(fitChanges(input)) ?? "null";
    assert.ok(
      Buffer.byteLength(encoded, "utf8") <= MAX_CHANGES_BYTES,
      `${Buffer.byteLength(encoded, "utf8")} bytes for ${typeof input}`,
    );
  }
});

test("a function or symbol cannot be smuggled into the log", () => {
  const sanitized = sanitize({ fn: () => "x", sym: Symbol("s"), ok: 1 }) as Record<string, unknown>;
  assert.equal(sanitized.fn, null);
  assert.equal(sanitized.sym, null);
  assert.equal(sanitized.ok, 1);
});
