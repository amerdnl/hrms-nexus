# HR Nexus V2 implementation plan

Master specification: `../HR_NEXUS_V2_MASTER.md` (read in full).
Feature complete: 10 September 2026. Validation/polish: 11–15 September.
Leadership demo: 16 September. Working branch: `feat/hr-nexus-v2`.
Use High for routine work. Recommend Extra High before complex migrations, payroll
money logic, difficult authorization/concurrency work, or complex import upserts.

## Milestone status — 8 September 2026

| Order | P0 milestone | Status / acceptance |
| --- | --- | --- |
| 1 | Focused repository audit and immediate API authorization | Implemented and tested; clean Docker rebuild passed; browser auth smoke blocked on browser connection |
| 2 | Migration strategy and employee history retention | 0001 applied with approved checksum; preservation/behavior checks and clean rebuild passed; browser gate remains open |
| 3 | Company settings | Not started; validated admin API/UI, timezone/work hours/location/radius |
| 4 | Employee/department stability | Not started; lifecycle consistency, robust validation, email uniqueness, server pagination |
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
remain untouched and untracked. Fresh Docker rebuild and full browser auth smoke
remain outstanding; the cached-image application is running.

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

Clean no-cache Docker build, volume-preserving down/up, 64 tests on the new image,
source/test typechecks, builds and lint passed (one existing backend lint warning).
The authenticated browser gate remains blocked: runtime discovery returned no
available browser. The user was asked to enable the browser and sign in. **Company
Settings must wait for that gate; no settings implementation or migration has begun.**

## Remaining blockers / release gates

- Migration 0001 source application and verification are complete; approval covered no other migration.
- Orphan ownership is unresolved by design. No fabricated employee, ownership
  reassignment, record deletion, seed replay, volume reset or destructive cleanup.
- Clean Docker rebuild/restart passed after retry; no Docker credential settings changed.
  Fresh npm audit reports qs (moderate) and nanoid (high); record and resolve before release.
- Full authenticated browser smoke remains open because no browser is connected;
  isolated API lifecycle verification does not replace it. No saved/seeded credentials used.
- Company settings remains the next P0 milestone after authenticated browser verification.

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

The DB test creates only session-local temporary tables and rolls back; it does not
modify public employee/user records. Final demo verification must include a normal
`docker compose down` followed by `docker compose up --build`, preserving volumes.

Migration status/apply commands and isolated rehearsal instructions are documented
in `HR_NEXUS_V2_DATABASE.md`. The runner is never attached to application startup.
