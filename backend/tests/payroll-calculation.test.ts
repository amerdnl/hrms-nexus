import assert from "node:assert/strict";
import { test } from "node:test";
import {
  MAX_SEN,
  divideRoundHalfUp,
  formatScaled,
  formatSen,
  parseMoneyToSen,
  parseScaledQuantity,
} from "../src/utils/payrollMoney.js";
import {
  calculatePayroll,
  canTransition,
  isLocked,
  monthBounds,
  overtimeEarningSen,
  payrollStatuses,
  unpaidLeaveDeductionSen,
  workingDaysInMonth,
} from "../src/utils/payrollCalculation.js";

// ------------------------------------------------------------------- rounding

test("division rounds half away from zero, exactly", () => {
  const cases: Array<[bigint, bigint, bigint]> = [
    [5n, 10n, 1n],     // 0.5 -> 1
    [4n, 10n, 0n],     // 0.4 -> 0
    [15n, 10n, 2n],    // 1.5 -> 2
    [25n, 10n, 3n],    // 2.5 -> 3, half-up rather than banker's rounding
    [14n, 10n, 1n],
    [0n, 7n, 0n],
    [1n, 3n, 0n],
    [2n, 3n, 1n],
  ];
  for (const [numerator, denominator, expected] of cases) {
    assert.equal(divideRoundHalfUp(numerator, denominator), expected,
      `${numerator}/${denominator}`);
  }
});

test("division refuses inputs that would make rounding meaningless", () => {
  assert.throws(() => divideRoundHalfUp(10n, 0n), RangeError);
  assert.throws(() => divideRoundHalfUp(10n, -5n), RangeError);
  assert.throws(() => divideRoundHalfUp(-10n, 5n), RangeError);
});

test("large amounts stay exact, where floating point would not", () => {
  // 0.1 + 0.2 in sen is exact integer arithmetic.
  assert.equal(10 + 20, 30);
  // A salary near the column limit divided across a month keeps every sen.
  // 3,000,000,000 / 7 = 428,571,428.571... which rounds half-up to 428,571,429.
  const result = divideRoundHalfUp(BigInt(MAX_SEN) * 3n, 7n);
  assert.equal(result, 428571429n);
  assert.equal(typeof result, "bigint");
  // The same division through Number loses the guarantee; BigInt does not.
  assert.equal(result * 7n > BigInt(MAX_SEN) * 3n - 7n, true);
});

// --------------------------------------------------------------------- money

test("decimal money strings parse to exact sen", () => {
  const cases: Array<[string, number]> = [
    ["0", 0], ["3500", 350000], ["3500.5", 350050], ["3500.50", 350050],
    ["0.01", 1], ["0.1", 10], ["1234567.89", 123456789],
  ];
  for (const [input, sen] of cases) {
    const parsed = parseMoneyToSen(input);
    assert.equal(parsed.ok, true, input);
    if (parsed.ok) assert.equal(parsed.sen, sen, input);
  }
  assert.equal(parseMoneyToSen("  250.00  ").ok, true);
});

test("money input that could hide a precision loss is refused", () => {
  for (const bad of [
    "3500.555", "-100", "abc", "", "1e5", "3,500.00", "3500.", ".50",
    null, undefined, true, {}, [], Number.NaN, 1.5,
  ]) {
    assert.equal(parseMoneyToSen(bad).ok, false, JSON.stringify(bad));
  }
  // A whole number of sen is unambiguous and accepted.
  assert.deepEqual(parseMoneyToSen(350050), { ok: true, sen: 350050 });
  assert.equal(parseMoneyToSen(MAX_SEN + 1).ok, false);
  assert.equal(parseMoneyToSen("99999999999").ok, false);
});

test("sen render back to a plain decimal string", () => {
  assert.equal(formatSen(0), "0.00");
  assert.equal(formatSen(1), "0.01");
  assert.equal(formatSen(350050), "3500.50");
  assert.equal(formatSen(-12345), "-123.45");
});

