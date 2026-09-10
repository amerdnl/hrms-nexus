# Company Data Export and XLSX Export

Delivered 10 September 2026 against master §42. **No database migration was needed and
none was made**; the ledger is unchanged at `0001-0008`.

`audit_events.action` and `entity_type` carry no CHECK constraint — only `outcome` and
the 8 KB `changes` bound do — so the new `DATA_EXPORTED` action and `export` entity type
are a code change alone. Both fit their columns (`VARCHAR(60)` and `VARCHAR(40)`).

## What is exported

Fifteen datasets, each available as CSV on its own or as one sheet of a single XLSX
workbook.

| Dataset | Contents |
| --- | --- |
| Employees | Every personnel record, including inactive and former employees |
| Departments | Departments and their current headcount |
| Company settings | Company profile and attendance rules |
| User accounts | Who can sign in, and in what role |
| Attendance | Records with their verification state |
| Leave requests | Every request and its outcome, working days as snapshotted |
| Leave entitlements | The stored grant per employee, year and type |
| Leave balances | Derived for the current leave year |
| Leave policies | The rules needed to interpret the balances |
| Compensation | Salary history |
| Payroll periods | Each period and how far through the process it reached |
| Payroll records | One row per employee per period, as issued |
| Payroll line items | The earnings and deductions behind each record |
| Audit events | The append-only administrative history |
| Import history | What was imported and when |

## What is never exported, and why

| Excluded | Reason |
| --- | --- |
| `users.password_hash` | A credential, in any form |
| `attendance_qr_challenges` | Token hashes — the QR secret's whole point |
| `attendance_qr_uses` | Verification internals with no HR meaning |
| Attendance latitude, longitude, accuracy, distance | Describes where a person physically was |
| `company_settings` office latitude and longitude | The geofence's position, same reasoning |
| `import_jobs.source_rows`, `source_headers`, `column_mapping` | The uploaded content; a workforce upload can carry a temporary password |
| `import_job_rows` entirely | Holds `row_data`, the same raw content per row |
| `schema_migrations` | File checksums; internal, not company data |
| `employees.profile_image` | An internal storage path, useless without the file |

The attendance radius **is** exported. It is a rule, not a place.

`user-accounts` exists precisely so that account existence, address and role — real HR
facts — can be exported without the credential. `users` itself is not an addressable
dataset key.

## Security

**Administrator-only, applied to the router** rather than per route, so a route added
later cannot be published without the guard. A download is never a weaker door than the
API the same data flows through — asserted directly by comparing the status of the
listing route and the workbook route for the same employee token.

**No target identifier.** A company export is the whole company. The dataset key indexes
a fixed map, so there is no table name to smuggle in; `users`, `audit_events` and a path
traversal are all simply not found.

**The audit log stays read-only.** The export reads it and never writes to it; the
database trigger still refuses UPDATE and DELETE, which is asserted in the suite.

**Every export is recorded**, naming the datasets, the format and the row counts. The
exported content is never stored — that would put a second copy of every salary in the
audit table. A refused export records nothing.

**The only write is that audit entry.** A fingerprint over eight tables is identical
before and after exporting every dataset and the whole workbook.

## Formula injection

The rule lives in `csv.ts` and is imported by `xlsx.ts` rather than restated, so the two
formats cannot disagree about what is dangerous. Neutralisation happens **before** RFC
4180 quoting, because a spreadsheet evaluates a quoted field once the parser strips the
quotes.

A workbook string cell is not re-parsed as a formula by Excel, so the XLSX risk is less
acute — but the same file is routinely re-saved as CSV, and other readers are less
careful, so the same rule applies. No cell is ever assigned a formula object: the
downloaded workbook was checked to contain **zero** formula cells.

A leading `-` is left alone when the value is simply a negative number, so `-272.73`
stays a number and every payroll deduction does not become text.

## Money

Amounts are rendered by `formatSenExact` from integer sen via BigInt, and written as
**text**. They are never converted to a JavaScript number: `1234567 / 100` is not exactly
representable in IEEE-754, and a payroll file must not round. Safe integers — ids, counts,
days — are written as numeric cells, which is exact by definition and keeps them sortable.

The suite reads every exported amount back against the stored sen, including `1234567`,
and asserts gross minus deductions equals net to the sen.

## Limits

Two ceilings, both refusing rather than truncating: 10,000 rows per dataset (the existing
report limit) and 100,000 rows per workbook. The second is necessary because fifteen
sheets can each be under the first and still be too large together. A silently short
export is worse than a clear refusal, because the reader cannot tell rows are missing.

## Verification

- **409 backend tests pass, 0 fail, 0 skipped**, including 13 new workbook unit checks
  and 21 new integration checks.
- The lab fixture is deliberately hostile: an employee named `=cmd|' /C calc'!A0`, a
  department description that is a HYPERLINK formula, bcrypt-shaped hashes on the user
  rows, attendance carrying coordinates, and an import job whose `source_rows` hold a
  plaintext temporary password. Each is asserted absent or neutralised in all fifteen
  CSVs and in the workbook.
- Backend typecheck and build pass; frontend build and Oxlint pass.
- Clean `docker compose down` and `up --build` with volumes preserved.
- **28/28 authenticated admin browser checks** at 1280px and 375px, including real
  downloads through the browser.
- The downloaded workbook was then opened and checked as a user would: 15 sheets in the
  declared order, all visible, zero formula cells, 243 money cells all exact text, no
  credential material, no location data. Evidence in
  `.local-backups/export-20260910/browser/`.

## Limitations

- **XLSX bytes are not byte-identical between runs.** A workbook records its creation
  time, so two exports of unchanged data differ in those bytes. Cell content is
  identical, and that is what the suite asserts. CSV exports *are* byte-identical.
- **Money is text, not a numeric cell.** A spreadsheet will not sum a column without a
  conversion. This is the deliberate cost of never rounding; the integer sen is not
  offered as a second column, which would double the width of the payroll sheets.
- **Leave balances are for the current leave year only.** Entitlements, which are the
  stored data, carry every year.
- **The export is a snapshot, not a backup.** It cannot be loaded back in; Company Import
  covers employees only.
