# Company Import — P0

Status: **implemented and verified** on 9 September 2026, following Employee/Department
Stability. Migration 0004 is applied to source `hr_nexus` with explicit user approval.
172 tests and a 27-check authenticated browser smoke pass.

Migrations 0001–0003, their ledger rows and checksums, existing business data and the
five protected orphan attendance rows are unchanged.

## Scope delivered

Departments, employees and their account/email metadata, per master §11–§15.
Compensation and opening leave balances are **not** included: those tables do not exist
yet and belong to Payroll V1 and Leave Balances. The importer is structured so those
domains slot in when their schemas land, rather than inventing payroll schema early.

## Workflow

```text
Download template → Upload → Map columns → Validate → Preview
  → Confirm (explicit opt-ins) → Transactional import → Summary + credentials
```

Admin UI at `/admin/import`; API under `/api/import`, admin-only behind the existing
router-wide authentication and role check.

| Endpoint | Purpose |
| --- | --- |
| `GET /import/template` | CSV template, canonical headings |
| `GET /import/fields` | Supported fields and which are required |
| `POST /import/jobs` | Upload, parse, suggest a mapping |
| `PUT /import/jobs/:id/mapping` | Confirm mapping, validate, store the preview |
| `GET /import/jobs/:id` | Job status and counts |
| `GET /import/jobs/:id/rows` | Paginated preview rows, filterable by outcome |
| `POST /import/jobs/:id/confirm` | Apply in one transaction |
| `GET /import/jobs` | Import history |

## Reading files

CSV is parsed by an in-repo RFC 4180 reader — quoted fields, doubled quotes, embedded
separators and newlines, CRLF or LF, and a byte order mark — so CSV import carries no
supply chain. XLSX uses **exceljs 4.4.0**, chosen over the smaller `xlsx` package
because that one carries an unfixable high-severity advisory on npm. exceljs's only
advisory is a transitive `uuid` buffer-bounds issue in a code path the import never
calls; it is recorded alongside qs and nanoid as a pre-release item.

Both formats produce the same trimmed-string table, so a spreadsheet and a CSV are
judged by identical rules. Excel dates become calendar days and formula cells
contribute their computed value. Empty, header-only, oversized (>5 MB or >5000 rows)
and corrupt files are refused with a readable message before a job exists.

## Column mapping

Headings are matched to canonical fields through an alias table after case,
punctuation and spacing are normalised, so `Staff-ID`, `Staff ID` and `staff id` all
resolve. Aliases cover the master brief's examples plus common Malaysian HR wording
(`Handphone`, `Next of Kin`, `Date Joined`).

Automatic mapping is a **suggestion**. Unrecognised columns are listed, a field claimed
by two columns is reported as ambiguous rather than guessed at, and the admin's
submitted mapping is validated against the real file — unknown fields, out-of-range
columns, one column mapped twice and missing required fields are all refused.

## Row classification

| Outcome | Meaning | Written? |
| --- | --- | --- |
| `new` | Employee number not present | Yes |
| `update` | Present, and a mapped field differs | Only with `apply_updates` |
| `unchanged` | Present, nothing differs | No |
| `conflict` | Email already belongs to another employee or an administrator | Never |
| `invalid` | Failed validation, or repeats an earlier row | Never |

Checked per row: required fields, lengths against real column widths, control
characters, email and phone format, known department, employment status, and dates.
Dates accept ISO and day-first (`DD/MM/YYYY`); day-first is the documented reading of an
ambiguous slash date and is stated in the template. Employment status accepts common
wording (`Permanent`, `Full Time`, `Intern`, `Dismissed`) mapped onto the supported
lifecycle set. Duplicates within the file point back at the first occurrence.

Updates compare **only mapped columns**, so a file that omits a column never looks like
a request to clear it. Warnings (future employment date, an under-16 date of birth, a
department matched by different casing) annotate a row without blocking it.

## Applying

One transaction. Applying is opt-in twice over:

- **`apply_updates`** — off by default, so a confirmation never quietly rewrites
  existing employees.
- **`create_missing_departments`** — off by default. When set, the departments are
  created first and rows referencing them are then valid, which is why enabling it can
  increase the number of employees imported.

