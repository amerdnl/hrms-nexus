# HR Nexus V2 implementation plan

Master specification: `../HR_NEXUS_V2_MASTER.md` (read in full).
Feature complete: 10 September 2026. Validation/polish: 11–15 September.
Leadership demo: 16 September. Working branch: `feat/hr-nexus-v2`.
Use High for routine work. Recommend Extra High before complex migrations, payroll
money logic, difficult authorization/concurrency work, or complex import upserts.

## Milestone status — 9 September 2026

| Order | P0 milestone | Status / acceptance |
| --- | --- | --- |
| 1 | Focused repository audit and immediate API authorization | Complete; clean Docker rebuild passed and user accepted authenticated browser smoke |
| 2 | Migration strategy and employee history retention | Complete; migration receipt and browser gate explicitly accepted by user |
| 3 | Company settings | Complete; 0002 applied, 98 tests passed, authenticated browser smoke passed on 8 September 2026 |
| 4 | Employee/department stability | Complete; 0003 applied, 132 tests passed, 23/23 authenticated browser smoke on 8 September 2026 |
| 5 | Company import | Complete; 0004 applied, 172 tests passed, 27/27 authenticated browser smoke on 9 September 2026 |
| 6 | Attendance verification | Complete; 0005 applied, 208 tests passed, 18/18 authenticated browser smoke on 9 September 2026 |
| 7 | Leave balances/validation | Complete; 0006 applied, 243 tests passed, 23/23 authenticated browser smoke on 9 September 2026 |
| 8 | Payroll and payslips | Complete; 0007 applied, 283 tests passed, 21/21 authenticated browser smoke on 9 September 2026 |
| 9 | Reports/export and dashboards | Complete; no migration needed, 314 tests passed, 33/33 authenticated browser smoke on 9 September 2026 |
| 10 | Audit and demo data | Not started; now the active P0. Safe audit metadata, 20+ fictional employees, complete demo flow |

## First security increment

Implemented:
- Router-wide admin protection for every employee/department operation.
- Current database identity, role, account activity and employee eligibility checked
  for each protected request; stale/mismatched sessions return 401.
- HS256 restriction, mandatory expiry and identifier validation.
- Login eligibility consistent with protected routes.
- Expanded existing Docker build exclusions to cover .env.* variants and uploads.
- Node built-in tests: 35 HTTP checks and one opt-in real PostgreSQL lookup test.
- Architecture, database, audit, plan and demo documentation established.

Validation is recorded in the audit. Security increment committed locally as
`ca700db` — `fix: secure employee and department APIs` on `feat/hr-nexus-v2`.
All 36 tests passed in Docker; backend/test typechecking, both application builds,
and frontend lint passed. Backend lint has one pre-existing warning. No schema/data
migration belongs to this increment. Master brief and pre-existing docs/schema.dbml
remain untouched and untracked. The later clean Docker rebuild passed and the user
explicitly accepted the authenticated migration/browser gate.

## Migration and history-retention increment

User approved permanent-delete retirement; committed as `dd13abe`. Admin requests
now receive 409 directing deactivation. Its UI action/client helper are removed.
Deactivation/reactivation and all other functionality remain. Isolated API tests
prove that attendance/leave history survives the complete lifecycle.

The requested Extra High migration work has produced:
- Live schema/constraint/initialization inspection and full inspection of the five
  orphan attendance rows, with no source data or schema changes.
- A versioned pg runner with SHA-256 history, explicit target confirmation, advisory
  locking, transactions, read-only status, safe repeat apply and failure handling.
- Proposed migration 0001: replace user/leave cascades, add attendance FK NOT VALID,
  add narrow orphan ownership guards and a non-updatable exception view.
- Rehearsal against a logical copy of the existing volume's database and a fresh
  schema without seeds; checks for failures, concurrency, checksum drift, ambiguous
  COMMIT acknowledgement, row/ID/sequence preservation and reviewed compensation.
- 64 passing tests. Builds/typechecks/lint pass apart from one existing backend warning.

Review [the exact SQL, impact and rollback design](HR_NEXUS_V2_MIGRATION_DESIGN.md)
and [verification evidence](HR_NEXUS_V2_MIGRATION_EVIDENCE.md). The SQL checksum is
`3339156f7143d1ff5a12ebd3b71ca91f21d1c1c6775e4c602fccce1d8c787e39`.

