# Employee/Department Stability — P0

Status: **implemented and verified** on 8 September 2026, following Company Settings
completion in `3289c7f`. Migration 0003 is applied to source `hr_nexus` with explicit
user approval. All 132 tests and a 23-check authenticated browser smoke pass.

Migrations 0001 and 0002, their ledger rows and checksums, and the five protected
orphan attendance rows are unchanged.

## Scope delivered

### 1. Lifecycle and linked-account consistency

Account activity is now **derived** from employment status rather than set
independently. `isEmployeeAccountActive()` in `backend/src/utils/employeeValidation.ts`
is the single rule, and it matches the eligibility already enforced by
`findSessionUserById`: `active` and `probation` keep a usable sign-in;
`inactive`, `resigned` and `terminated` do not.

- Create no longer forces `is_active = TRUE`. An employee created as inactive,
  resigned or terminated gets a correspondingly disabled account.
- Update applies status and account activity in one transaction. Reactivating a
  deactivated employee through **Edit** now re-enables their sign-in; previously
  only the dedicated deactivate/reactivate paths kept the two in step.
- Every lifecycle path (`PUT`, `DELETE`, `PATCH .../reactivate`) locks the employee
  row and then its linked account with `SELECT ... FOR UPDATE`, in that fixed order,
  so competing edit/deactivate/reactivate requests serialize instead of interleaving
  into a mismatched state.
- Supported statuses are `active`, `probation`, `inactive`, `resigned`, `terminated`,
  matching the master brief. The list filter and both forms offer all five.

Role authorization, history retention and the retired permanent-delete 409 are
unchanged.

### 2. Validation and email identity

`employeeValidation.ts` replaces truthiness checks with an explicit contract:

- Bounded field allowlists. Unknown fields return 400 and name themselves rather
  than succeeding while being ignored. `employee_number` and passwords are not in
  the update allowlist, so neither can be changed through Edit.
- Required vs optional semantics. Optional fields that are **absent** are left
  unchanged; `null` or `""` is the explicit clear. A partial client can no longer
  silently wipe a field it never displayed.
- Types, lengths and formats bounded to the real column widths; control characters
  rejected; real calendar dates only (`2026-02-31` is refused) within sane ranges.
- Passwords are capped at 72 bytes because bcrypt ignores anything beyond that —
  a longer value would not be the password actually verified at sign-in.
- Route identifiers must be positive integers, so a malformed `:id` returns 400
  instead of reaching SQL and producing a 500.

**Email identity is case- and whitespace-insensitive.** Duplicate checks use
`lower(btrim(email))`, matching migration 0003's unique index, and the update check
now excludes the employee's own **linked account ID** rather than comparing
`employee_id`, which silently skipped standalone admin accounts with a NULL link.
`findUserRecordByEmail` was aligned to the same expression so sign-in resolves an
account by exactly the identity the database enforces. No stored email value is
rewritten.

Both `users_email_normalized_key` and the pre-existing `users_email_key` are mapped
to a 409 conflict, so a lost race returns the same predictable response as the
pre-check.

### 3. Safe transaction and department failures

- Connections are acquired inside `try`, and a connection failure returns 503
  instead of throwing past the handler.
- Rollback is isolated so a cleanup failure cannot mask the original error.
- Department writes validate types before any string method runs; non-string input
  is a 400, not a 500.
- Department deletion is a single conditional `DELETE ... WHERE NOT EXISTS`, and a
  concurrent assignment that trips the foreign key is mapped to the same 409 as the
  membership check. Assigned employees and their history are never removed, and FK
  enforcement is unchanged.

### 4. Server pagination and lookup contracts

The employee list is bounded server-side, and the consumers that need complete sets
were migrated with it rather than being silently truncated:

| Consumer | Before | Now |
| --- | --- | --- |
| `EmployeeListPage` | Fetched every employee, sliced 25 per page in the browser | `GET /employees?page=&page_size=` with server totals |
| Job title filter | Derived from the loaded rows only | `GET /employees/job-titles`, covering every employee |
| `DepartmentListPage` headcount | Counted a full employee download client-side | Aggregated in SQL on `GET /departments` |
| `AdminAttendancePage` directory | Full employee records | `GET /employees/lookup`, minimal columns, never paginated |
| `DepartmentDetailsPage` membership | Full membership | Unchanged and still complete |

`GET /employees` gained a `pagination` object and search now covers email; pagination
is **opt-in**, so a caller that sends no page parameters still receives a complete
list and the response shape stays backward compatible. `/lookup` and `/job-titles`
are registered before `/:id` so those names are not captured as identifiers. All
endpoints remain admin-only behind the existing router-wide authorization.

The list handles stale searches with a request-sequence guard, resets to page 1
atomically with each filter change, and steps back when the current page falls past
the end of a narrowed result set.

### 5. Form parity

Create and edit now agree with each other and with the server contract: department
is required in both, all five statuses are offered, the edit form prefills the
current email and covers date of birth, gender and employment date, and cleared
fields are sent as `null` so clearing is explicit. Existing shared UI components,
validation feedback and confirmation dialogs are preserved.

## Migration 0003 — normalized email identity

File: `backend/migrations/0003_user_email_normalized_identity.sql`
Checksum: `1014b30d8737546814d0a1199ae653bb92e669a1ccdc190c4890f18fbe3a8b1b`

