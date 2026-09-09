# Payroll and Payslips (V1) — P0

Status: **implemented and verified** on 9 September 2026. Migration 0007 is applied to
source `hr_nexus` with explicit user approval. 283 tests and a 21-check authenticated
browser smoke pass.

Migrations 0001–0006, their ledger rows and checksums, existing business data and the
five protected orphan attendance rows are unchanged. The source gained four tables,
three triggers and one ledger row; no existing row was read back differently.

## No statutory compliance is claimed

**HR Nexus does not calculate EPF, SOCSO, EIS or PCB, and no Malaysian rate is encoded
anywhere in this milestone.** No official rate table was verified, so none was written.

Statutory amounts are supported only as **manual lines**: an administrator enters a
figure they calculated themselves, ticks a box acknowledging that, and the line is
stored with `is_statutory = TRUE`. The database enforces that this can never be a
computed line:

```sql
CONSTRAINT payroll_item_statutory_is_manual CHECK (NOT is_statutory OR is_manual)
```

The limitation is repeated in the table comment, the API, the payroll page and the
payslip itself, so it cannot be discovered only by reading the schema.

## Money is integer sen, and never a float

Every amount in payroll is a whole number of **sen** (1/100 MYR), stored as `BIGINT`.
All 10 `*_sen` columns are `bigint`, and no column in any of the four payroll tables is
`REAL` or `DOUBLE PRECISION`. The only `NUMERIC` columns are the two scaled *quantities*
(`overtime_hours`, `unpaid_leave_days`), never a money amount.

Intermediate arithmetic uses **BigInt**, so no payroll figure passes through IEEE-754
floating point at any point. Decimal input arrives as a *string* and is parsed digit by
digit — accepting a JavaScript number would mean trusting a value that may already have
lost precision before it arrived. A number is accepted only when it is already a safe
whole number of sen.

### Rounding is defined, single and documented

There is exactly one rounding primitive, and it rounds **half away from zero**:

```ts
export function divideRoundHalfUp(numerator: bigint, denominator: bigint): bigint {
  return (numerator * 2n + denominator) / (denominator * 2n);
}
```

`(2n + d) / 2d` is exact in BigInt — no fractional intermediate ever exists.

It is applied **at most once per derived line**, never to a running total:

| Derived line | Formula | Rounded |
| --- | --- | --- |
| Unpaid leave | `basic × unpaid_tenths ÷ (working_days × 10)` | once |
| Overtime | `rate × hours_hundredths ÷ 100` | once |
| Basic, allowances | copied from the compensation snapshot | never |
| Manual lines | entered as an exact sen figure | never |

Totals are then **exact integer sums over the stored lines**, so a payslip always adds
up: gross is the sum of its earning lines, deductions the sum of its deduction lines,
and the database enforces the relationship between them:

```sql
CONSTRAINT payroll_record_net CHECK (net_sen = gross_sen - deductions_sen)
```

Net pay is **deliberately not clamped at zero**. If deductions exceed gross, the figure
must be visibly wrong rather than silently rounded up to nothing.

**Quantities** are scaled integers too: overtime hours in hundredths, unpaid leave days
in tenths. Input carrying more precision than that is refused rather than truncated.

## Salary history is append-only

`employee_compensation` holds a row per salary arrangement with `effective_from` and a
nullable `effective_to`. Setting a new salary does not update the old row — it closes
it (`effective_to = effective_from - 1 day`) and appends a new one, under an advisory
lock per employee.

Calculation selects the row **in force at the period's end date** via a LATERAL join.
Changing someone's salary tomorrow therefore cannot alter what they were paid last
month.

## Historical payslips cannot change

A `payroll_records` row **snapshots** everything a payslip needs:

- identity: employee number, full name, department name, job title
- compensation: basic, allowance and overtime rate, plus `compensation_id` recording
  which row was used
- context: `working_days` for the period, unpaid leave days, overtime hours

A rename, a department move, a salary revision, a working-week change in Company
Settings or a later leave correction therefore cannot rewrite an existing payslip. This
is the same principle already used for attendance `late_minutes` and leave
`working_days`.

`payroll_periods` additionally snapshots `working_days` and the
`working_days_pattern` it was opened with.

## The state machine is enforced by the database

```
draft → calculated → reviewed → approved → paid
          ↑    ↓         ↓
          └────┴─────────┘   (reviewed → calculated, calculated → draft)
```

Permitted transitions, and only these, are enforced by a `BEFORE UPDATE` trigger:

| From | To |
| --- | --- |
| draft | calculated |
| calculated | draft, reviewed |
| reviewed | calculated, approved |
| approved | paid |
| paid | — (terminal) |

**There is no path backwards out of `approved`.** Approval and payment are one-way.

Once a period is `approved` or `paid`, a second trigger refuses every INSERT, UPDATE or
DELETE against its records and items:

```
Approved payroll is immutable and cannot be changed or removed
```

Both triggers raise `23514`, so the guarantee holds against direct SQL, not only
against the API.

## Duplicate calculation is structurally impossible

```sql
CONSTRAINT payroll_record_unique_employee UNIQUE (period_id, employee_id)
CONSTRAINT payroll_period_unique_month     UNIQUE (period_year, period_month)
```

One record per employee per period, one period per calendar month. Recalculation takes
a `FOR UPDATE` lock on the period, deletes only the lines it generated
(`is_manual = FALSE`) and regenerates them, so manual lines survive untouched and are
fed back into the totals. Calculation runs in a single transaction: a failure leaves no
partial payroll behind.

## Unpaid leave comes from approved leave only

