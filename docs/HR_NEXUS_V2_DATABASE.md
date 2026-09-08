# HR Nexus V2 database status

The existing `hr_nexus` database remains unchanged. Migration 0001 is implemented,
rehearsed on isolated databases and **awaiting explicit source-application approval**.

- [Exact migration design, SQL checksum, impact and rollback](HR_NEXUS_V2_MIGRATION_DESIGN.md)
- [Verification evidence](HR_NEXUS_V2_MIGRATION_EVIDENCE.md)
- [Proposed SQL](../backend/migrations/0001_employee_history_retention.sql)
- [Read-only verification SQL](sql/verify_history_retention.sql)
- [Review-only legacy rollback SQL](sql/rollback_0001_legacy.sql)

Live baseline: PostgreSQL 17.10; departments/employees/users/leave_requests use
INTEGER entity IDs; attendance uses BIGINT. Users and leave requests cascade from
employees. Attendance has no employee FK and has five orphan rows (IDs 1,3,4,5,6)
referencing missing employee IDs 1 and 2. The existing employee has ID 3. All rows,
IDs, timestamps, notes, sequences, constraints and column defaults are preserved
in the source. No migration ledger or exception view has been created there.

Fresh schema.sql has a different BIGINT baseline and a cascading attendance FK.
Neither initialization script nor seed.sql was modified or replayed. The proposed
migration supports both shapes and never widens legacy identifiers.

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

The isolated rehearsal is reproducible from the repository root:

```sh
./scripts/rehearse-migrations.sh
```

It requires running source postgres/backend services and their cached images. It
creates a separate internal lab, copies the source logically without printing data,
initializes fresh test schemas without seeds, and leaves the lab for inspection.
It never runs migration apply against the source. Details and limits are in the design.
