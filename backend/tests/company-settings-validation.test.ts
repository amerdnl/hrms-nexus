import assert from "node:assert/strict";
import { test } from "node:test";
import { validateCompanySettings } from "../src/utils/companySettingsValidation.js";

const valid = {
  company_name: "Example Company", registration_number: null, address: null, email: null, phone: null,
  timezone: "UTC", working_days: [1,2,3,4,5], work_start_time: "09:00", work_end_time: "17:00",
  grace_period_minutes: 0, office_latitude: null, office_longitude: null, attendance_radius_meters: 100, revision: 0,
};
test("settings normalizes optional text, day order and timezone while preserving valid zero coordinates", () => {
  const result = validateCompanySettings({ ...valid, company_name: "  Example Company  ", address: "  ",
    timezone: "Asia/Kuala_Lumpur", working_days: [7,1], office_latitude: 0, office_longitude: 0 });
  assert.ok(result.valid);
  assert.equal(result.data.company_name, "Example Company");
  assert.equal(result.data.address, null);
  assert.deepEqual(result.data.working_days, [1,7]);
  assert.equal(result.data.office_latitude, 0);
  assert.equal(result.data.timezone, "Asia/Kuala_Lumpur");
});
test("settings supports overnight hours and grace strictly shorter than the shift", () => {
  assert.ok(validateCompanySettings({ ...valid, work_start_time: "22:00", work_end_time: "06:00", grace_period_minutes: 479 }).valid);
  assert.equal(validateCompanySettings({ ...valid, work_start_time: "22:00", work_end_time: "06:00", grace_period_minutes: 480 }).valid, false);
  assert.ok(validateCompanySettings({ ...valid, work_start_time: "23:59", work_end_time: "00:00" }).valid);
});
for (const [field, values] of Object.entries({
  company_name: ["", " ", null, 12, "x".repeat(201), "bad\u0000name"],
  registration_number: [123, "x".repeat(101)], address: ["x".repeat(2001)],
  email: ["no-email", "a@b", "a b@c.invalid"], phone: ["---", "words", "x".repeat(51)],
  timezone: ["Mars/Olympus", "+08:00", "PST", ""],
  working_days: [[], [0], [8], [1,1], [1,null], [1.1], ["1"], [[1]], null],
  work_start_time: ["24:00", "9:00", "09:00:01", 900], work_end_time: ["09:00", "17:60", ""],
  grace_period_minutes: [-1, 0.5, 480, null, "0", Infinity],
  office_latitude: [-91, 91, NaN, Infinity, "0", 0], office_longitude: [-181, 181, "0", 0],
  attendance_radius_meters: [0, 10001, 1.5, "100", null], revision: [-1, 0.5, "0", 2147483647],
})) {
  test(`settings rejects invalid ${field}`, () => {
    for (const value of values) {
      const result = validateCompanySettings({ ...valid, [field]: value });
      assert.equal(result.valid, false, `${field}: ${JSON.stringify(value)}`);
      if (!result.valid) assert.ok(result.errors[field]);
    }
  });
}
test("settings rejects malformed bodies, missing fields and mass assignment", () => {
  for (const input of [null, [], "settings", {}, { ...valid, id: 2 }, { ...valid, updated_at: "tomorrow" }, { ...valid, role: "admin" }]) {
    assert.equal(validateCompanySettings(input).valid, false);
  }
  for (const field of Object.keys(valid)) {
    const input: Record<string, unknown> = { ...valid }; delete input[field];
    assert.equal(validateCompanySettings(input).valid, false, field);
  }
});
