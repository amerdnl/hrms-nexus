# HR Nexus V2 repository audit

Audited 8 September 2026 against the complete `HR_NEXUS_V2_MASTER.md`.
Starting branch: `docs/readme-update`; commit: `55a1641` (merge PR #13).
Working branch created: `feat/hr-nexus-v2`. Initially untracked: master brief and
`docs/schema.dbml`; both preserved. No AGENTS.md applies to this repository.

## Follow-up status

Permanent deletion is retired in `dd13abe`. Migration 0001 and its browser gate are
complete and explicitly accepted by the user. Company Settings is implemented and
0002 is applied after a verified current backup and isolated rehearsal.
Company Settings authenticated browser smoke passed on 8 September 2026, including
invalid fields, mobile layout, synthetic lab persistence/concurrency and employee route
denial. Source settings remain neutral.
See `HR_NEXUS_V2_COMPANY_SETTINGS.md` for defaults, validation and exact evidence.

Employee/Department Stability is complete. Migration 0003 adds a unique index on
`lower(btrim(email))`, applied after explicit user approval of its checksum with a
restore-verified backup; the only source change is the new ledger row. Lifecycle and
linked-account state are now derived from one rule and written under row locks,
employee/department writes have bounded server-side validation with predictable
400/404/409/503 responses, and the employee list is paginated server-side with the
department headcount, job title and attendance directory consumers migrated to
dedicated endpoints. 132 tests pass and a 23-check authenticated browser smoke passed.
See `HR_NEXUS_V2_EMPLOYEE_STABILITY.md`.

Company Import is complete. Migration 0004 adds the two import history tables, applied
after explicit user approval of its checksum with a restore-verified backup; the only
source change is the new ledger row. `/admin/import` and `/api/import` provide
template, upload, alias-based column mapping, row classification, a reviewable preview
and a single-transaction apply with explicit opt-ins for updating existing employees
and creating missing departments. Passwords are never importable and credential columns
are blanked on upload; generated temporary passwords are returned once. exceljs 4.4.0
was added for XLSX with approval. 172 tests pass and a 27-check authenticated browser
smoke passed. See `HR_NEXUS_V2_COMPANY_IMPORT.md`.

Attendance Verification is complete. Migration 0005 adds nullable verification metadata
and two QR tables, applied after explicit approval with a restore-verified backup; the
only source change is the new ledger row and no existing record carries metadata. The
hard-coded Asia/Kuala_Lumpur zone and 09:00 late cutoff are gone: timezone, working
hours, grace period, office coordinates and radius all come from Company Settings.
Clocking requires a short-lived office QR, stored only as a hash and non-replayable per
person per action, plus a location inside the configured radius, with the server setting
the official time. An unconfigured office fails closed. 208 tests pass and an 18-check
authenticated browser smoke passed. See `HR_NEXUS_V2_ATTENDANCE.md`.

Leave Balances and Validation is complete. Migration 0006 adds leave policy and
entitlement tables plus four nullable columns on leave_requests, and widens the leave
status CHECK to include cancelled; applied after explicit approval with a
restore-verified backup, and no leave row was back-filled. Leave usage is derived from
approved requests rather than stored, so approving twice cannot deduct twice. Duration
uses the configured working week and is snapshotted at submission. Overlap, insufficient
balance, year-boundary and no-working-day requests are all refused with specific
messages, submission is serialised per employee by an advisory lock, and decisions are
guarded inside the UPDATE. Cancellation releases days and keeps the record. Policy is
company configuration, explicitly not a statutory entitlement, and no Malaysian legal
compliance is claimed. 243 tests pass and a 23-check authenticated browser smoke passed.
See `HR_NEXUS_V2_LEAVE.md`.

Payroll and Payslips (V1) is complete. Migration 0007 adds four payroll tables and three
triggers, applied after explicit approval with a restore-verified backup; it is purely
additive and the only source changes are the new empty tables and the ledger row. Money
is integer sen in BIGINT with BigInt arithmetic and no floating-point path anywhere;
decimal input is parsed from a string digit by digit. There is one rounding rule, half
away from zero, applied at most once per derived line, and totals are exact integer sums
with `net_sen = gross_sen - deductions_sen` as a database CHECK. No EPF, SOCSO, EIS or
PCB is computed and no Malaysian rate is encoded: statutory amounts exist only as manual
lines, enforced by `CHECK (NOT is_statutory OR is_manual)`. Payroll records snapshot
identity, compensation and working days, so a later rename, salary revision or
working-week change cannot rewrite a historical payslip. The database enforces the
draft -> calculated -> reviewed -> approved -> paid state machine with no path backwards
out of approved, and refuses any change to an approved or paid period's records and
items. Duplicate calculation is prevented by UNIQUE (period_id, employee_id) and
UNIQUE (period_year, period_month). Employees see only their own payslips, and only for
approved or paid periods. 283 tests pass and a 21-check authenticated browser smoke
passed. See `HR_NEXUS_V2_PAYROLL.md`.

Reports, Export and Dashboards (V1) is complete, with no migration: every report is a
read-only aggregation over existing tables, and a test asserts the suite writes nothing
and leaves the five orphan rows identical. Four administrator-only reports (workforce,
attendance, leave, payroll) each have a CSV export. No business rule is restated:
lateness is summed from the minutes snapshotted at clock-in, leave days from the working
days snapshotted at submission, balances go through the same buildBalance the employee's
own page uses, and payroll figures are read from the immutable payslip records. Exports
are guarded by the same router-level authorization as the reports, carry no coordinates,
GPS accuracy or distance-from-office, and are bounded at 366 days and 10,000 rows.
CSV formula injection is neutralised before quoting, because a spreadsheet evaluates a
quoted field beginning with "=" once the parser strips the quotes. Payroll aggregates are
summed in SQL over BIGINT sen and formatted with BigInt, never through a JavaScript
number. The admin dashboard now resolves "today" through the configured company timezone
rather than CURRENT_DATE, resolving the dashboard/attendance mismatch recorded below.
314 tests pass and a 33-check authenticated browser smoke passed.
See `HR_NEXUS_V2_REPORTS.md`.

Audit Log V1 and the demo dataset are complete. Migration 0008 adds one append-only
`audit_events` table with a trigger that refuses UPDATE and DELETE - a trigger rather than
REVOKE, because the application connects as the owning role. 26 call sites across nine
controllers cover authentication, employee lifecycle, departments, settings, import,
attendance corrections, leave decisions and policy, salary changes and every payroll
transition including approval and payment. Redaction is by key name and recursive, so a
secret nested two objects deep is still removed, and a diff excludes a forbidden field
rather than comparing it; passwords, hashes, tokens, QR material and attendance
coordinates can never be recorded, and the change set is capped at 8 KB in the application
and again as a database CHECK. The audit insert is wrapped in a SAVEPOINT because
PostgreSQL aborts a transaction on the first error: without it a failed audit write turned
the caller's COMMIT into a rollback while the API still answered 200. Reading is
administrator-only and there is no write endpoint, so history cannot be forged. The demo
dataset is a fictional 6-department, 24-employee company with attendance, leave,
compensation, an approved August 2026 payroll and audit activity; its loader refuses the
application's database unless explicitly flagged, confines every write to identifiers
9000-9099, and aborts if the protected orphan rows move. 358 tests pass and a 24-check
authenticated browser smoke passed. See `HR_NEXUS_V2_AUDIT_LOG.md` and
`HR_NEXUS_V2_DEMO_DATA.md`.

Migration 0008 was applied to source through the checksummed runner after its design and
checksum were approved, with a fresh backup taken and proved restorable beforehand; the
runner reported `newlyApplied: ["0008"]` and re-running it was a no-op. One gap is
recorded rather than glossed over: that pre-apply dump is no longer present in
`.local-backups/0008-20260909/`, though its SHA-256 is. Full detail is in
`HR_NEXUS_V2_AUDIT_LOG.md`.

**P0 is not feature-complete.** Employee Dashboard V2 (master section 40), company-wide
data export (section 42), XLSX export and the forced first-login password change all
remain outstanding.

A test-harness defect was found and fixed during this milestone: no integration suite
dropped its clone database, so 346 abandoned clones exhausted the laboratory's tmpfs and
every database-backed suite failed at once. A passing suite now drops what it created and
a failing one keeps it for inspection. The source database was unaffected and verified
byte-identical to its recorded baseline.

Recorded release/security blocker: there is no forced first-login password change.
Generated temporary passwords are unique, cryptographically random and stored only as
bcrypt hashes with no plaintext in import history or logs, but nothing compels an
employee to change one.

Original audit findings below are historical, not the current migration status.

Security release items remain recorded: transitive qs (moderate) and nanoid (high).
No dependencies were upgraded. Before doing so, identify affected paths, compatible
fixed versions and regression risk. The leave filtered-empty-message issue is a minor,
nonblocking regression/polish item in the implementation plan.

## Architecture and versions

React SPA → Axios Bearer requests → Express routes/controllers → parameterized
`pg` queries → PostgreSQL. Attendance has a service layer; other modules largely
query from controllers. No ORM, migration runner, backend linter, formatter, or
automated test suite existed at baseline. Existing frontend Oxlint is available.

Versions below are resolved from committed lockfiles, not only package ranges:

| Layer | Versions |
| --- | --- |
| Frontend | React/React DOM 19.2.8, React Router 7.18.2, Axios 1.19.0, Lucide 1.28.0 |
| Build/style | Vite 8.2.0, Tailwind/@tailwindcss/vite 4.3.3, plugin-react 6.0.5, TypeScript 6.0.3, Oxlint 1.77.0 |
| Backend | Express 5.2.1, pg 8.22.0, bcrypt 6.0.0, jsonwebtoken 9.0.3, Multer 2.2.0, cors 2.8.6, dotenv 17.4.2 |
| Backend tooling | TypeScript 7.0.2, tsx 4.23.8, nodemon 3.1.14 |
| Runtime | Host Node 24.18.0/npm 11.16.0; Dockerfiles use node:24-alpine |
| Database | Compose postgres:17-alpine; running server PostgreSQL 17.10 |

Docker Compose services: postgres (5433:5432), backend (5001:5000), frontend
(5173:5173). Database persists in `hr-nexus_postgres_data`. Source is bind-mounted;
container node_modules use anonymous volumes. Existing orphan Redis container/volume
is unrelated to the declared stack and was not removed or incorporated.

## Existing functionality and route map

| UI | API | Baseline |
| --- | --- | --- |
| /login | /api/auth/login, /me, /logout | JWT login, session restore, client logout |
| /admin/employees, /new, /:id, /:id/edit | /api/employees | Create/edit/detail, deactivate/reactivate, permanent delete |
| /admin/departments, /new, /:id, /:id/edit | /api/departments | CRUD, employee membership |
| /admin/attendance; /employee/attendance | /api/attendance | Server time, history, manual admin corrections |
| /admin/leave; /employee/leave | /api/leaves | Apply, own history/detail, admin approval/rejection |
| /admin/dashboard; /employee/dashboard | /api/dashboard | Database-backed counts/recent records |
| /employee/profile | /api/profile | Restricted contact fields, image upload/removal, password change |

`/employee/profile/password` redirects to profile, where password change is a modal.
AppLayout/Sidebar, shared form/table/modal primitives, light/dark/system theme,
loading/error/empty states and responsive classes already exist. Preserve them.
Employee list pagination and filtering were client-side over full record sets, and
search did not cover email. Resolved in the stability milestone: the list is
paginated and filtered server-side, search covers email, and department headcounts,
job titles and the attendance directory each have their own endpoint.

## Security findings and first implementation

| Finding | Severity | Status |
| --- | --- | --- |
| All employee/department operations were publicly accessible, including permanent deletion | Critical | Fixed: router-wide authentication plus admin authorization |
| Issued JWT trusted stale role/employee linkage and inactive accounts | High | Fixed: current account/link/status lookup on every protected request; mismatches return 401 |
| JWT algorithm not explicitly pinned and expiry not required | High | Fixed: HS256 only, expiry and safe positive identifiers required |
| Inactive employment could still log in if users.is_active remained true | High | Fixed: login checks the same current eligibility query |
| Docker exclusions covered .env but omitted .env.* variants and uploaded photos | High | Expanded existing build-context exclusions; fresh build verification blocked on Docker metadata lookup |
| Permanent employee deletion destroys users/leave and can orphan live attendance | High | Admin-restricted now; retention policy change requires approval (see database plan) |
| localStorage JWT; logout/password change do not revoke a copied token | Security consideration | Existing architecture preserved; separate session-revocation work remains |
| No login throttling; raw internal error logging | Follow-up | Review before demo; do not log credentials or sensitive SQL error details |
| Profile photos public via static URLs | Follow-up | Existing photo behavior preserved; never reuse for private HR documents |

Leave detail uses `id AND employee_id`; list/create resolve the current user's
employee ID. Attendance self-service uses authenticated employeeId, never a request
employee ID. Profile updates whitelist contact columns and reject restricted fields.
Uploads already limit size, allow JPG/PNG/WebP, check signatures, randomize names,
and constrain managed deletion paths. SQL values are parameterized; dynamic columns
come from code allowlists. No general mass assignment was found in reviewed writes.
Payroll endpoints are admin-only except the employee payslip routes, which resolve the
employee from the authenticated session rather than a request parameter and expose only
approved or paid periods.

Auth uses bcrypt (12 rounds on new/changed passwords), JWT Bearer, default 8-hour
expiry, frontend 401 session clearing, and admin/employee roles. The new account
lookup selects only ID, employee linkage, and role; it never selects password hashes.
Current eligibility permits active/probation linked employees, plus active standalone
admin accounts. Database failures fail closed. JWT validation options were checked
against [upstream jsonwebtoken documentation](https://github.com/auth0/node-jsonwebtoken#jwtverifytoken-secretorpublickey-options-callback).

Only .env.example files are tracked. Actual .env files and stored credentials were
not opened, changed, or printed. Historical secrets/seed credentials have not been
fully audited; do not interpret this as a complete secrets clearance.

## Database and integrity findings

See `HR_NEXUS_V2_DATABASE.md` for exact drift and the proposed migration path.
Five orphan attendance records exist. No business data was altered or deleted.
Fresh schema cascades attendance/users/leave on employee deletion; actual attendance
has no employee FK. Live IDs are mostly INTEGER, while fresh schema uses BIGINT.
Department deletion guards assigned employees and has a database FK backstop.
Users.email uniqueness was case-sensitive although login compared LOWER(email);
migration 0003 adds a normalized unique index and the application now uses
lower(btrim(email)) for sign-in and every duplicate check.
Employment status still lacks a database CHECK and is enforced in validation only. Leave balances, overlap and working-day validation and controlled repeat decisions were
added in the leave milestone. Attendance has unique employee/date and
conditional checkout updates, but settings/QR/location verification are absent.
Dashboard CURRENT_DATE and attendance's timezone handling are now aligned: both use the
zoned clock built from Company Settings.

## P0 gaps

Employee Dashboard V2 (master §40), company-wide data export (master §42) and XLSX export
remain outstanding. The migration mechanism, company settings, import workflow, attendance
verification, leave balances, payroll, reporting, the audit log and demo data are now in
place. Dashboard
already uses real SQL; extend it instead of replacing mock data that is not present.
Demo data is insufficient (one active employee found in the live aggregate).
No automated coverage existed at baseline. Added targeted authorization tests rather
than a new testing framework. Remaining workflow coverage follows the master plan.

## Validation evidence

- Baseline frontend lint/typecheck/build passed.
- Baseline backend typecheck/build failed because local node_modules lacked Multer.
  Restored exact lockfile dependencies with npm ci (no new dependency/version change).
- Backend typecheck/build now pass. Tests are also typechecked.
- 35 HTTP authorization/ownership tests pass; one PostgreSQL temporary-table test
  passes inside Docker (36 total with HR_NEXUS_DB_TESTS=1).
- Existing frontend Oxlint applied to backend: no errors, one pre-existing
  no-useless-empty-export warning in src/types/auth.ts. Frontend lint/build pass.
- Compose config validates; existing services start with cached images and volume.
- Live API health/database health: 200. Anonymous employee/department lists: 401.
  Frontend /login: 200. Full authenticated browser/password-change smoke remains due.
- Fresh docker compose up -d --build failed resolving node:24-alpine metadata with
  DeadlineExceeded. Cached-image startup is not proof of a successful fresh build.
- No migrations applied. PostgreSQL test uses temporary tables and ROLLBACK.
