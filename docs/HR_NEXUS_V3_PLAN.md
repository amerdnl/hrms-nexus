# HR Nexus V3 implementation plan

Specification: `HR_NEXUS_V3_DEFINITIVE_MASTER_EXECUTION.md` (read in full).
Architecture: [`HR_NEXUS_V3_ARCHITECTURE.md`](HR_NEXUS_V3_ARCHITECTURE.md).
Branch `feat/hr-nexus-v3`, from tag `v2.0.0-rc1` (`2947aca`). Started 11 September 2026.

## Protected baseline, verified before any edit

Read-only checks against the source database `hr_nexus` on 11 September 2026:

```
ledger        0001:3339156f 0002:0ac942c9 0003:1014b30d 0004:ef174819 0005:00dede24
              0006:a8c6e479 0007:a37b09cd 0008:59dac71d 0009:fb90dbca
base tables   18
employees/users/attendance/leave/departments   1 / 2 / 5 / 0 / 1
orphan fingerprint   1:1,3:1,4:2,5:1,6:1
payroll periods      2026-9 draft
flagged users        0
company settings     revision 0, UTC, Mon–Fri, company name unset
```

Backend full laboratory suite: **434 pass, 0 fail, 0 skipped**. Backend typecheck, frontend
typecheck, Oxlint and production build pass; the entry chunk is 569.69 kB (161.75 kB gzip).
`HR_NEXUS_V2_MASTER.md` and `docs/schema.dbml` are untracked and stay so.

## Milestones

| # | Milestone | Status |
| --- | --- | --- |
| M0 | Architecture & foundation | complete |
| M1 | Roles, permissions & manager experience | — |
| M2 | People, directory, social profiles & org chart | — |
| M3 | Action Center, search, notifications, calendar & announcements | — |
| M4 | Onboarding & offboarding | — |
| M5 | Recognition & employee timeline | — |
| M6 | Goals & performance reviews | — |
| M7 | Attendance, leave & payroll V3 | — |
| M8 | Analytics, reports, export & settings | — |
| M9 | Mobile, performance, security & accessibility hardening | — |
| M10 | Complete demo, final QA & release | — |

Each milestone ends with: backend tests (full laboratory run, new total reported),
backend typecheck, frontend typecheck, Oxlint, production build, migration tests when a
migration was added, authorisation tests, browser smoke against the isolated demo stack,
responsive smoke at 375/390/1280, and the source-integrity fingerprint above re-read.

## Migration procedure for every V3 migration

1. Write `backend/migrations/00NN_name.sql` with a fail-closed preflight; record its
   SHA-256.
2. Laboratory suites apply the whole chain to fresh clones of
   `hr_nexus_v2_settings_baseline` and to `schema.sql` without seeds; idempotent re-run
   and rollback are asserted.
3. Before source: `pg_dump -Fc` of `hr_nexus` into `.local-backups/00NN-<date>/`,
   SHA-256 recorded; restore into an isolated lab database and compare the business
   fingerprint field by field; rehearse apply, re-apply and rollback on that copy.
4. Apply to source through `npm run migrate:apply -- --database hr_nexus` with an
   explicit `MIGRATION_DATABASE_URL`; re-run to prove a no-op; re-read the fingerprint;
   record checksum, ledger timestamp and impact in the milestone notes below.
5. Apply to the isolated demo database `hr_nexus_demo_browser` for browser checks.

STOP conditions from master §27 and §44 apply. None of the planned migrations drops,
rewrites or reconciles anything.

## Acceptance tests by milestone

All V3 laboratory suites are gated by `HR_NEXUS_V3_LAB=1` and use `tests/labHarness.ts`
(M0). They run only against the internal lab host, never the source.

**M1** `org.integration.test.ts` — 0010 applies additively and rolls back; a self-manager
and a two- and three-node cycle are refused with 23514; `isManager` flips on the next
request when the last report is reassigned; a manager with reports gets 200 on
`/api/team` and 403 on `/api/employees`; a non-manager employee gets 403 on `/api/team`;
a manager reading a non-team employee through any team endpoint gets 404; a manager may
approve a report's leave but not their own and not a non-report's; the stale-manager case
(token minted while managing, relationship removed) is refused; audit rows exist for
`MANAGER_CHANGED`. Plus `authorization.test.ts` mock coverage of the new guard.