Rows are **re-classified inside the transaction** against live data, so a preview that
has gone stale cannot be applied on its stale terms: an employee created by hand
between preview and confirmation is reclassified rather than attempted as a duplicate
insert. If anything does fail, the whole import rolls back — no partial workforce — and
the job is recorded as `failed` with a readable message.

New accounts follow the same rule as manual creation: activity is derived from
employment status, so an imported `resigned` employee gets no usable sign-in.

## Credentials

**Passwords are not importable.** A credential-looking column is reported as
deliberately ignored and its cells are **blanked at upload**, so a customer's
spreadsheet password never reaches the database or the preview response.

Every new account gets a generated 128-bit password, hashed with bcrypt before the
write loop so hashing never holds row locks. Passwords are returned **once** in the
confirmation response, shown in the UI with a warning and a browser-side CSV download,
and are never stored or logged.

## Migration 0004

File: `backend/migrations/0004_import_jobs.sql`
Checksum: `ef174819b9e0f96c8f9e1bfb438f2f79e7ab742ef3a4bbabf85067d09d8eb92b`

Creates `import_jobs` and `import_job_rows` plus three indexes, behind a fail-closed
preflight that aborts if an import table already exists. Purely additive: no existing
table, column, constraint, sequence or row is modified.

`import_job_rows.employee_id` is **ON DELETE RESTRICT**, so import history can never be
the reason an employee record is destroyed; rows cascade only from their own job.
`initiated_by` is RESTRICT too — who ran an import is not disposable.

Applied 9 September 2026 after the user explicitly approved the checksum, with a backup
taken and restore-verified beforehand. The **only** difference in the source is the
ledger gaining `0004`:

```
users=2  employees=1  departments=1  attendance=5  orphans=5
fingerprint=1:1,3:1,4:2,5:1,6:1
seq_employees=3:true  seq_users=4:true
ledger=0001,0002,0003  ->  ledger=0001,0002,0003,0004
```

Backups and evidence are in `.local-backups/0004-20260909/` (gitignored).

## Verification results

| Check | Result |
| --- | --- |
| Backend type-check, build | Pass |
| Full suite with all lab flags | **172 pass, 0 fail** (was 132) |
| Frontend lint, build | Pass |
| Backend lint | One pre-existing `no-useless-empty-export` warning |
| `docker compose down` then `up --build` | Pass, volumes preserved, data and 0004 intact |
| Authenticated browser smoke | **27/27 pass** |

New tests: `tests/import-parsing.test.ts` (CSV grammar, XLSX round trip, alias mapping,
credential redaction, classification) and `tests/import.integration.test.ts` (18
database-backed checks). The integration suite is gated by `HR_NEXUS_IMPORT_LAB=1`.

Two whole-transaction guarantees are covered explicitly: a concurrent duplicate email
fails one import **entirely**, writing none of its rows, while the other succeeds; and a
stale preview is re-validated at confirmation.

## Authenticated browser smoke

Performed with headless Chromium against an **isolated lab stack** built from a
restore-verified copy of the source with 0004 applied. Source data was not used for
writes. Screenshots and the script are in `.local-backups/0004-20260909/browser/`.

All 27 checks passed, including: sidebar navigation; automatic mapping of
`Staff ID`/`Division`/`Work Email`; a credential column reported as ignored; a removed
required mapping refused; a six-row file classified 3 new / 3 invalid with each reason
shown; missing departments offered but not pre-selected; import creating four employees
once the missing department is created; four temporary passwords shown once with the
one-time warning; import history listing the run; the imported employees appearing in
employee management with `Probation` and `Resigned` preserved; a repeat import
reporting 0 new and 0 updates; a 375-pixel layout with no horizontal scroll; **an
imported employee signing in with their generated temporary password**; and that
employee being denied the import page.

A database-level assertion during that run found a real defect — the ignored password
column was still being persisted in `source_rows`. It is fixed by redaction at upload
and is now covered by both a unit test and an integration assertion.

## Follow-ups, not in this milestone

- Compensation and opening leave balances join the importer once Payroll V1 and Leave
  Balances define their tables.
- Historical attendance and leave import remain P1 per master §11.
- A downloadable error report and batch rollback remain optional post-P0 items (§15).
- A 5000-row import of all-new employees spends several minutes on bcrypt hashing.
  Demo-scale imports are seconds; worth revisiting if large imports become routine.
- exceljs's transitive `uuid` advisory joins qs and nanoid as a recorded release item.
