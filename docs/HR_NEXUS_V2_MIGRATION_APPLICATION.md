# Migration 0001 application receipt

8 September 2026, branch `feat/hr-nexus-v2`, implementation reviewed at `d293e31`.
The user explicitly approved **only 0001** with the exact SHA-256 below. Application
completed at **2026-09-08 06:02:06.067505 UTC** (14:02 Malaysia time).

## Applied change

`backend/migrations/0001_employee_history_retention.sql` remains byte-identical:

```text
3339156f7143d1ff5a12ebd3b71ca91f21d1c1c6775e4c602fccce1d8c787e39
```

The reviewed runner applied only this file to `hr_nexus`. It created the ledger,
replaced the users/leave employee cascades with RESTRICT, added the NOT VALID
attendance RESTRICT FK, and installed the two approved orphan-ownership guards
and exception view. No other source migration, business-data change, ID conversion,
sequence adjustment, ownership reconciliation or initialization replay occurred.

## Recoverable backup and prechecks

Private Git-ignored directory: `.local-backups/0001-20260908/` (directory mode 0700).
Backup: `hr_nexus_before_0001.dump`, PostgreSQL custom format, 20,056 bytes.
Backup SHA-256:

```text
18a53fcd76af40c1464f8e648a86c1d4edfcfdc4198c6314a3e86330c7271c57
```

`pg_dump -Fc` used the existing container configuration without exposing or changing
credentials. A complete restore with `pg_restore --exit-on-error --no-owner --no-acl`
succeeded in new isolated database `hr_nexus_backup_check_20260908`, container/network
`hr-nexus-v2-lab-1788839341-36529`. Source ownership/ACL metadata remains in the
backup; isolated verification intentionally restored with the lab owner.

All restored business/orphan fingerprints, ID types and sequence values matched.
Schema comparison allowed only pg_dump's random restrict marker and equivalent
rendering of four existing varchar-array/text-array CHECK casts after restore;
all other schema definitions matched. The live source schema did not change during
backup. Its documented verification output matched the previously approved source
log exactly, including all constraints. An immediate repeat showed no source drift.
Status confirmed only 0001 pending, and both backup and SQL checksums were rechecked.

This is a logical database recovery artifact. Restore into a separate database and
verify it before any future recovery decision. Overwriting the source, reverting
constraints, or running the review-only compensation still requires separate approval.

## Post-application verification

| Required check | Result |
| --- | --- |
| Ledger | Exactly one 0001 row, expected filename and SHA-256 |
| Five business tables | Counts and complete ordered row fingerprints unchanged |
| Five orphan attendance rows | IDs 1,3,4,5,6 and complete row fingerprints unchanged |
| Existing columns | Complete CREATE TABLE definitions unchanged, including INTEGER IDs/defaults |
| Sequences | Definitions, last_value, is_called and log_cnt unchanged |
| users_employee_id_fkey | DELETE/UPDATE RESTRICT, validated |
| leave_requests_employee_id_fkey | DELETE/UPDATE RESTRICT, validated |
| attendance_employee_id_fkey | DELETE/UPDATE RESTRICT, NOT VALID |
| Exception view | Exactly five original row fingerprints; non-updatable |
| Invalid new attendance reference | Source rejected with 23503 |
| Orphan employee-ID adoption | Source rejected with 23514 |
| Orphan attendance reassignment | Source rejected with 23514 before modifying the row |
| Ordinary non-key correction | Passed on transaction-only valid source fixture; ROLLBACK |
| Existing orphan non-key correction | Passed and rolled back in isolated post-application copy |
| Permanent deletion | Authenticated actual Express API returned 409 with deactivation guidance in post-application copy |
| Deactivation/reactivation | Actual Express API passed in post-application copy; inactive session 401, reactivated session 200; history unchanged |

Source behavior probes used explicit IDs and a final ROLLBACK, advancing no sequences.
No successful update was made to any source orphan. All source evidence was checked
again afterward and matched. The API lifecycle used synthetic accounts and employee
1000 only in isolated database `hr_nexus_post_0001_20260908`, restored from a fresh
post-application dump. Missing employees 1 and 2 were never recreated. Real account
credentials were neither read nor used. These API checks are not a browser smoke test.

The earlier table and orphan fingerprint values are retained in
[rehearsal evidence](HR_NEXUS_V2_MIGRATION_EVIDENCE.md). Comparison scopes existing
business columns separately from the newly approved exception-view columns.

## Docker and code checks

- `docker compose build --no-cache` passed, followed by `docker compose down` and
  `docker compose up -d --build --wait`. No volume deletion or Docker credential change.
- PostgreSQL logged that an existing database was detected and initialization was
  skipped. Source data, constraints, full sequence state and applied status matched
  again after restart. Existing unrelated/orphan containers were left alone.
- Fresh image test run: **64 passed, zero failed or skipped**, including isolated
  upgrade, fresh schema, checksums, locking, transactions, failure rollback and APIs.
- Backend/source/test typechecks and build passed. Frontend lint/typecheck/build passed.
  Backend lint reports only the existing empty-export warning in `src/types/auth.ts`.
- Rebuilt frontend returned HTTP 200; unauthenticated live employee API returned 401.

## Remaining gates

Authenticated browser smoke is **blocked**: the browser runtime reported no browser
available, and supported discovery returned an empty list. The user was asked to
enable the in-app browser and sign in. No browser workflow is claimed as verified.
**Company Settings has not started and remains gated on that smoke test.**

The clean install also reported dependency audit findings: backend transitive `qs`
(moderate; GHSA-x5fp-wj9c-mxmx and GHSA-4mjr-xmp4-gh2g) and frontend transitive `nanoid`
(high; GHSA-2v37-7h3g-55p8). Audit JSON is retained; dependencies were not changed in
this migration increment. Review/remediation remains a security release item.

## Files and retained evidence

This increment changes `.gitignore` and the plan/database/design/evidence documents,
and adds this receipt. The approved SQL, application behavior and initialization
files are unchanged. Backups contain sensitive business data and are excluded from Git.

The private backup directory retains pre/post/restart source logs, schema snapshots,
complete sequence snapshots, ledger/FK/view evidence, source behavior probe results,
post-copy API results, 64-test output and dependency audit JSON. The before and after
custom-format backups and isolated restore databases are retained without cleanup.