The user explicitly approved only the checksum above for existing `hr_nexus`.
Applied at 2026-09-08 06:02:06 UTC after a current backup was restored and checked
in the isolated lab. Exactly one ledger row exists. All business/orphan fingerprints,
existing column definitions and complete sequence state match the approved baseline.
Source SQLSTATE/correction checks and authenticated API lifecycle checks on a fresh
post-application copy passed. No orphan ownership/data changed and no other migration
ran on the source. See [application receipt](HR_NEXUS_V2_MIGRATION_APPLICATION.md).

The user reviewed and accepted the receipt and considers migration 0001 complete.
Do not change its SQL, checksum, backup or the five unresolved attendance rows.
The user subsequently accepted the authenticated browser smoke and explicitly closed
this migration/browser gate. That acceptance is the recorded completion evidence;
agent browser attempts had reported no connection. The migration milestone is closed.

## Company Settings increment

Implemented within the existing stack and shared UI components, with no dependencies:
- Admin-only GET/PUT `/api/settings`, current-account authorization, field allowlist,
  server-side validation and safe JSON/body-size/database error responses.
- `/admin/settings` and sidebar navigation; all 13 master fields, accessible errors,
  setup/default guidance, loading/retry/save states and reload-discard confirmation.
- Atomic revision checks reject concurrent stale saves with 409 and preserve drafts.
- Additive `0002_company_settings.sql` creates one neutral configuration record.
  Applied through the reviewed runner at 2026-09-08 06:55:44 UTC after a separate
  current backup was restored and verified. No existing data, IDs, sequences, history
  constraints, 0001 SQL/ledger/backup or orphan attendance rows changed.
- 98 tests pass: original security/retention coverage plus settings validation,
  persistence, authorization, concurrency, DB constraints, fresh initialization,
  repeat apply and failed 0002 rollback. Typechecks/builds/lint pass apart from one
  existing backend lint warning. Docker rebuild/start passed with the existing volume.

See [Company Settings design and evidence](HR_NEXUS_V2_COMPANY_SETTINGS.md).
The authenticated Company Settings browser gate passed on 8 September 2026. Admin
navigation, neutral guidance, all requested invalid-field cases, reload/discard,
375-pixel layout and employee route denial passed. Valid save/reload and a real
two-editor stale revision conflict passed only against a fresh synthetic lab database.
Source settings remain neutral at revision 0. See the linked browser evidence.
Company Settings is complete; Employee/Department Stability is now the active P0.

## Employee/Department Stability increment

Implemented within the existing stack and shared UI components, with no dependencies:
- Account activity is derived from employment status by one shared rule matching the
  eligibility `findSessionUserById` already enforced. Reactivating through Edit now
  re-enables the sign-in. Every lifecycle path locks the employee row and then its
  linked account in that fixed order, so competing writes serialize.
- All five lifecycle statuses (`active`, `probation`, `inactive`, `resigned`,
  `terminated`) are supported end to end.
- Bounded field allowlists, required/optional semantics with explicit `null` clearing,
  real calendar dates, a 72-byte bcrypt password bound, and positive-integer route IDs.
  Unknown fields return 400 instead of silently succeeding.
- Case- and whitespace-insensitive email identity. Duplicate checks use
  `lower(btrim(email))` and exclude the employee's own linked account ID, which fixes
  the standalone-admin case the old `employee_id` comparison skipped. Login was aligned
  to the same expression. No stored email is rewritten.
- Safe client acquisition (503), isolated rollback, typed department input (400), and
  a single conditional department DELETE whose concurrent FK failure maps to 409.
- Server pagination with email search, plus separate aggregate headcounts
  (`GET /departments`), a complete lightweight directory (`GET /employees/lookup`) and
  `GET /employees/job-titles`. Every consumer was migrated together; attendance joins
  and department membership are never truncated. Pagination is opt-in, so the response
  shape stays backward compatible.
- Create/edit form parity: department required in both, all statuses offered, email
  prefilled, date/gender/employment-date fields covered, explicit `null` clearing.

Additive `0003_user_email_normalized_identity.sql` creates one unique index on
`lower(btrim(email))` behind a fail-closed preflight. Applied through the reviewed
runner after the user explicitly approved checksum
`1014b30d8737546814d0a1199ae653bb92e669a1ccdc190c4890f18fbe3a8b1b`, with a separate
backup taken and restore-verified beforehand. The only source difference is the ledger
gaining `0003`; all rows, sequences, constraints, the 0001/0002 checksums and the five
orphan attendance rows are unchanged.

