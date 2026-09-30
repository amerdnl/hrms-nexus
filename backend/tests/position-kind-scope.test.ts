/**
 * Where a position is allowed to count as a person, and where it is not.
 *
 * An employees row can describe a seat nobody sits in, or an outside firm on
 * the organisation chart (employees.position_kind, migration 0018). That is a
 * deliberate compromise: the org chart needs those rows, and the org chart is
 * built from employees. The cost is that every query which used to mean "the
 * people here" now has to say so, and one that forgets turns twenty-one drawn
 * boxes into twenty-one colleagues who do not exist - a headcount nobody
 * employs, a payroll run for empty chairs.
 *
 * These are checked by reading the queries rather than by running them, because
 * the failure is a missing line in SQL and the database that would prove it
 * needs a Docker lab this suite cannot assume. A test that reads source is a
 * blunt instrument; it is here because the thing it guards is easy to undo by
 * accident and expensive to notice.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// The source is read rather than imported: auth/policy pulls in the database
// pool, which refuses to load without a connection string, and nothing here
// needs a database.

const read = (path: string) => readFileSync(new URL(`../src/${path}`, import.meta.url), "utf8");

/** Queries that measure or operate on the workforce. Each must exclude non-staff. */
const OPERATIONAL: Array<[string, string]> = [
  ["services/analyticsService.ts", "workforce analytics"],
  ["services/reportService.ts", "the workforce report"],
  ["services/exportService.ts", "department headcount in the export"],
  ["services/payrollService.ts", "payroll candidates"],
  ["services/reviewService.ts", "review cycle participants"],
  ["controllers/dashboardController.ts", "the admin dashboard counts"],
];

/** Queries that draw the organisation. These must NOT exclude anything. */
const STRUCTURAL: Array<[string, string]> = [
  ["services/peopleService.ts", "the org chart and the directory"],
];

test("the staff-only predicate names the column and the value", () => {
  const policy = read("auth/policy.ts");
  assert.match(
    policy,
    /export const staffOnly = \(alias = "e"\) => `\$\{alias\}\.position_kind = 'staff'`;/,
    "auth/policy should define the one predicate that says 'this row is a person employed here'",
  );
});

test("everything that counts or pays people excludes positions and external parties", () => {
  for (const [path, what] of OPERATIONAL) {
    assert.match(
      read(path),
      /position_kind = 'staff'/,
      `${what} (${path}) no longer filters on position_kind, so unfilled positions and external ` +
        `parties would be counted as employed people`,
    );
  }
});

test("the admin dashboard filters both of its headcounts", () => {
  const source = read("controllers/dashboardController.ts");
  // One counts everyone on the books, the other only the active. Filtering just
  // one produces a total that is larger than its own breakdown.
  const occurrences = source.match(/position_kind = 'staff'/g) ?? [];
  assert.ok(occurrences.length >= 2, `expected both headcount queries to filter, found ${occurrences.length}`);
});

test("payroll cannot pay a position nobody holds", () => {
  const source = read("services/payrollService.ts");
  const candidates = source.slice(source.indexOf("loadCandidates"));
  assert.match(
    candidates.slice(0, 1600),
    /WHERE e\.position_kind = 'staff'/,
    "loadCandidates decides who appears in a payroll run; without this filter a vacancy gets a payslip",
  );
});

test("onboarding and offboarding refuse anyone who is not a person", () => {
  const source = read("services/lifecycleService.ts");
  assert.match(
    source,
    /position_kind !== "staff"/,
    "startPlan must refuse a vacant position or an external party: there is nobody to onboard",
  );
});

test("the org chart still draws positions and external parties", () => {
  for (const [path, what] of STRUCTURAL) {
    const source = read(path);
    // It selects the column, because the interface labels each card with it...
    assert.match(source, /e\.position_kind/, `${what} (${path}) should read position_kind`);
    // ...but it must never filter by it. Hiding the positions would empty the
    // very chart they exist for.
    assert.doesNotMatch(
      source,
      /position_kind = 'staff'/,
      `${what} (${path}) filters out non-staff; the org chart and directory must show them`,
    );
  }
});
