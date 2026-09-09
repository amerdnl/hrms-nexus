import assert from "node:assert/strict";
import { test } from "node:test";
import {
  MAX_LEAVE_SPAN_DAYS,
  buildBalance,
  countCalendarDays,
  countWorkingDays,
  isoWeekday,
  leaveStatuses,
  leaveTypes,
  parseDate,
  round1,
  validateLeaveDates,
  validateLeaveRequest,
} from "../src/utils/leaveCalculation.js";

const MON_TO_FRI = [1, 2, 3, 4, 5];

test("dates are parsed strictly, rejecting impossible days", () => {
  assert.ok(parseDate("2026-09-09"));
  for (const bad of ["2026-02-31", "2026-13-01", "09-09-2026", "2026-9-9", "", "today"]) {
    assert.equal(parseDate(bad), null, bad);
  }
});

test("ISO weekday puts Monday first and Sunday last", () => {
  // 2026-09-07 is a Monday.
  assert.equal(isoWeekday(parseDate("2026-09-07")!), 1);
  assert.equal(isoWeekday(parseDate("2026-09-12")!), 6);
  assert.equal(isoWeekday(parseDate("2026-09-13")!), 7);
});

test("working days follow the configured week, not a hard-coded weekend", () => {
  // Mon 7 Sep to Fri 11 Sep 2026: five working days either way.
  assert.equal(countWorkingDays("2026-09-07", "2026-09-11", MON_TO_FRI), 5);
  // The same range across a full week excludes Saturday and Sunday.
  assert.equal(countWorkingDays("2026-09-07", "2026-09-13", MON_TO_FRI), 5);
  // A company working Sunday to Thursday gets a different answer for one range.
  assert.equal(countWorkingDays("2026-09-07", "2026-09-13", [7, 1, 2, 3, 4]), 5);
  assert.equal(countWorkingDays("2026-09-12", "2026-09-13", MON_TO_FRI), 0);
  assert.equal(countWorkingDays("2026-09-12", "2026-09-13", [6, 7]), 2);
});

test("a single working day counts as one, and a single rest day as none", () => {
  assert.equal(countWorkingDays("2026-09-09", "2026-09-09", MON_TO_FRI), 1);
  assert.equal(countWorkingDays("2026-09-13", "2026-09-13", MON_TO_FRI), 0);
});

test("reversed or malformed ranges produce no count", () => {
  assert.equal(countWorkingDays("2026-09-11", "2026-09-07", MON_TO_FRI), null);
  assert.equal(countWorkingDays("nope", "2026-09-07", MON_TO_FRI), null);
  assert.equal(countCalendarDays("2026-09-07", "2026-09-11"), 5);
  assert.equal(countCalendarDays("2026-09-11", "2026-09-07"), null);
});

test("a request may not span two leave years", () => {
  const crossing = validateLeaveDates("2026-12-28", "2027-01-03");
  assert.equal(crossing.valid, false);
  assert.match(crossing.errors.endDate!, /cannot span two leave years/i);

  // Right up to the boundary is fine on either side.
  assert.equal(validateLeaveDates("2026-12-28", "2026-12-31").valid, true);
  assert.equal(validateLeaveDates("2027-01-01", "2027-01-05").valid, true);
});

test("date validation reports the leave year and refuses absurd spans", () => {
  const ok = validateLeaveDates("2026-03-02", "2026-03-06");
  assert.equal(ok.valid, true);
  assert.equal(ok.leaveYear, 2026);
  assert.equal(ok.calendarDays, 5);

  assert.equal(validateLeaveDates("2026-01-02", "2026-01-01").valid, false);
  // A leap year is 366 days, so a whole-year request is exactly at the limit.
  assert.equal(MAX_LEAVE_SPAN_DAYS, 366);
});

test("a valid submission is accepted and trimmed", () => {
  const result = validateLeaveRequest({
    leaveType: "annual",
    startDate: " 2026-03-02 ",
    endDate: "2026-03-06",
    reason: "  Family trip  ",
  });
  assert.equal(result.valid, true);
  if (!result.valid) return;
  assert.equal(result.data.reason, "Family trip");
  assert.equal(result.data.startDate, "2026-03-02");
  assert.equal(result.leaveYear, 2026);
});

test("submissions are refused for bad type, missing reason and unknown fields", () => {
  const cases: Array<[Record<string, unknown>, string]> = [
    [{ leaveType: "sabbatical", startDate: "2026-03-02", endDate: "2026-03-02", reason: "x" }, "leaveType"],
    [{ leaveType: "annual", startDate: "2026-03-02", endDate: "2026-03-02", reason: "  " }, "reason"],
    [{ leaveType: "annual", startDate: "2026-03-02", endDate: "2026-03-02", reason: "x".repeat(1001) }, "reason"],
    [{ leaveType: "annual", startDate: "bad", endDate: "2026-03-02", reason: "x" }, "startDate"],
    [{ leaveType: "annual", startDate: "2026-03-02", endDate: "2026-03-02", reason: "x", status: "approved" }, "_form"],
    [{ leaveType: "annual", startDate: "2026-03-02", endDate: "2026-03-02", reason: "x", employeeId: 4 }, "_form"],
  ];
  for (const [payload, field] of cases) {
    const result = validateLeaveRequest(payload);
    assert.equal(result.valid, false, JSON.stringify(payload));
    if (!result.valid) assert.ok(result.errors[field], `${field} missing from ${JSON.stringify(result.errors)}`);
  }

  for (const payload of [null, undefined, "leave", [], 7]) {
    assert.equal(validateLeaveRequest(payload).valid, false, String(payload));
  }
});

test("an employee cannot smuggle a status or an employee id through submission", () => {
  // Both are server-owned; accepting them would let anyone self-approve.
  for (const field of ["status", "employeeId", "workingDays", "reviewedBy"]) {
    const result = validateLeaveRequest({
      leaveType: "annual", startDate: "2026-03-02", endDate: "2026-03-02",
      reason: "x", [field]: "anything",
    });
    assert.equal(result.valid, false, field);
  }
});

test("balances separate pending from remaining and never double-count", () => {
  const balance = buildBalance("annual", 12, 3, 2, { deductsBalance: true, isPaid: true });
  assert.equal(balance.entitledDays, 12);
  assert.equal(balance.usedDays, 3);
  assert.equal(balance.pendingDays, 2);
  // Remaining reflects approved usage only, as the brief requires.
  assert.equal(balance.remainingDays, 9);
  // Availability for a new request also withholds what is already pending, so an
  // employee cannot queue several requests that each look affordable alone.
  assert.equal(balance.availableDays, 7);
});

test("balance arithmetic does not drift over fractional days", () => {
  const balance = buildBalance("annual", 12.5, 0.5, 1.5, { deductsBalance: true, isPaid: true });
  assert.equal(balance.remainingDays, 12);
  assert.equal(balance.availableDays, 10.5);
  assert.equal(round1(0.1 + 0.2), 0.3);
});

test("unpaid leave is modelled as not deducting and not paid", () => {
  const balance = buildBalance("unpaid", 0, 4, 0, { deductsBalance: false, isPaid: false });
  assert.equal(balance.deductsBalance, false);
  assert.equal(balance.isPaid, false);
  // Usage is still visible even though nothing is deducted, so payroll can see it.
  assert.equal(balance.usedDays, 4);
});

test("the supported type and status sets are what the database allows", () => {
  assert.deepEqual([...leaveTypes], ["annual", "medical", "emergency", "unpaid"]);
  assert.deepEqual([...leaveStatuses], ["pending", "approved", "rejected", "cancelled"]);
});
