# Reports, Export and Dashboards (V1) — P0

Status: **implemented and verified** on 9 September 2026. 314 tests and a 33-check
authenticated browser smoke pass.

**No migration was required.** Every report is a read-only aggregation over tables that
already exist, so migrations 0001–0007, their ledger rows and checksums, all business
data and the five protected orphan attendance rows are untouched. A dedicated test
asserts that running the whole report suite writes nothing and leaves the orphan rows
byte-identical.

## Reports never restate a business rule

The central design constraint: a report must not be able to disagree with the record it
came from. So nothing here recalculates anything.

| Figure | Where it comes from | Why not recompute |
| --- | --- | --- |
| Lateness | `attendance.late_minutes`, summed | Snapshotted at clock-in against the grace period in force *that day*; recomputing would restate history after a settings change |
| Leave days | `leave_requests.working_days`, summed | Snapshotted at submission against the working week in force then |
| Leave balances | `buildBalance`, the same function the employee's own page uses | One definition of "remaining" and "available" |
| Payroll money | `payroll_records` / `payroll_items`, summed in SQL | The payslip is immutable; the report reads it rather than re-deriving it |
| "Today" | `getZonedNow(timezone)` from Company Settings | The same clock attendance uses |

The only genuinely new code is `getBalancesForEmployees`, and it exists solely because
calling the existing per-employee balance query across a whole company is an N+1. It
runs two set-based queries and then feeds the identical `buildBalance` rule.

## The four reports

**Workforce** — headcount and employment-status breakdown per department, plus company
totals. Departments with nobody in them still report a zero headcount rather than
vanishing, and unassigned employees appear under "Unassigned" rather than being dropped
from company totals.

**Attendance** — days recorded, present, late, absent, on leave, total late minutes and
missing checkouts, per employee, over a date range and optionally one department. An
employee with no records in the range still appears, with zeroes.

**Leave** — requests overlapping the range, with per-type and per-status totals, plus
leave balances for the selected leave year.

**Payroll** — a period's gross, deductions and net; the same split by department; every
earning and deduction line grouped across the period; and a per-employee row.

## Security

- **Every route is administrator-only**, applied to the whole router rather than per
  route. An export is not a lesser endpoint than the report it exports: both pass the
  same two guards, so there is no download URL that skips authorization. A test asserts
  the report and its export return the *same* status for an employee, and that the
  refusal body leaks nothing payroll-shaped.
- **No employee can reach another employee's data.** Company-wide reporting is closed to
  the employee role entirely; employees keep their own payslip and leave routes.
- **Exports carry no verification metadata.** Attendance holds latitude, longitude, GPS
  accuracy and distance-from-office. Those describe where a person physically was and are
  deliberately absent from the export, which is a file that gets emailed around. QR
  challenge hashes and password hashes are never selected at all. Tests assert the actual
  fixture coordinates do not appear anywhere in the file.
- **Exports are bounded.** A range over 366 days is refused, and an export over 10,000
  rows is refused rather than silently truncated — a short report the reader cannot tell
  is short is worse than a clear refusal.
- **No client-supplied SQL, columns or limits.** Department and period identifiers are
  parsed as integers; leave type and status are matched against allowlists and ignored
  otherwise. A `leaveType` of `nonsense'; DROP TABLE users;--` is inert, and a test
  confirms the table still exists afterwards.

## CSV safety against formula injection

Quoting alone does **not** make a cell safe. Excel, LibreOffice and Sheets all evaluate a
*quoted* field beginning with `=` once the parser strips the quotes. Neutralisation
therefore happens **before** quoting, not instead of it:

- A value whose first non-whitespace character is `=`, `+`, `-`, `@`, tab or CR is
  prefixed with `'`, the spreadsheet convention for "this is text".
- Leading whitespace is looked through, so `   =1+1` is caught too.
- A plain number is exempt from the `-` rule. Prefixing every negative would turn every
  payroll deduction in the file into text, so `-272.73` is written as-is while
  `-2+3+cmd|' /C calc'!A0` is neutralised.
- RFC 4180 quoting is then applied on top, and the file carries a UTF-8 BOM — without it
  Excel on Windows decodes the file as the local code page and mangles non-ASCII names.

An employee literally named `=cmd|' /C calc'!A0` exists in the test fixtures, and is
asserted to reach the file readable but inert.

## Money in exports

Payroll aggregates are summed by PostgreSQL over `BIGINT` sen and returned as strings.
They are **never** converted to a JavaScript number on the way through — a company-wide
gross is exactly the aggregate that would eventually exceed a safe integer. `formatSenExact`
renders them with BigInt arithmetic. A test asserts the per-department totals sum back to
the company total exactly, and that every amount in the CSV has exactly two decimal
places.