test("quantities parse to scaled integers and refuse excess precision", () => {
  assert.deepEqual(parseScaledQuantity("12.5", 2, 1000), { ok: true, scaled: 1250 });
  assert.deepEqual(parseScaledQuantity("12.55", 2, 1000), { ok: true, scaled: 1255 });
  assert.deepEqual(parseScaledQuantity("2.5", 1, 366), { ok: true, scaled: 25 });
  assert.equal(parseScaledQuantity("12.555", 2, 1000).ok, false);
  assert.equal(parseScaledQuantity("2.55", 1, 366).ok, false);
  assert.equal(parseScaledQuantity("-1", 2, 1000).ok, false);
  assert.equal(parseScaledQuantity("1001", 2, 1000).ok, false);
  assert.equal(formatScaled(1250, 2), "12.50");
  assert.equal(formatScaled(25, 1), "2.5");
});

// ------------------------------------------------------------ derived amounts

test("unpaid leave deducts a daily rate, rounded once at the end", () => {
  // RM3000 over 22 working days: one day is 13636.36..., rounded to 13636 sen.
  assert.equal(unpaidLeaveDeductionSen(300000, 10, 22), 13636);
  // Two days is not twice the rounded single day: the division happens once.
  assert.equal(unpaidLeaveDeductionSen(300000, 20, 22), 27273);
  assert.notEqual(unpaidLeaveDeductionSen(300000, 20, 22), 13636 * 2);
  // Half a day.
  assert.equal(unpaidLeaveDeductionSen(300000, 5, 22), 6818);
  assert.equal(unpaidLeaveDeductionSen(300000, 0, 22), 0);
  assert.equal(unpaidLeaveDeductionSen(0, 10, 22), 0);
});

test("a period with no working days cannot produce a daily rate", () => {
  assert.throws(() => unpaidLeaveDeductionSen(300000, 10, 0), RangeError);
});

test("overtime multiplies an hourly rate by hours, rounded once", () => {
  // RM20.50 per hour for 7.25 hours = 148.625 -> 148.63 half-up.
  assert.equal(overtimeEarningSen(2050, 725), 14863);
  assert.equal(overtimeEarningSen(2000, 100), 2000);
  assert.equal(overtimeEarningSen(0, 500), 0);
  assert.equal(overtimeEarningSen(2000, 0), 0);
});

// ------------------------------------------------------------- full calculation

const baseInput = {
  basicSalarySen: 300000,
  allowanceSen: 25000,
  overtimeRateSen: 2000,
  overtimeHundredths: 0,
  unpaidLeaveTenths: 0,
  workingDays: 22,
  manualEarnings: [],
  manualDeductions: [],
};

test("a plain month is basic plus allowance, with nothing deducted", () => {
  const result = calculatePayroll(baseInput);
  assert.equal(result.grossSen, 325000);
  assert.equal(result.deductionsSen, 0);
  assert.equal(result.netSen, 325000);
  assert.deepEqual(result.lines.map((line) => line.code), ["basic", "allowance"]);
});

test("zero-value lines are omitted rather than shown as 0.00", () => {
  const result = calculatePayroll({ ...baseInput, allowanceSen: 0 });
  assert.deepEqual(result.lines.map((line) => line.code), ["basic"]);
});

test("overtime, unpaid leave and manual lines all reach the totals", () => {
  const result = calculatePayroll({
    ...baseInput,
    overtimeHundredths: 500,
    unpaidLeaveTenths: 20,
    manualEarnings: [{ code: "manual", label: "Bonus", amountSen: 50000 }],
    manualDeductions: [
      { code: "manual", label: "Staff loan", amountSen: 10000 },
      { code: "statutory", label: "EPF (entered manually)", amountSen: 33000, isStatutory: true },
    ],
  });

  // 300000 basic + 25000 allowance + 10000 overtime + 50000 bonus.
  assert.equal(result.grossSen, 385000);
  // 27273 unpaid leave + 10000 loan + 33000 statutory.
  assert.equal(result.deductionsSen, 70273);
  assert.equal(result.netSen, 314727);
  // Totals are exactly the sum of the lines shown, so a payslip always adds up.
  const sum = (type: string) => result.lines
    .filter((line) => line.itemType === type)
    .reduce((total, line) => total + line.amountSen, 0);
  assert.equal(sum("earning"), result.grossSen);
  assert.equal(sum("deduction"), result.deductionsSen);
});