132 tests pass (was 98), including 18 new database-backed stability checks and the
contract unit tests. Typechecks, both builds and frontend lint pass; backend lint keeps
its one pre-existing warning. `docker compose down` then `up --build` passed with the
existing volume, and 0003 and all data survived. The authenticated browser smoke passed
23/23 against an isolated lab stack, and the database confirmed a `resigned` employee
edited back to `active` regained an enabled account.

See [design, evidence and follow-ups](HR_NEXUS_V2_EMPLOYEE_STABILITY.md).
Employee/Department Stability is complete.

## Company Import increment

Implemented within the existing stack and shared UI components:
- `/admin/import` and `/api/import`, admin-only: download template, upload, map
  columns, validate, review a filterable preview, confirm, summary.
- CSV is read by an in-repo RFC 4180 parser, so CSV import adds no supply chain.
  XLSX uses exceljs 4.4.0, approved in preference to the smaller `xlsx` package
  because that one carries an unfixable high-severity advisory on npm.
- Headings are matched through an alias table after normalisation; the suggestion is
  correctable, unrecognised and ambiguous columns are reported, and the submitted
  mapping is validated against the real file.
- Rows classify as new, update, unchanged, conflict or invalid. Updates compare only
  mapped columns. Duplicates inside the file point at the first occurrence.
- Applying is one transaction, opt-in twice over (`apply_updates`,
  `create_missing_departments`), and re-classifies rows against live data so a stale
  preview cannot be applied on stale terms. A failure rolls the whole import back.
- Passwords are not importable. Credential columns are blanked at upload; generated
  temporary passwords are returned once and never stored or logged.
- Additive `0004_import_jobs.sql` creates import_jobs and import_job_rows. Applied
  through the reviewed runner after the user explicitly approved checksum
  `ef174819b9e0f96c8f9e1bfb438f2f79e7ab742ef3a4bbabf85067d09d8eb92b`, with a backup
  taken and restore-verified beforehand. The only source difference is the new ledger
  row; the employee link is RESTRICT so import history can never cascade into
  workforce records.

172 tests pass (was 132), including 18 database-backed import checks. Typechecks, both
builds and frontend lint pass; backend lint keeps its one pre-existing warning.
`docker compose down` then `up --build` passed with the existing volume. The
authenticated browser smoke passed 27/27, including an imported employee signing in
with their generated temporary password.

A database assertion during that smoke found and fixed a real defect: an ignored
credential column was still being persisted in the stored file.

See [design, evidence and follow-ups](HR_NEXUS_V2_COMPANY_IMPORT.md).
Company Import is complete.

## Attendance Verification increment

Replaces honour-system clocking with server-verified attendance:
- `attendanceTime.ts`, which hard-coded Asia/Kuala_Lumpur and a 09:00 cutoff for every
  company, is removed. Timezone, work start/end, grace period, office coordinates and
  radius all come from Company Settings, and the read path uses the same zone as the
  write path. The unverified check-in/check-out service functions are removed too.
- An administrator displays a short-lived office QR; only its SHA-256 hash is stored.
  One code serves everyone in the window, while uniqueness over
  (challenge, employee, action) makes it non-replayable per person. Expiry is enforced
  by the database clock; the display reissues just before expiry.
- Location is judged before the code is spent, and the whole action is one transaction.
  A fix vaguer than 150 m is refused; otherwise the geofence is the radius plus at most
  a 50 m accuracy allowance. An unconfigured office fails closed everywhere.
- Only latitude, longitude and accuracy are accepted, only at the moment of an action.
  There is no watchPosition anywhere; the official timestamp is always the server's.
- Lateness follows the configured start and grace and is snapshotted into late_minutes.
  Overnight shifts recognise their early-morning half.
- All four methods are supported. Administrator records are never marked verified, and
  an administrator cannot declare a record to be a QR scan.

Additive `0005_attendance_verification.sql` adds eleven nullable columns plus two QR
tables. Applied after the user explicitly approved checksum
`00dede24d12d79e58d8fbbcc772181c9794fd05d9f48f9b77ee8222176f9be2e`, with a backup taken
and restore-verified beforehand. The only source difference is the new ledger row, and
zero rows carry verification metadata: every legacy record, including the five orphans,
is untouched.

