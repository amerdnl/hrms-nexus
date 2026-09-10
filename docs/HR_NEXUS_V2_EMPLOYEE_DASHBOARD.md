# Employee Dashboard V2

Delivered 10 September 2026 against master §40. **No database migration was needed and
none was made**; the ledger is unchanged at `0001-0008` and no business data was
modified.

## What it shows

| Area | Source | Notes |
| --- | --- | --- |
| Today's attendance | `attendance`, matched on the company date | Coarse verification state only |
| Check in / check out | `VerifiedClockPanel`, unchanged | The same verified QR and geolocation flow as the attendance page |
| Leave balance | `getBalances` | The same rule the leave page and reports use |
| Next approved leave | `leave_requests` | Approved, not yet ended, earliest start |
| Pending leave | `leave_requests` | Count of requests awaiting a decision |
| Recent attendance | `attendance` | Seven most recent days |
| Recent leave | `leave_requests` | Five most recent requests |
| Latest payslip | `payroll_records` | Approved and paid periods only |
| Employment summary | `employees`, `departments` | Number, title, department, status, join date |

## Security decisions

**The employee is resolved from the session, never from the request.** The lookup joins
`users` to `employees` on the signed-in user's own id. There is no employee identifier
in the request to substitute, and appending one changes nothing — asserted directly for
`employeeId`, `employee_id`, `id` and `userId`.

**A forged claim is refused, not merely ignored.** `authenticateToken` rebuilds the
session from the database and rejects a token whose `employeeId` claim disagrees with
the stored row, so a token pairing one user with another employee's id gets 401.

**Coordinates cannot reach the dashboard.** The shared `mapAttendanceRow` carries
latitude, longitude, accuracy and distance from the office. The dashboard deliberately
does not use it: these queries name their columns, listed once in `attendanceColumns`,
so widening the exposure takes a deliberate edit and a column added to `attendance`
later cannot leak here by accident. `verificationStatus` — `verified`, `manual` or
`exception` — is the "verification state" master §40 asks for and reveals no position,
no distance and nothing about the QR secret. `verification_method` is not carried.

**Unpublished payroll stays unpublished.** The payslip query reuses the payslip
endpoints' own predicate, `p.status IN ('approved', 'paid')`. Draft, calculated and
reviewed payroll is working material and is never shown to the employee it concerns.

**Money stays exact.** Gross, deductions and net are cast to text in SQL and never
become JavaScript numbers. The client renders them by splitting digits.

**Company-local "today".** The date comes from the Company Settings timezone, the same
source attendance uses to decide which calendar day a clock action belongs to.

## Empty is not the same as unavailable

A section that fails to load is named in an `unavailable` array and rendered as
"unavailable" with a route to the real page. "We could not read your balance" and "you
have no balance" must not look the same, and a failed reload drops the stale payload
rather than presenting it as current.

## Defects found and fixed

- **Today's attendance used `CURRENT_DATE`.** The database server's date, not the
  company's. The admin dashboard had been corrected for this during the reports
  milestone; the employee dashboard had not, so across midnight an employee could be
  told they had not checked in on a day they had.
- **"Upcoming leave" was computed in the browser** from the device clock and a second
  request to `/leaves/me`. The rule is unchanged but now runs on the server against the
  company's date, so it is right for someone travelling.
- **Five queries shared one checked-out client.** `pg` serialises concurrent queries on
  a single connection and warns that the behaviour is removed in pg@9, so the "parallel"
  reads were a sequence. They now go through the pool; only the leave balances take a
  dedicated client, because they open a transaction.
- **`capitalize` title-cased job titles**, rendering "Head of People" as "Head Of
  People". Found by looking at the page, not by a test. It is now opt-in and used only
  for employment status, which really is a lowercase enum.
- **The leave card stacked two empty messages.** Also found by looking at the page.

## Verification

- **375 backend tests pass, 0 fail, 0 skipped**, including 17 new dashboard checks.
  The full run now sets every lab gate, so a skip cannot hide a break.
- Backend typecheck and build pass; frontend build and Oxlint pass.
- Clean `docker compose down` and `up --build` with volumes preserved; source ledger,
  orphan fingerprint, September 2026 draft period and row counts unchanged.
- **30/30 authenticated browser checks** at 1280px and 375px against the isolated demo
  lab, including employee isolation, an administrator refused the employee dashboard,
  an employee refused company-wide reporting, and admin reporting not regressed.
  Evidence in `.local-backups/dashboard-20260910/browser/`.

  Recorded twice, and worth stating why. The first run was unknowingly served by the
  `hr-nexus-demo-browser-*` containers left running from the audit milestone: they
  bind-mount the working tree, so they did serve the new code, but they already held
  ports 5017 and 5189, and the static server started for that run failed to bind with
  EADDRINUSE without it being noticed — the health check was answered by the container
  already there. The frontend under test was therefore the Vite dev server rather than
  the production bundle. The run was repeated on ports confirmed free beforehand,
  serving the built bundle, with the bindings verified before the browser launched.
  Both runs pass identically. The source database was never involved in either: it
  still reports `audit_rows=0`, and one sign-in would have written an entry.

## Limitations

- **No company announcement.** Master §40 lists it as optional ("if available") and
  there is no announcements table; nothing was invented to fill the space.
- **Recent attendance is the last seven records, not the last seven days.** A gap in
  attendance shows as an older date rather than an explicit absence.
- **The seeded demo employee has no leave requests**, so the populated leave card was
  verified by adding rows to the disposable lab database only. Those rows were removed
  and the source database was never involved.
