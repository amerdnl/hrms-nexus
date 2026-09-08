# HR Nexus V2 implementation plan

Master specification: `../HR_NEXUS_V2_MASTER.md` (read in full).
Feature complete: 10 September 2026. Validation/polish: 11–15 September.
Leadership demo: 16 September. Working branch: `feat/hr-nexus-v2`.
Use High for routine work. Recommend Extra High before complex migrations, payroll
money logic, difficult authorization/concurrency work, or complex import upserts.

## Milestone status — 8 September 2026

| Order | P0 milestone | Status / acceptance |
| --- | --- | --- |
| 1 | Focused repository audit and immediate API authorization | Complete; clean Docker rebuild passed and user accepted authenticated browser smoke |
| 2 | Migration strategy and employee history retention | Complete; migration receipt and browser gate explicitly accepted by user |
| 3 | Company settings | Complete; 0002 applied, 98 tests passed, authenticated browser smoke passed on 8 September 2026 |
| 4 | Employee/department stability | Complete; 0003 applied, 132 tests passed, 23/23 authenticated browser smoke on 8 September 2026 |
| 5 | Company import | Not started; CSV/XLSX → mapping → validation → preview → explicit update confirmation → transaction → history |
| 6 | Attendance verification | Not started; expiring backend QR + radius + official time + verification metadata |
| 7 | Leave balances/validation | Not started; working days, overlap/balance checks, atomic approval and no double deduction |
| 8 | Payroll and payslips | Not started; recommend Extra High before money/state/snapshot implementation |
| 9 | Reports/export and dashboards | Not started; extend existing database-backed dashboards and add CSV exports |
| 10 | Audit and demo data | Not started; safe audit metadata, 20+ fictional employees, complete demo flow |

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
Employee/Department Stability is complete; Company Import is now the active P0.

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
- The test laboratory exhausted its 512 MB tmpfs during this milestone and crashed,
  losing its RAM-backed databases. The source database was unaffected and verified
  intact. The lab was recreated with a 3 GB tmpfs and both documented baselines were
  rebuilt from retained backups; the full suite passes against it.
- Active P0: company import; employee/department stability is complete.

## Regression / polish backlog

- Minor, nonblocking: when the leave list is empty after filtering, its empty-state
  message incorrectly implies requests exist. Show a filter-specific no-results
  message; distinguish it from having no requests at all. Record for regression/polish,
  without blocking Company Settings.

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

The employee/department stability database suite is gated by `HR_NEXUS_EMPLOYEE_LAB=1`
and runs only against the isolated lab, alongside the other lab suites:

```sh
docker run --rm --volumes-from hr-nexus-backend:ro \
  --network hr-nexus-v2-migration-lab \
  -e HR_NEXUS_MIGRATION_LAB=1 -e HR_NEXUS_SETTINGS_LAB=1 \
  -e HR_NEXUS_EMPLOYEE_LAB=1 -e HR_NEXUS_DB_TESTS=1 \
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