208 tests pass (was 172), including 19 database-backed attendance checks. Two real bugs
were caught by those tests and fixed before commit: a token normaliser that stripped
base64url hyphens and corrupted roughly half of all codes, and a housekeeping query
fired without await on a connection about to be released.

`docker compose down` then `up --build` passed with the existing volume. The
authenticated browser smoke passed 18/18, including a geofence refusal at 2335 m, a
denied location permission, an expired code and a verified check-in and check-out.

See [design, honest limitations and evidence](HR_NEXUS_V2_ATTENDANCE.md).
Attendance Verification is complete.

## Leave Balances and Validation increment

- `leave_policies` and `leave_entitlements` added. Policy is company configuration, not
  statutory entitlement: seeded defaults are labelled as HR Nexus defaults with no legal
  meaning in the table comment, the API and the UI, and every value is editable. No
  Malaysian statutory rule is encoded and no compliance is claimed.
- **Usage is derived, never stored.** A balance is the grant minus the working days on
  approved requests, so approving twice cannot deduct twice by construction. Grants
  carry entitlement, carry-forward and a signed adjustment so corrections never rewrite
  history.
- Duration counts only days in the configured working week -- previously `working_days`
  was stored and used by nothing -- and is snapshotted at submission so a later settings
  change cannot restate historical leave. Public holidays are not modelled in V1 and the
  UI says so.
- Validation covers real dates, overlap against pending and approved, insufficient
  balance naming the exact numbers, ranges with no working days, and a refusal to span
  two leave years. Unknown payload fields are refused, so a client cannot smuggle a
  status or employee id.
- Submission takes a transaction-scoped advisory lock per employee; decisions are
  guarded inside the UPDATE, so two simultaneous approvals decide exactly once.
- Cancellation releases days and marks the row rather than deleting it; started leave is
  refused and directed to an administrator correction.
- Unpaid leave never limits by balance and is exposed for payroll through one agreed
  endpoint. Company Import gains optional opening-balance columns recorded as
  carry-forward.

Additive `0006_leave_balances.sql` applied after the user explicitly approved checksum
`a8c6e479bb00ba46d482389a3082c26f9206fb16761eabaaa2ad6cfc791a34fd`, with a backup taken
and restore-verified beforehand. Its one non-additive step widens the leave status CHECK
to a strict superset; rollback can only restore the original constraint while no row is
cancelled, after which the retained backup is the recovery path. The only source
differences are the ledger row and that CHECK, and no leave row was back-filled.

243 tests pass (was 208). A real UX defect was found by browser verification and fixed:
field-level validation messages were being dropped, so a refused submission showed only
a generic summary.

See [design, limitations and evidence](HR_NEXUS_V2_LEAVE.md).
Leave Balances is complete; Payroll and Payslips followed.

## Payroll and Payslips (V1) increment

- Four tables added by migration 0007: `employee_compensation`, `payroll_periods`,
  `payroll_records`, `payroll_items`. Purely additive; no existing table, column,
  constraint or row was modified.
- **Money is integer sen in BIGINT, never a float.** All 10 `*_sen` columns are
  `bigint`, arithmetic is BigInt, and decimal input is parsed from a string digit by
  digit rather than through parseFloat. The only NUMERIC columns are the two scaled
  quantities (overtime hours, unpaid leave days), never a money amount.
- **One rounding rule, applied once per derived line**: half away from zero, via
  `(2n + d) / 2d` in BigInt, which has no fractional intermediate. Only unpaid leave and
  overtime are rounded; totals are exact integer sums, and `net_sen = gross_sen -
  deductions_sen` is a database CHECK. Net is deliberately not clamped at zero.
- **No EPF/SOCSO/EIS/PCB is computed and no Malaysian rate is encoded.** Statutory
  amounts exist only as manual lines, enforced by
  `CHECK (NOT is_statutory OR is_manual)`, and the limitation is repeated in the table
  comment, the API, the payroll page and the payslip.
- **Historical payslips cannot change**: a record snapshots identity, compensation,
  working days, unpaid leave and overtime, so a later rename, salary revision,
  working-week change or leave correction cannot rewrite it. Salary history is
  append-only; calculation selects the row in force at the period end date.
- **State machine enforced in the database** by a BEFORE UPDATE trigger:
  draft -> calculated -> reviewed -> approved -> paid, with no path backwards out of
  approved. A second trigger refuses every INSERT/UPDATE/DELETE on records and items of
  an approved or paid period, so immutability holds against direct SQL too.