## Admin dashboard

The dashboard previously used `CURRENT_DATE`, the database server's date, while
attendance decides which calendar day a clock action belongs to using the configured
timezone. Across midnight the two disagreed and the dashboard reported a different set of
people than the attendance page. It now uses the same zoned clock.

Three metrics were added:

- **On leave today** — from *approved leave covering the date*, not from attendance:
  someone on approved leave usually has no attendance row at all, so counting attendance
  would report them as simply missing.
- **Not clocked in** — derived by exclusion: employed, no attendance row today, and not
  on approved leave.
- **Current payroll** — the most recent period, its status, employee count and net.

## Defects found and fixed during this milestone

All three were found by the browser smoke, not by the unit tests, and all were
user-facing:

1. **The filter panel did nothing.** The loader was memoised on `[active, periodId]`
   while reading the filter object from its closure, capturing the first render's empty
   filters. Typing a 2020 start date still reported on the current month. Fixed by
   separating draft filters from applied filters.
2. **Every export downloaded as `report.csv`.** `Content-Disposition` is not a
   CORS-safelisted response header, so the browser hid the server's chosen filename from
   JavaScript. Fixed with `exposedHeaders`.
3. **A refused report was dressed up as an empty one.** The page kept the previous run's
   rows beside the error, and the empty state claimed "No leave in this range" when the
   query had actually been rejected. A failed load now clears its tab and says the report
   could not be run.

A fourth, smaller issue: the tab strip pushed the page 14px sideways at 375px. Tabs now
scroll themselves.

## Limitations, stated rather than implied

- **A leave request overlapping the range is counted in full, not split at the
  boundary.** A request is the unit a company approves, and pro-rating one would produce
  day counts that no leave record elsewhere in the system agrees with. The UI says this.
- **Leave balances are a position for the leave year, not a total for the date range.**
  The UI says this too.
- **No statutory computation.** HR Nexus does not compute EPF, SOCSO, EIS or PCB and
  makes no compliance claim; the reports page repeats it.
- **Absence is only as good as the records.** "Not clocked in" is an absence of evidence,
  not a judgement, and it does not know about public holidays, which V1 does not model.
- **CSV only.** XLSX export is not implemented; the exceljs dependency added for import
  is not reused here yet.
- **No company-wide data export** (master §42) — that is a separate deliverable from
  reporting and is not in this milestone.
- **Employee Dashboard V2** (master §40) is not in this milestone's scope, which covered
  admin dashboard metrics.

## API

All administrator-only:

| Method | Path |
| --- | --- |
| GET | `/api/reports/workforce`, `/workforce/export` |
| GET | `/api/reports/attendance`, `/attendance/export` |
| GET | `/api/reports/leave`, `/leave/export`, `/leave/balances/export` |
| GET | `/api/reports/payroll/:periodId`, `/payroll/:periodId/export` |

Filters: `from`, `to` (default: current month to date, in the company timezone),
`departmentId`, `leaveType`, `status`, `leaveYear`.

## Verification results

- Backend build and type-check pass.
- **314 tests pass, 0 fail, 1 skipped** — 10 CSV unit tests and 21 database-backed
  report integration tests among them. Three consecutive full runs were clean.
- Frontend Oxlint and build pass (exit 0).
- Docker `down` then `up --build` succeeds with the named volume preserved; the ledger,
  orphans and the September 2026 draft payroll period all survive. `/api/reports/workforce`
  and `/api/reports/attendance/export` both return 401 anonymously.

One intermittent was observed: a single full-suite run reported a process-level failure
in the Company Settings suite that did not reproduce in three subsequent full runs, and
the suite passes in isolation. The most likely cause is contention between suites
concurrently issuing `CREATE DATABASE ... TEMPLATE hr_nexus_v2_settings_baseline`, which
PostgreSQL refuses while the template is in use. It is recorded rather than treated as
fixed.

## Authenticated browser smoke

33 checks, all passing, against an isolated lab stack (API 5016, web 5188, database
`hr_nexus_reports_browser` restored from the post-0007 dump). The source database was not
involved. Evidence, screenshots and the four downloaded CSV files:
`.local-backups/reports-20260909/browser/`.

Confirmed in the browser: the dashboard shows on-leave, not-clocked-in and current
payroll; the workforce report groups by department and keeps an empty department visible;
each export downloads under its own server-chosen filename; the attendance export
contains none of the fixture coordinates and no credential material; an over-long range is
refused with a clear message and is not presented as an empty result; the leave report
states its boundary and leave-year rules; payroll totals and CSV amounts agree and carry
exactly two decimals; the layout does not scroll horizontally at 375px; an employee is
denied both the reports page and a direct export request (403) with no payroll data in the
refusal; and no uncaught page errors.
