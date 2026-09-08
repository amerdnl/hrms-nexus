# HR Nexus V2 database status

Migrations **0001, 0002 and 0003 are applied** to existing `hr_nexus` through the
reviewed runner. The original retention migration is unchanged. The only added
persistent objects are the Company Settings table with its neutral singleton row and
one unique index enforcing normalized account email identity.

Migration 0003 creates `users_email_normalized_key` on `lower(btrim(email))` behind a
fail-closed preflight. It rewrites no email value and changes no row, sequence or
other constraint; the pre-existing case-sensitive `users_email_key` remains. The
application's duplicate checks and sign-in lookup use the same expression, so the
database and the API agree on what counts as the same account. A violation of either
index is mapped to a 409 conflict.

- [Employee/department stability, migration 0003 and evidence](HR_NEXUS_V2_EMPLOYEE_STABILITY.md)
- [Company Settings migration, API/UI and verification](HR_NEXUS_V2_COMPANY_SETTINGS.md)

- [Application receipt, backup and release checks](HR_NEXUS_V2_MIGRATION_APPLICATION.md)
- [Reviewed design, SQL checksum, impact and rollback](HR_NEXUS_V2_MIGRATION_DESIGN.md)
- [Isolated rehearsal evidence](HR_NEXUS_V2_MIGRATION_EVIDENCE.md)
- [Immutable applied SQL](../backend/migrations/0001_employee_history_retention.sql)
- [Read-only verification SQL](sql/verify_history_retention.sql)
- [Review-only legacy rollback SQL, not authorized for source](sql/rollback_0001_legacy.sql)

Live PostgreSQL 17.10 retains INTEGER IDs for departments/employees/users/leave and
BIGINT attendance IDs. All five business-table counts/fingerprints and full sequence
state are unchanged. Users/leave employee FKs are validated RESTRICT; attendance's
RESTRICT FK remains NOT VALID. Five unchanged orphan rows (IDs 1,3,4,5,6) still
reference missing employee IDs 1 and 2. The sole existing employee remains ID 3.
The ledger contains exactly one matching row each for 0001, 0002 and 0003. Two narrow
triggers prevent orphan ID adoption/reassignment; the non-updatable exception view
exposes all five exceptions to authorized database operators.

Applying 0003 changed nothing in the source but the ledger row: business counts,
the attendance fingerprint `1:1,3:1,4:2,5:1,6:1`, all sequence state and the
0001/0002 checksums are identical before and after. Employment status still has no
database CHECK constraint; it is enforced in application validation only, and adding
one would be a separate migration requiring its own review.

Fresh schema.sql retains its different BIGINT baseline. Initialization scripts and
seed.sql were neither modified nor replayed. The approved migration supports both
shapes without widening legacy identifiers. A current logical backup was successfully
restored into an isolated lab before source application.

## Migration commands

From backend, with an explicitly supplied MIGRATION_DATABASE_URL:

```sh
npm run migrate:status -- --database exact_database_name
```

After target-specific approval only:

```sh
npm run migrate:apply -- --database exact_database_name
```

Status has no persistent writes. Apply requires the connected database name to match
and uses checksums, an advisory lock and one transaction per migration. Migrations
are never run automatically at application startup. New files belong in
`backend/migrations/0003_description.sql` and successive versions. Never edit an
applied migration, reset a volume, or use seed.sql as an upgrade script.

The original pre-application rehearsal command is shown below. It expects an
unmigrated source baseline; after 0001, use the retained unmigrated lab baseline or
restore the verified pre-0001 backup into a separate lab for these upgrade tests.
Do not revert the source or replay seeds to recreate that baseline.

```sh
./scripts/rehearse-migrations.sh
```

It requires running source postgres/backend services and their cached images. It
creates a separate internal lab, copies the source logically without printing data,
initializes fresh test schemas without seeds, and leaves the lab for inspection.
It never runs migration apply against the source. Details and limits are in the design.

## Settings test laboratory

The Company Settings suite uses `HR_NEXUS_SETTINGS_LAB=1` and the fixed internal
host `hr-nexus-v2-migration-lab`. It clones the retained database
`hr_nexus_v2_settings_baseline`, captured with 0001 applied and 0002 pending, into
randomly named isolated databases. The original retention tests use the separate
unmigrated `hr_nexus_v2_upgrade` baseline and copy only immutable 0001 into a test
migration directory. Do not reset the source or edit applied files to prepare tests.

The employee/department stability suite uses `HR_NEXUS_EMPLOYEE_LAB=1` and the same
settings baseline, running the full migration chain into its own disposable clones.
Add that flag to the command below to run every suite.

The laboratory's storage is a tmpfs, so **its databases do not survive the container
stopping**, and it will crash if that tmpfs fills. It is now created with 3 GB; drop
stale per-run clones rather than letting it fill. Both baselines are reconstructible
from the retained backups in `.local-backups/0001-20260908/`:
`hr_nexus_before_0001.dump` rebuilds `hr_nexus_v2_upgrade`, and
`hr_nexus_after_0001.dump` rebuilds `hr_nexus_v2_settings_baseline`. The source
database is a separate container on a real Docker volume and is never affected.

The full verified command (using the retained lab network) is:

```sh
docker run --rm --volumes-from hr-nexus-backend:ro \
  --network hr-nexus-v2-migration-lab \
  -e HR_NEXUS_MIGRATION_LAB=1 -e HR_NEXUS_SETTINGS_LAB=1 -e HR_NEXUS_DB_TESTS=1 \
  -e DATABASE_URL=postgresql://postgres@hr-nexus-v2-migration-lab/postgres \
  --mount "type=bind,src=$PWD/database,dst=/database,readonly" \
  --mount "type=bind,src=$PWD/docs,dst=/docs,readonly" \
  hr-nexus-backend sh -c 'node --import tsx --test tests/*.test.ts'
```

The lab is isolated, has no published host port and uses no source credentials.
Normal `npm test` runs non-DB tests; the optional database suites are explicitly skipped
unless enabled. The existing initialization and seeds remain unchanged. Fresh empty
schema plus the complete migration chain is tested without seeds.