- **Duplicate calculation is structurally impossible**: UNIQUE (period_id, employee_id)
  and UNIQUE (period_year, period_month). Recalculation locks the period FOR UPDATE,
  regenerates only non-manual lines, and runs in one transaction.
- Employees see only their own payslips, resolved from the session rather than a request
  parameter, and only for approved or paid periods.
- Company Import gained basic salary, allowance and overtime rate through the same
  string-to-sen path. A new compensation row opens only when the amounts differ from
  what is in force, so compensation history is never silently overwritten.
- A real defect was found and fixed during the milestone: unpaid leave spanning a period
  boundary was deducting the request's full duration instead of the working days falling
  inside the period.

283 tests pass (was 243). Migration 0007 was applied to source after explicit approval
with a restore-verified backup; the only source changes are the schema additions and the
ledger row, and business data is byte-identical to the pre-apply baseline.

See [design, rounding rules, limitations and evidence](HR_NEXUS_V2_PAYROLL.md).
Payroll and Payslips is complete; Reports/export and dashboards followed.

## Reports, Export and Dashboards (V1) increment

- **No migration.** Every report is a read-only aggregation over existing tables, and a
  test asserts the whole suite writes nothing and leaves the five orphan rows identical.
- Four reports behind `/api/reports`, all administrator-only: workforce, attendance,
  leave (requests plus balances) and payroll, each with a CSV export.
- **No business rule is restated.** Lateness is summed from the `late_minutes`
  snapshotted at clock-in, leave days from the `working_days` snapshotted at submission,
  balances go through the same `buildBalance` the employee's own page uses, and payroll
  figures are read from the immutable payslip records. A report therefore cannot disagree
  with the record it came from. `getBalancesForEmployees` is the only new calculation
  path, and exists solely to replace an N+1.
- **An export is not a weaker door than its report**: the guard is on the whole router,
  and a test asserts both return the same status for an employee.
- **Exports carry no verification metadata.** Coordinates, GPS accuracy and
  distance-from-office describe where a person physically was and are excluded; tests
  assert the fixture coordinates appear nowhere in the file.
- **CSV formula injection is neutralised before quoting**, because a spreadsheet
  evaluates a quoted field beginning with "=" once the parser strips the quotes. A plain
  number is exempt from the "-" rule so payroll deductions stay readable. An employee
  named `=cmd|' /C calc'!A0` is in the fixtures.
- Exports are bounded: a range over 366 days and an export over 10,000 rows are refused
  rather than silently truncated.
- Payroll aggregates are summed in SQL over BIGINT sen and formatted with BigInt, never
  converted to a JavaScript number.
- The admin dashboard now resolves "today" through the configured company timezone
  instead of CURRENT_DATE, which previously disagreed with attendance across midnight,
  and gains on-leave-today, not-clocked-in and current payroll status.