```sql
CREATE UNIQUE INDEX users_email_normalized_key ON public.users (lower(btrim(email)));
```

The file wraps that statement in a `SHARE` lock and a fail-closed preflight that
rejects an unexpected column type, a nullable `email`, an index that already exists,
or any pre-existing collision — raising a reviewable message instead of a bare
23505. It is additive: no email value is rewritten, no row, sequence or other
constraint changes, and `users_email_key` remains in place.

### Verification before application

- Read-only source checks: 0 normalized collision groups, 0 emails with surrounding
  whitespace, 0 non-lowercase emails, 0 lifecycle mismatches.
- A fresh logical backup was taken and **proven restorable** into the isolated lab;
  the restored copy matched the source exactly on rows, orphans, attendance
  fingerprint, ledger and sequence state.
- 0003 was applied through the real checksummed runner on that isolated copy.
- Concurrency: two transactions writing the same normalized identity — the second
  blocks while the first is open, then fails 23505 on commit. Case, whitespace and
  exact duplicates are all rejected; a genuinely different address is accepted;
  stored casing is preserved verbatim.
- Fail-closed behaviour was proven on a separate copy seeded with a real collision:
  the migration aborts, leaving no index, no ledger row and both accounts untouched.

### Application to source

Applied 8 September 2026 after the user explicitly approved the checksum above,
with a second backup taken and restore-verified immediately beforehand.

The **only** difference in the source before and after is the ledger gaining `0003`:

```
users=2  employees=1  departments=1  attendance=5  leave=0  orphans=5
fingerprint=1:1,3:1,4:2,5:1,6:1
collisions=0
seq_employees=3:true  seq_users=4:true  seq_attendance=6:true
ledger=0001,0002  ->  ledger=0001,0002,0003
```

0001 (`3339156f…`) and 0002 (`0ac942c9…`) checksums are unchanged in the ledger.
Enforcement was then confirmed on the source itself using explicit IDs inside a
rolled-back transaction, so no row was written and `users_id_seq` was not consumed.

Backups, the apply log and browser evidence are in `.local-backups/0003-20260908/`
(gitignored).

## Verification results

| Check | Result |
| --- | --- |
| Backend type-check (`tsc` + tests project) | Pass |
| Backend build | Pass |
| Backend tests, no database | 85 pass, 4 database suites skipped |
| Full suite with all lab flags | **132 pass, 0 fail** (was 98) |
| Frontend lint (Oxlint) | Clean |
| Frontend build | Pass |
| Backend lint (Oxlint) | One pre-existing `no-useless-empty-export` warning |
| `docker compose down` then `up --build` | Pass, volumes preserved, data and 0003 intact |
| Authenticated browser smoke | **23/23 pass** |

New tests: `tests/employee-validation.test.ts` (contract unit tests) and
`tests/employee-stability.integration.test.ts` (18 database-backed checks covering
0003, lifecycle/account consistency, duplicate email including the standalone-admin
case, concurrency, rollback, history retention, department conflicts, headcounts,
pagination and the lookup consumers). `tests/company-settings.integration.test.ts`
was updated so its assertions tolerate a growing migration chain, and the
authorization mock now recognises the aggregate department query.

## Authenticated browser smoke

Performed with headless Chromium against an **isolated lab stack** (its own backend
and frontend containers on the internal lab network, pointed at a synthetic clone of
the post-0003 source). Source settings and source data were not used for writes.
Screenshots and the script are in `.local-backups/0003-20260908/browser/`.

All 23 checks passed, including: sign-in with a case-different email; a bounded
25-row first page with a server total of 33 and a working second page; email search;
all five statuses selectable and server-filtered; job title options covering every
employee; create refused without a department then succeeding; a case-different
duplicate email refused with "Email already exists"; the edit form prefilling email;
department headcounts; occupied-department deletion refused; the attendance page
resolving names through the lookup; a 375-pixel layout with no horizontal scroll;
and an employee account denied the admin employee route.

Database verification after the browser run confirmed the reported gap is closed:
`LAB-005` moved from `resigned` with a disabled account to `active` with an enabled
account **through the Edit form**, the browser-created probation employee received an
enabled account, and no duplicate accounts exist.

## Operational note — test laboratory

During this milestone the retained lab container exhausted its 512 MB tmpfs and
crashed; because that storage is RAM-backed, its databases were lost. The **source
database was never at risk** — it is a separate container on a real Docker volume,
and it was verified intact immediately afterwards.

The lab was recreated with a 3 GB tmpfs on the same network and alias, and both
documented baselines were rebuilt from retained backups: `hr_nexus_v2_upgrade`
(unmigrated) and `hr_nexus_v2_settings_baseline` (0001 applied, 0002 pending), both
restored from `.local-backups/0001-20260908/`. The full suite passes against the
rebuilt lab. Stale per-run clones from earlier milestones were dropped with the
user's approval to free space.

## Follow-ups, not in this milestone

- `employment_status` still has **no database CHECK constraint**. It is enforced in
  application validation only. Adding one is an additive but materially different
  migration and needs its own review and approval.
- Existing `users_email_key` remains case-sensitive alongside the new normalized
  index. Both are enforced; neither was dropped.
- The leave filtered-empty-message issue remains in the regression/polish backlog.
- qs and nanoid advisories remain recorded and deliberately not upgraded.

Company import is the next P0. It has not begun.