Unpaid days are counted from **approved** unpaid leave requests, restricted to working
days that fall *inside* the period. The count intersects the request with the period
window rather than taking the request's total, so a leave range spanning a month
boundary is not deducted twice.

Overtime and manual lines are administrator input; nothing else is inferred.

## API

Admin (all `authorizeRoles("admin")`):

| Method | Path |
| --- | --- |
| GET/POST | `/api/payroll/periods` |
| GET | `/api/payroll/periods/:id`, `/periods/:id/summary` |
| POST | `/api/payroll/periods/:id/calculate` |
| PUT | `/api/payroll/periods/:id/status` |
| GET | `/api/payroll/records/:recordId` |
| PUT | `/api/payroll/records/:recordId/overtime` |
| POST/DELETE | `/api/payroll/records/:recordId/items[/:itemId]` |
| GET/POST | `/api/payroll/compensation/:employeeId` |

Employee (`authorizeRoles("employee")`):

| Method | Path |
| --- | --- |
| GET | `/api/payroll/me/payslips`, `/me/payslips/:recordId` |

Employees see **only their own** payslips, resolved from the authenticated session's
employee ID and never from a request parameter, and **only for approved or paid
periods** — draft figures are not disclosed.

## Company Import adapter

Import gained `basic_salary`, `allowance` and `overtime_rate`, with the usual header
aliases, parsed through the same string-to-sen path.

**Compensation history is never silently overwritten.** A new compensation row is
opened only when the imported amounts differ from what is currently in force;
`effective_from` is the employment date for a new hire and today for an existing one.
Identical figures produce no row. The existing NEW/UPDATE/UNCHANGED/CONFLICT/INVALID
classification is unchanged.

## Migration 0007

Checksum `a37b09cd79989e3f4b545c33f99372074a1eb5e3f024690b8d36f4a89f4aede3`, applied to
source on 9 September 2026 after explicit approval.

Adds four tables — `employee_compensation`, `payroll_periods`, `payroll_records`,
`payroll_items` — three triggers and two trigger functions. It is **purely additive**:
no existing table, column, constraint or row is modified.

Verified after applying to source:

```
ledger=0001,0002,0003,0004,0005,0006,0007
base_tables=17          (was 13)
payroll_rows=0/0/0/0    (all four new tables empty)
triggers=enforce_payroll_period_transition,
         prevent_locked_payroll_item_change,
         prevent_locked_payroll_record_change
money_types=bigint      (every *_sen column)
users=2  employees=1  attendance=5  leave=0  orphans=5
fingerprint=1:1,3:1,4:2,5:1,6:1
```

Business data is byte-identical to the pre-apply baseline; only the schema additions and
the ledger row changed. Re-running apply is a no-op (`newlyApplied: []`).

Rollback: the four tables and two functions can be dropped, as nothing else references
them. Backups in `.local-backups/0007-20260909/`:
`hr_nexus_before_0007.dump` (restore-verified against the source before applying) and
`hr_nexus_after_0007.dump`, both with recorded SHA-256.

## Verification results

- Backend build and type-check pass.
- **283 tests pass, 0 fail** — 19 payroll unit tests and 21 database-backed payroll
  integration tests among them, plus every earlier milestone suite.
- Frontend Oxlint and build pass (exit 0).
- Docker `down` then `up --build` succeeds with the named volume preserved; ledger,
  orphans and business data survive the rebuild. `/api/payroll/periods` returns 401
  anonymously.

Payroll tests cover: salary snapshot behaviour, effective-salary selection, unpaid leave
deduction, allowances and manual lines, rounding boundaries, duplicate payroll
prevention, recalculation rules, state transitions, approval and payment locking,
authorization, own-only payslip access, historical immutability, rollback on failure,
and concurrent calculation and approval.

## Authenticated browser smoke

21 checks, all passing, against an isolated lab stack (API 5015, web 5187, database
`hr_nexus_payroll_browser` restored from the pre-0007 dump and migrated to `0001…0007`).
The source database was not involved. Evidence and screenshots:
`.local-backups/0007-20260909/browser/`.

Confirmed in the browser: the statutory and pro-ration limitations are stated up front;
a period opens and snapshots 22 working days; a duplicate period is refused; net pay is
the exact figure 2,977.27; the payslip lists the unpaid leave deduction 272.73; a manual
statutory line is labelled as hand-entered and survives recalculation exactly once;
approved payroll is shown as final and recalculation is disabled; an employee sees
exactly their own approved payslip with the same net pay; the payslip does not scroll
horizontally at 375px; an employee is denied the admin payroll page; no uncaught page
errors.

Note on the manual-line check: the record dialog shows a manual line **twice by
design** — once as a payslip deduction and once in the editable list beneath it — so
each region is asserted separately. Counting the whole dialog would always read 2 and
prove nothing.

## Deliberate V1 limitations

- **No pro-ration for mid-month joiners or leavers.** A partial month pays a full basic
  salary unless the administrator adds a manual line. Stated plainly in the UI rather
  than left to be discovered.
- **No statutory computation**, as above.
- **No public holidays**, inherited from the leave milestone: a holiday inside an unpaid
  leave range still counts.
- **No bank file or payslip PDF export.** Reports and export are the next P0.

## Follow-ups, not in this milestone

- Payroll summary and reporting hooks exist as an endpoint; the reporting milestone
  consumes them.
- **Release/security blocker, still open: there is no forced first-login password
  change.** Generated temporary passwords are unique, cryptographically random and
  stored only as bcrypt hashes with no plaintext in import history or logs, but nothing
  compels an employee to change one. This must be resolved before release; strong
  temporary passwords alone are not sufficient.