**M2** `people.integration.test.ts` — directory lists only active/probation employees
and only social fields (asserts salary, coordinates, DOB, address, emergency contact,
password hash are absent from every byte of the response); a coworker profile carries no
sensitive layer and `layers` names only `social`; phone appears only when shared; self,
manager and admin relations are reported correctly; org chart has no sensitive field;
profile edit rejects restricted fields and over-long skills; inactive employees are 404
to coworkers and 200 to admin.

**M3** `workplace.integration.test.ts` — notification fan-out targets, idempotent
dedupe, read/unread, no cross-user read; Action Center items appear and disappear with
the underlying record and never include out-of-scope work; search never returns an
inactive employee to a coworker and never returns an admin-only destination to an
employee; calendar hides reasons and types from coworkers; announcement audience and
expiry are enforced; audit rows for publish/archive.

**M4** `lifecycle.integration.test.ts` — template instantiation resolves assignees;
one active plan per employee per kind; only assignee or admin completes a task;
offboarding completion deactivates the account, preserves attendance/leave/payroll rows
and orphan fingerprint, and is audited; notifications on assignment.

**M5** `recognition-timeline.integration.test.ts` — self-recognition refused, daily
limit enforced, private recognition invisible to coworkers, admin hide removes from feed;
timeline tiers filtered by relation; events written by employee update and lifecycle.

**M6** `performance.integration.test.ts` — goal visibility tiers; progress history;
manager creates for team only; review cycle open/close; self then manager submission
order; coworker never reads a review; admin read audited; rating bounds.

**M7** `v3-attendance-leave-payroll.integration.test.ts` — leave preview uses company
working week and holidays; cancellation compares against the company date; manager team
attendance excludes coordinates; payroll V2 guarantees re-asserted (money, immutability,
transitions); statutory decision recorded.

**M8** `analytics-export.integration.test.ts` — analytics computed from fixtures match
hand totals; team analytics bounded to scope; new export datasets exclude review content,
private goals' descriptions and notification text; holidays CRUD and validation.

**M9** `security-matrix.integration.test.ts` — the full master §37 matrix as one suite,
plus route-splitting build assertions and axe/keyboard browser checks.

**M10** — demo rebuild, workflow gate (§39), visual gate (§38), source integrity gate
(§40), final report.

## Decisions log

- **11 Sep 2026 — Manager is a derived scope, not a stored role.** See architecture §2.
  Chosen so a relationship change can never leave a stale capability and so no migration
  has to widen the `users.role` CHECK.
- **11 Sep 2026 — Action Center is derived, never stored.** A stored inbox of actions
  would duplicate the business state it points at and go stale; the endpoint reads the
  same tables the destination pages read.
- **11 Sep 2026 — Route-level code splitting starts in M0**, before any V3 page exists,
  so the entry chunk shrinks first and each later milestone adds chunks rather than
  weight.

## M0 — Architecture & foundation (11 September 2026)

Delivered:

- The architecture document and this plan.
- `backend/src/utils/companyClock.ts` — one `companyToday()` shared by the two
  dashboards, reports and exports, replacing four identical copies. Behaviour unchanged
  (Company Settings timezone, UTC fallback).
- `backend/tests/labHarness.ts` — the shared laboratory harness every V3 suite uses:
  clone from the settings baseline, apply the chain, boot the real Express app, sign
  tokens, call endpoints, tear down and drop the clone on success.
- Frontend route-level lazy loading with a single fallback, so every page is its own
  chunk. Build output is recorded in the verification section of each milestone.

A dedicated isolated V3 demo stack was created for browser checks, leaving the V2 demo
untouched: database `hr_nexus_v3_demo` on the internal lab server (cloned from the
settings baseline, migrated, seeded by the guarded demo seeder), API container
`hr-nexus-v3-demo-api` on :5018 (CORS origin :5190), production bundle served on :5190
from a build directory outside the repository.

Verification:

| Check | Result |
| --- | --- |
| Backend typecheck (source and tests) | pass |
| Backend full laboratory suite | **440 pass, 0 fail, 0 skipped** (434 + 6 new foundation checks) |
| Frontend typecheck, Oxlint, production build | pass, no chunk-size warning |
| Entry chunk | **254.98 kB (81.56 kB gzip)**, down from 569.69 kB (161.75 kB gzip) |
| Navigation gate on the split production bundle | 49/49, no page errors |
| Source fingerprint | unchanged: ledger 0001–0009, 18 tables, 1/2/5, orphans `1:1,3:1,4:2,5:1,6:1`, September draft, 0 flagged |

M0 status: **complete.**
