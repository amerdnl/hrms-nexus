# HR Nexus V2 database status

Migration **0001 is applied** to existing `hr_nexus` with the explicitly approved
SHA-256. No other migration or unrelated schema change was applied.

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
The ledger contains exactly one matching 0001 row. Two narrow triggers prevent
orphan ID adoption/reassignment; the non-updatable exception view exposes all five
exceptions to authorized database operators.

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
`backend/migrations/0002_description.sql` and successive versions. Never edit an
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
