# HR Nexus V2 migration 0001 — approval package

Status: **implemented and tested only in isolated databases; not applied to `hr_nexus`.**
Prepared 8 September 2026. The user approved permanent-delete retirement and isolated
migration development. Applying any persistent migration to the existing database
requires a separate approval after reviewing this package.

## Exact proposed change

SQL: [0001_employee_history_retention.sql](../backend/migrations/0001_employee_history_retention.sql).
SHA-256 of the exact file:

```text
3339156f7143d1ff5a12ebd3b71ca91f21d1c1c6775e4c602fccce1d8c787e39
```

| Object | Proposed effect in the existing database |
| --- | --- |
| public.schema_migrations | Create version/filename/SHA-256/applied_at ledger; insert exactly one row for 0001, in the same transaction as the SQL |
| users_employee_id_fkey | Replace ON DELETE CASCADE with ON DELETE RESTRICT / ON UPDATE RESTRICT; remains validated |
| leave_requests_employee_id_fkey | Same replacement; remains validated |
| attendance_employee_id_fkey | Add BIGINT attendance.employee_id → existing INTEGER employees.id, RESTRICT for delete/update, NOT VALID |
| prevent_orphan_employee_id_reuse() and its trigger on employees | Reject a new or changed employee ID that would adopt orphan attendance; allow existing legitimate IDs/upserts and normal sequence-generated IDs |
| prevent_orphan_attendance_reassignment() and its trigger on attendance | Reject changing an unresolved orphan's employee_id until reviewed reconciliation; preserve ordinary non-key attendance corrections |
| attendance_integrity_exceptions | Create a non-updatable view listing complete unresolved rows plus integrity_issue; revoke PUBLIC access |

No business-table INSERT, UPDATE or DELETE occurs. No identifier/column type/default,
sequence, employee ownership, seed data or authentication architecture changes.
No employee is fabricated. Existing INTEGER IDs remain INTEGER; the fresh BIGINT
baseline is also supported without rewriting either shape. Department and reviewer
foreign keys, all other checks/indexes, and existing functionality remain unchanged.
The standalone migration runner is not called from app startup or Compose startup.

## What was inspected

The live server is PostgreSQL 17.10. All table columns/defaults/nullability, foreign
keys, validation flags, checks, indexes, sequence values and user-defined triggers
were inspected. There are no user-defined triggers in the source baseline.

| Table | Rows | ID/reference shape |
| --- | --- | --- |
| departments | 1 | INTEGER id |
| employees | 1 | INTEGER id/department_id; sole current id is 3 |
| users | 2 | INTEGER id/employee_id; employee FK cascades |
| leave_requests | 0 | INTEGER id/employee_id/reviewed_by; employee FK cascades |
| attendance | 5 | BIGINT id/employee_id; no employee FK |

The complete five orphan rows were read, including all timestamps and admin notes.
The approval table below omits free-text notes; full-row fingerprints in the evidence
include those notes and timestamps and prove their preservation.

| Attendance id | Original employee_id | Date | In | Out | Status | Manual |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 1 | 2026-08-12 | 02:04:52 | 02:05:02 | present | false |
| 3 | 1 | 2026-08-13 | 02:56:00 | 03:09:00 | late | true |
| 4 | 2 | 2026-08-12 | 03:26:00 | 03:36:00 | late | true |
| 5 | 1 | 2026-08-14 | 09:00:00 | 18:00:00 | present | true |
| 6 | 1 | 2026-08-15 | 01:04:00 | 13:04:00 | present | true |

Sequence last values: departments 3, employees 3, users 4, leave_requests 11,
attendance 6. Values and types are unchanged by migration. Employee IDs 1 and 2
must not be reused as a shortcut to resolving missing ownership.

Initialization inspection:

- `database/schema.sql`: fresh schema uses BIGINT for most entities and a cascading
  attendance FK. This file is unchanged.
- `database/modules/attendance.sql`: standalone attendance definition lacks an
  employee FK. It is unchanged; the cause of historical schema drift is not proven.
- The PostgreSQL image entrypoint processes root-level initialization files and
  ignores the modules directory; it does not recursively run module SQL.
- `database/seed.sql`: upserts department/employee data and inserts accounts; it is
  inappropriate for upgrades. Its structure was inspected with credentials masked.
  It was neither changed nor executed in this work.
- The existing volume is reused on normal startup; initialization SQL is not an
  upgrade mechanism. The runner's SQL lives in `backend/migrations`, outside the
  automatic database initialization directory.

## NOT VALID behavior, tested rather than assumed

