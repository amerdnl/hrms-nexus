# HR Nexus V2 implementation plan

Master specification: `../HR_NEXUS_V2_MASTER.md` (read in full).
Feature complete: 10 September 2026. Validation/polish: 11–15 September.
Leadership demo: 16 September. Working branch: `feat/hr-nexus-v2`.
Use High for routine work. Recommend Extra High before complex migrations, payroll
money logic, difficult authorization/concurrency work, or complex import upserts.

## Milestone status — 8 September 2026

| Order | P0 milestone | Status / acceptance |
| --- | --- | --- |
| 1 | Focused repository audit and immediate API authorization | Implemented and tested; clean Docker rebuild and full browser auth smoke still outstanding |
| 2 | Migration strategy and employee history retention | Next; live schema drift and five orphan attendance records require careful reconciliation |
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

## Next concrete migration/retention proposal

Recommend Extra High before implementation because the live schema already differs
from the fresh initialization scripts and contains historical orphan records.

1. Add a versioned SQL migration runner using existing pg, a migration history table,
   checksums, a PostgreSQL advisory lock, one transaction per migration, and explicit
   apply/status commands. No automatic volume reset, seed replay, or destructive down.
2. Preserve existing INTEGER IDs; do not rewrite them merely to match BIGINT in the
   fresh schema. New references must be compatible with both supported shapes.
3. User approved retirement of permanent deletion. Implemented: admin requests
   receive 409 directing deactivation; UI action and unused client method removed.
   Deactivation/reactivation and history preservation passed isolated API tests.
4. Preserve all five orphan attendance rows and their existing employee IDs. Do not
   fabricate replacement employees, delete history, or silently remap ownership.
   Proposed approach: enforce a new non-cascading attendance FK for future writes
   using NOT VALID, and expose existing exceptions for later reviewed reconciliation.
   Validate only once ownership is established. Check this approach in Extra High.
5. Replace history-erasing FK behavior through a separately reviewed migration;
   verify old-volume upgrade, fresh database, repeat apply, rollback on failure and
   concurrent runner protection on an isolated database before applying locally.
6. Proceed to company settings once the upgrade path is proven.

## Remaining blockers / gates

- Fresh Docker build: node:24-alpine metadata lookup timed out. Existing stack runs
  from cached images. Do not change Docker credential settings without permission.
- Permanent deletion retirement is approved and implemented. All persistent changes
  to the existing database still require a separate review and approval.
- Migration reconciliation warrants Extra High; no destructive cleanup authorized.
- Full authenticated browser smoke needs an authorized test account/session; do not
  read saved credentials or use seeded passwords without permission.

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