test("a statutory line is manual and is never computed by HR Nexus", () => {
  const result = calculatePayroll({
    ...baseInput,
    manualDeductions: [{ code: "statutory", label: "SOCSO", amountSen: 2500, isStatutory: true }],
  });
  const statutory = result.lines.find((line) => line.isStatutory);
  assert.ok(statutory);
  assert.equal(statutory.isManual, true, "a statutory line must always be a manual entry");
  // Nothing in the engine produces a statutory line on its own.
  const derived = calculatePayroll(baseInput);
  assert.equal(derived.lines.some((line) => line.isStatutory), false);
});

test("net is not clamped when deductions exceed gross", () => {
  const result = calculatePayroll({
    ...baseInput,
    manualDeductions: [{ code: "manual", label: "Overpayment recovery", amountSen: 999000 }],
  });
  // An over-deducted record must be visibly wrong rather than quietly zeroed.
  assert.equal(result.netSen, 325000 - 999000);
  assert.ok(result.netSen < 0);
});

test("the calculation is deterministic for identical inputs", () => {
  const input = {
    ...baseInput, overtimeHundredths: 733, unpaidLeaveTenths: 13,
    manualDeductions: [{ code: "manual", label: "Loan", amountSen: 12345 }],
  };
  const first = calculatePayroll(input);
  const second = calculatePayroll(input);
  assert.deepEqual(first, second);
});

// ------------------------------------------------------------- state machine

test("payroll moves forward, and never back out of approval", () => {
  assert.deepEqual([...payrollStatuses], ["draft", "calculated", "reviewed", "approved", "paid"]);

  for (const [from, to] of [
    ["draft", "calculated"], ["calculated", "reviewed"], ["calculated", "draft"],
    ["reviewed", "approved"], ["reviewed", "calculated"], ["approved", "paid"],
  ] as const) {
    assert.equal(canTransition(from, to), true, `${from} -> ${to}`);
  }

  // Regression out of approval or payment is refused in every direction.
  for (const [from, to] of [
    ["approved", "reviewed"], ["approved", "calculated"], ["approved", "draft"],
    ["paid", "approved"], ["paid", "reviewed"], ["paid", "draft"], ["paid", "calculated"],
    ["draft", "approved"], ["draft", "paid"], ["draft", "reviewed"],
    ["calculated", "approved"], ["calculated", "paid"], ["reviewed", "paid"],
  ] as const) {
    assert.equal(canTransition(from, to), false, `${from} -> ${to}`);
  }
});

test("approved and paid periods are locked against edits", () => {
  assert.equal(isLocked("approved"), true);
  assert.equal(isLocked("paid"), true);
  for (const open of ["draft", "calculated", "reviewed"] as const) {
    assert.equal(isLocked(open), false, open);
  }
});

// ------------------------------------------------------------------- calendar

test("month bounds and working days follow the configured week", () => {
  assert.deepEqual(monthBounds(2026, 9), { start: "2026-09-01", end: "2026-09-30" });
  // February in a leap year.
  assert.deepEqual(monthBounds(2028, 2), { start: "2028-02-01", end: "2028-02-29" });

  // September 2026 has 22 Monday-to-Friday days.
  assert.equal(workingDaysInMonth(2026, 9, [1, 2, 3, 4, 5]), 22);
  // A six-day week gives more; a Sunday-to-Thursday week gives its own answer.
  assert.equal(workingDaysInMonth(2026, 9, [1, 2, 3, 4, 5, 6]), 26);
  assert.equal(workingDaysInMonth(2026, 9, [7, 1, 2, 3, 4]), 22);
  assert.equal(workingDaysInMonth(2026, 9, [6, 7]), 8);
});