NOT VALID skips the initial foreign-key validation scan but installs enforcement for
new references. RESTRICT prevents deletion or key changes of referenced employees;
the constraint remains immediate. These choices follow PostgreSQL's
[ALTER TABLE](https://www.postgresql.org/docs/17/sql-altertable.html) and
[constraint documentation](https://www.postgresql.org/docs/17/ddl-constraints.html).

The isolated copy demonstrated all of the following:

- An insert referring to a missing employee and a valid row updated to a missing
  employee both fail with SQLSTATE 23503.
- The original five exceptions survive unchanged; explicit VALIDATE fails 23503.
  The migration therefore leaves attendance's convalidated=false on this copy.
- A pre-existing orphan's non-key correction can succeed when the key stays the
  same. NOT VALID is not an exception freeze. A row created earlier in the same
  transaction can still be rechecked; the first fixture exposed this distinction,
  and the final test uses committed historical rows matching the real upgrade.
- Inserting the missing parent ID is allowed by a foreign key alone and would make
  old orphan history appear linked. Likewise, assigning an orphan to an existing
  employee can satisfy a foreign key. The two proposed guards prevent these paths
  with 23514 while retaining valid employee upserts and non-key corrections.
- A fresh empty baseline has no exceptions; the migration validates the attendance
  FK there. It does not assert that the source's unresolved history is valid.

The view uses a join so PostgreSQL marks it non-updatable. It is for authorized
operators, with no new public API. `migrate:status` reports orphan IDs, original
employee IDs and dates even before the view exists, and reports the FK validation
state after migration. It deliberately omits notes and personal account fields.

This does not make history tamper-proof against the database owner/superuser, which
can disable triggers or issue direct destructive SQL. No such commands are used by
the application or the migration. General database privilege hardening and a future
reviewed ownership-reconciliation/audit workflow remain separate work. Resolving the
exceptions must never silently bypass these guards or manufacture employee records.

## Runner behavior

Implementation: `backend/src/database/migrations.ts` and `migrate.ts`.
Uses existing pg/Node facilities; no new dependencies or services.

- Commands require explicit MIGRATION_DATABASE_URL and `--database <exact-name>`;
  DATABASE_URL is never an implicit migration target.
- Ordered UTF-8 SQL files are numbered consecutively from 0001. Invalid names,
  version gaps/duplicates and accidental top-level transaction/session commands fail
  before database access. SQL is reviewed trusted code, not an untrusted SQL sandbox.
- SHA-256 covers exact file bytes. Both status and apply reject changed, missing,
  renamed or reordered applied files/history.
- A dedicated PostgreSQL session holds advisory key (1213353560,1296648018) for the
  full command. A competing runner fails promptly with MIGRATION_BUSY. PostgreSQL
  session advisory locks persist across transactions; the runner explicitly unlocks
  and disposes the session, including failure paths. See
  [PostgreSQL locking documentation](https://www.postgresql.org/docs/17/explicit-locking.html).
- One transaction per migration includes ledger creation (on first use), all SQL,
  and the ledger insert. Failed first migration leaves no ledger; failed later
  migration leaves prior successful versions intact. Correct an unapplied file and
  retry. Never edit a successfully applied file.
- Status performs SELECTs plus a transient advisory lock; it creates no tables or
  ledger rows. Repeat application returns an empty newlyApplied list.
- The migration checks known FK definitions before replacing them and refuses an
  unexpected additional FK. This avoids accidentally retaining a second cascade.

## Locking and expected operational impact

Migration 0001 takes ACCESS EXCLUSIVE locks on employees, users, leave_requests and
attendance, in that order. Reads and writes to these tables can briefly wait. The
runner sets a 5-second lock timeout and a 60-second timeout per SQL statement. Failure
rolls back the entire migration; the rehearsal verified a blocked-table failure.
Run in a quiet maintenance window after approval, with a current recoverable backup.
The attendance FK skips validation of historical exceptions; user/leave FKs are
validated because their referenced IDs already passed the original constraints.
No durable partial replacement is visible outside the transaction.

## Rollback strategy

1. **Failure before commit:** automatic ROLLBACK; no business or constraint changes,
   and no applied ledger row for the failing migration. Connection loss also aborts
   PostgreSQL's uncommitted transaction. Retry only after resolving the cause.
2. **Lost acknowledgement around COMMIT:** run status first. If the commit completed,
   its checksum row prevents reapplication. Do not infer rollback from a client error.
3. **Post-commit issue:** prefer a reviewed forward fix that retains history protection.
   There is no destructive down/reset command and no automatic backup restore.
4. **If restoration of the inspected legacy constraints is explicitly approved:**
   [rollback_0001_legacy.sql](sql/rollback_0001_legacy.sql) is a concrete compensation
   draft. Add it as the next new numbered migration after review; never erase or
   rewrite ledger history. It restores the legacy user/leave cascades, removes the
   added attendance FK/view/guards, and changes no business rows/IDs/sequences. This
   weakens protections and is not recommended for routine rollback. It is specifically
   for the legacy source shape, not the fresh baseline's original attendance FK.

The compensation was run **only on an isolated copy**, as version 0002 in a temporary
migration directory. Original constraint definitions and all table/sequence/column
fingerprints matched afterward, while both ledger entries remained. The approved
application-level 409 endpoint is retained regardless of any database compensation.

## Verification and review gate

See [verification evidence](HR_NEXUS_V2_MIGRATION_EVIDENCE.md). The checked-in rehearsal
script creates a separate internal Docker network and a PostgreSQL server on tmpfs,
streams a consistent pg_dump/pg_restore copy of the database held in the existing
volume, and runs tests against independent copies. This is a logical database copy,
not an unsafe copy of live PostgreSQL storage files. Owner/ACL restore is omitted on
this isolated server; records, column types, defaults, constraints and sequences are
preserved. No host port is exposed and the real database volume is never mounted.

Fresh initialization is schema.sql only, without seed execution. Failure/concurrency
cases and synthetic API fixtures are confined to the lab. Lab databases are retained
in temporary server memory for inspection; no cleanup/reset is performed.

**Current release gates:** clean Docker rebuild still has the earlier base-image
metadata timeout; full authenticated browser regression remains outstanding. Cached
images and API tests do not close those gates. Docker credentials were not changed.

**Approval requested:** apply only migration 0001 with the SHA-256 above to the
existing `hr_nexus` database, creating the ledger and the listed constraints, guards
and exception view. No source application is authorized by this document itself.
After approval, recheck source fingerprints/schema/status, apply this exact version,
verify preserved rows/IDs/sequences and constraints, then proceed to company settings.
