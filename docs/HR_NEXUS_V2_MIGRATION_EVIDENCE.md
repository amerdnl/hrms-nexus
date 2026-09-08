# Migration 0001 verification evidence

Date: 8 September 2026. Target source: `hr_nexus`, PostgreSQL 17.10.
Historical rehearsal result: **isolated upgrade proven before source approval.**

Subsequent user approval and source application are recorded in the
[8 September application receipt](HR_NEXUS_V2_MIGRATION_APPLICATION.md). The source
now has 0001 applied; the pending status below describes the earlier baseline.

SQL SHA-256:
`3339156f7143d1ff5a12ebd3b71ca91f21d1c1c6775e4c602fccce1d8c787e39`.

## Rehearsal scope

The checked-in `scripts/rehearse-migrations.sh` successfully created a separate
internal Docker network/server and streamed pg_dump directly into pg_restore on
that server. The live database volume was not mounted by the lab. No source rows
or credentials were printed by the copy, no seed script was executed, and no Docker
credential configuration was changed. The lab uses cached PostgreSQL/backend images
and the working backend dependency volume mounted read-only.

Independent randomly named lab databases cover copy upgrade, schema-only fresh
initialization, first/later failure, concurrent runners, lock timeout, API lifecycle,
unexpected FK drift and reviewed legacy compensation. Full-row fingerprints and
column/default/sequence snapshots are compared before and after upgrade. Synthetic
employees/accounts used for behavior probes exist only in the lab. These fixtures
are test data, not replacements for the missing employees in the source or baseline.

## Results

64 tests passed, zero failures/skips in the full isolated run:

| Coverage | Outcome |
| --- | --- |
| HTTP authorization/ownership, including retired permanent-delete endpoint | 36 passed |
| SQL file names/order/checksums and transaction-boundary checks | 12 passed |
| Isolated migration suite: 14 scenarios plus parent suite | 15 passed |
| Current-account PostgreSQL temporary-table test | 1 passed |

The migration scenarios verify:

1. Read-only status creates no ledger; explicit target mismatch is rejected.
2. Upgrading a copy preserves all five business tables, every column/default/type,
   all sequences, and each complete orphan row.
3. Repeat apply is a no-op with one matching ledger/checksum row.
4. New invalid references fail 23503; each non-cascading employee FK rejects
   parent deletion/key changes; orphan adoption/reassignment guards fail 23514;
   valid employee upserts and existing non-key attendance correction work.
5. NOT VALID alone admits recreated parent IDs, proving the need for the proposed
   guards; explicit validation with unresolved rows fails 23503.
6. Fresh schema.sql initialization without seeds uses the same migration and
   validates the attendance FK because it contains no exceptions.
7. An unexpected additional cascade causes preflight failure without partial changes.
8. Failure of the first migration leaves no data, DDL or ledger table.
9. A later failure rolls back its DML/DDL/ledger row while preserving earlier
   migrations; corrected unapplied SQL retries successfully; edited/missing applied
   migrations are rejected.
10. A competing runner receives MIGRATION_BUSY and cannot apply twice; session lock
    is available after completion.
11. A simulated lost COMMIT acknowledgement and failed cleanup retain COMMIT_UNKNOWN;
    subsequent status detects the committed version and prevents duplicate apply.
12. An application table lock produces a bounded 5-second 55P03 failure and full rollback.
13. Actual Express API calls return 409 for permanent deletion, deactivate/reactivate
    a synthetic employee, deny its inactive session and preserve attendance/leave.
14. Review-only legacy compensation restores original FK definitions and all data
    while retaining both migration history entries.

The exception view is verified non-updatable and contains exactly the five original
exceptions after upgrade. Attendance FK convalidated=false on the copied source;
users/leave FKs stay validated. Fresh attendance convalidated=true.

## Source and copied-upgrade fingerprints

The source was checked again using `docs/sql/verify_history_retention.sql`. These
counts/digests matched both the copied baseline and its migrated version. MD5 here
is a deterministic change-detection fingerprint, not a password or security hash;
migration file integrity uses SHA-256.

| Table | Rows | Complete ordered table fingerprint |
| --- | --- | --- |
| departments | 1 | 08e0e032d8104a1cdc13b3ede29425f9 |
| employees | 1 | fe1033f1426ab0ae69db7c0ce9bc5772 |
| users | 2 | addf0541f4252a95bbecc3ea4ca50ab3 |
| leave_requests | 0 | d751713988987e9331980363e24189ce |
| attendance | 5 | 7a266f20242dbe5fabf4207e9a7369a5 |

| Attendance id | Original employee_id | Date | Complete row fingerprint |
| --- | --- | --- | --- |
| 1 | 1 | 2026-08-12 | 8ccc55aedd3b0d5fecff62acc61c4e22 |
| 3 | 1 | 2026-08-13 | d3a4e5615286dd37af2d0bab75b8bc19 |
| 4 | 2 | 2026-08-12 | 08d8ce3c587dd2f85d915144066c1288 |
| 5 | 1 | 2026-08-14 | f7fc77e6e8f348837f25e32a5dc3820d |
| 6 | 1 | 2026-08-15 | 1e9cab8b1228e786e3f009464f2e789f |

All orphan notes/timestamps are included in these fingerprints. Existing INTEGER
identifiers and sequence last values (3,3,4,11,6 for departments, employees, users,
leave, attendance) remain unchanged. Source constraints remain at the pre-migration
baseline; `schema_migrations` and `attendance_integrity_exceptions` are absent.
Read-only source migration status reports version 0001 **pending**, no newly applied
versions, five orphan references, and no attendance employee FK.

## Additional checks and limits

Backend/source/test TypeScript checks, backend build, frontend lint/build and shell
syntax check pass. Existing frontend Oxlint applied to backend reports one existing
no-useless-empty-export warning in `src/types/auth.ts`; new migration code has no
lint warnings. `git diff --check` passes. No dependencies or initialization scripts
changed. Permanent-delete retirement is committed as `dd13abe`.

The first NOT VALID experiment inserted its legacy fixture and updated it within
the same transaction, which PostgreSQL rechecked and rejected. The final experiment
commits the legacy fixture before adding the FK, matching actual upgrade conditions.
The first standalone cached backend image lacked Multer; final tests reuse the
running container's working dependency volume read-only. Neither issue was ignored.

Release gates remain open: a clean Docker rebuild previously timed out resolving
node:24-alpine metadata; full authenticated browser regression has not run. Isolated
API tests and cached-image runs do not substitute for those release checks.

## Retained inspection artifacts

The final verified upgraded copy is available in container/network
`hr-nexus-v2-lab-1788839341-36529`, database
`hr_nexus_v2_upgrade_5ef978bd7a`. Its untouched copied baseline is
`hr_nexus_v2_upgrade`. Additional failure/compensation/workflow databases use the
same `5ef978bd7a` suffix. The earlier `hr-nexus-v2-migration-lab` also remains for
inspection. Both servers use temporary memory storage; no existing volume was reset.

Local logs (not credentials or raw dumps):
- `/private/tmp/hr-nexus-v2-final-tests.log`
- `/private/tmp/hr-nexus-v2-source-verification.log`
- `/private/tmp/hr-nexus-v2-migration-evidence.log` (end-to-end rehearsal script run)