- Three user-facing defects were found by browser verification and fixed: the filter
  panel did nothing (a memoised loader captured the first render's empty filters), every
  export downloaded as "report.csv" (Content-Disposition is not CORS-safelisted), and a
  refused report was presented as an empty one with the previous run's rows still on
  screen. Tabs also scroll rather than pushing the page sideways at 375px.

314 tests pass (was 283). See [design, limitations and evidence](HR_NEXUS_V2_REPORTS.md).
Reports is complete; Audit log and demo data is now the active P0.

## Remaining blockers / release gates

- Migration 0001 and its browser gate are complete and accepted. Migrations 0002 and
  0003 were each separately authorized as reviewed safe additive migrations and are applied.
- `employment_status` still has no database CHECK constraint; it is enforced in
  application validation only. Adding one is a materially different additive migration
  and needs its own review and approval before any source use.
- Orphan ownership is unresolved by design. No fabricated employee, ownership
  reassignment, record deletion, seed replay, volume reset or destructive cleanup.
- Clean Docker rebuild/restart passed after retry; no Docker credential settings changed.
  Fresh npm audit reports qs (moderate) and nanoid (high); record and resolve before release.
  Before any dependency upgrade, identify the affected dependency paths, compatible
  fixed versions and regression risk. No dependency upgrade is currently underway.
- Company Settings authenticated browser smoke is complete. Its source settings were
  not configured during testing. All three accepted migration gates remain closed.
- The test laboratory exhausted its tmpfs twice. The root cause was found during the
  payroll milestone: no integration suite dropped its clone database, on the stated
  convention that clones were retained for inspection, so 346 abandoned clones filled
  the 3 GB tmpfs and every database-backed suite failed at once with 53100. Fixed in
  `fcb7933`: a passing suite drops what it created, a failing one keeps it. The lab was
  recreated with an 8 GB tmpfs and both documented baselines rebuilt from retained
  backups; a full run now settles at 118 MB. The source database was unaffected
  throughout and verified byte-identical to its recorded baseline.
- Active P0: audit log and demo data; reports/export and dashboards is complete.
- Remaining P0 scope: audit log and demo data, plus two master items not covered by the
  reporting milestone's stated scope: Employee Dashboard V2 (master §40) and company-wide
  data export (master §42). XLSX export is also not implemented; exports are CSV only.
- Observed intermittent, not reproduced: one full-suite run reported a process-level
  failure in the Company Settings suite that did not recur in three subsequent full runs,
  and the suite passes in isolation. Most likely contention between suites concurrently
  issuing `CREATE DATABASE ... TEMPLATE hr_nexus_v2_settings_baseline`, which PostgreSQL
  refuses while the template is in use. Recorded rather than treated as fixed.
- **Release/security blocker: no forced first-login password change.** Generated
  temporary passwords are unique and cryptographically random (128-bit), only bcrypt
  hashes are persisted, and no plaintext reaches import history or logs -- all verified.
  But there is no must_change_password column and no forced-reset logic, so nothing
  compels an employee to change a distributed temporary password. Needs its own
  milestone before release.
- Company Import compensation fields are delivered with Payroll V1: basic salary,
  allowance and overtime rate import through the same string-to-sen path, and a new
  compensation row is opened only when the amounts differ from what is in force, so
  compensation history is never silently overwritten.
- qrcode-generator 2.0.4 (MIT, zero dependencies, no advisories) was added for QR
  rendering with explicit approval. exceljs's transitive uuid advisory, plus qs and
  nanoid, remain recorded release items; no dependency was upgraded.
- exceljs 4.4.0 was added for XLSX import with explicit approval. Its only advisory is
  a transitive qs-style `uuid` buffer-bounds issue in a path the import never calls;
  it joins qs and nanoid as a recorded pre-release item. No other dependency changed.

## Regression / polish backlog

- Minor, nonblocking: when the leave list is empty after filtering, its empty-state
  message incorrectly implies requests exist. Show a filter-specific no-results
  message; distinguish it from having no requests at all.
- Minor: the employee balance panel shows the current leave year only, so leave booked
  for a future year is validated correctly but is not reflected in the panel.

## Verification commands

```sh
cd backend
npm run type-check
npm run build
npm test
```

```sh
cd frontend
npm run lint
npm run build
```

```sh
docker compose exec -T -e HR_NEXUS_DB_TESTS=1 backend npm test
```

The employee/department stability, company import, attendance and leave database suites
are gated by `HR_NEXUS_EMPLOYEE_LAB=1`, `HR_NEXUS_IMPORT_LAB=1`,
`HR_NEXUS_ATTENDANCE_LAB=1` and `HR_NEXUS_LEAVE_LAB=1`, and run only against the
isolated lab alongside the other lab suites:

```sh
docker run --rm --volumes-from hr-nexus-backend:ro \
  --network hr-nexus-v2-migration-lab \
  -e HR_NEXUS_MIGRATION_LAB=1 -e HR_NEXUS_SETTINGS_LAB=1 \
  -e HR_NEXUS_EMPLOYEE_LAB=1 -e HR_NEXUS_IMPORT_LAB=1 \
  -e HR_NEXUS_ATTENDANCE_LAB=1 -e HR_NEXUS_LEAVE_LAB=1 -e HR_NEXUS_DB_TESTS=1 \
  -e DATABASE_URL=postgresql://postgres@hr-nexus-v2-migration-lab/postgres \
  --mount "type=bind,src=$PWD/database,dst=/database,readonly" \
  --mount "type=bind,src=$PWD/docs,dst=/docs,readonly" \
  hr-nexus-backend sh -c 'node --import tsx --test tests/*.test.ts'
```

The DB test creates only session-local temporary tables and rolls back; it does not
modify public employee/user records. Final demo verification must include a normal
`docker compose down` followed by `docker compose up --build`, preserving volumes.

Migration status/apply commands and isolated rehearsal instructions are documented
in `HR_NEXUS_V2_DATABASE.md`. The runner is never attached to application startup.
