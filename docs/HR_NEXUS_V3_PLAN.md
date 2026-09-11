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
| M1 | Roles, permissions & manager experience | complete |
| M2 | People, directory, social profiles & org chart | complete |
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
5. Rebuild the isolated V3 demo database `hr_nexus_v3_demo` (clone, migrate, seed) for
   browser checks. The V2 demo database `hr_nexus_demo_browser` is left untouched.

**Ordering rule, learned in M1.** The compose backend container live-reloads from the
working tree and serves the source database, so saved backend code is live on the source
app at once. Apply each migration to source as soon as its file and laboratory tests pass,
before saving code that makes an existing shared path read the new schema, and write new
side effects (timeline, notifications) SAVEPOINT-contained so a missing table can never
fail an existing action.

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
| Initial JavaScript | **317.99 kB (104.54 kB gzip)**: the 254.99 kB entry plus the three chunks `index.html` preloads, down from V2's single 569.69 kB file. (First recorded as the entry alone, 254.98 kB, which understated it; corrected in M1.) |
| Navigation gate on the split production bundle | 49/49, no page errors |
| Source fingerprint | unchanged: ledger 0001–0009, 18 tables, 1/2/5, orphans `1:1,3:1,4:2,5:1,6:1`, September draft, 0 flagged |

M0 status: **complete.**

## M1 — Roles, permissions & manager experience (11 September 2026)

Delivered:

- **Migration 0010 `org_structure`** (SHA-256 `e2b1a23bb35c60f1113565afed956b058dd0f647be9310677c2bd961f96ec308`):
  nullable `employees.manager_id` with a RESTRICT self-reference, a not-self CHECK, a
  partial index, and a `prevent_manager_cycle` trigger serialised by an advisory lock.
  No row back-filled. Review-only rollback: `docs/sql/rollback_0010_org_structure.sql`.
- **Manager scope derived per request.** The session lookup computes `isManager` from
  current reporting lines (active/probation reports only); `/api/auth/me` reports it.
  `users.role` is unchanged. `auth/policy.ts` (`relationTo`, `isTeamMember`,
  `teamMemberIds`, `actingRole`) and `auth/guards.ts` (`requireManager`,
  `requireEmployeeRecord`, `authorizeLeaveDecision`) are the only authorisation additions.
- **Leave decisions by managers**, for current direct reports only, checked inside the
  transaction that locks the request; nobody (admins included) decides their own request;
  a manager decision is audited with `actor_role = "manager"`.
- **Reporting lines on employee records**: create/update accept `manager_id`, validated
  (exists, active/probation, not self) with loops refused by the database and reported as
  409 `reporting_cycle`; each change is audited as `MANAGER_CHANGED`; the record returns
  the manager and every direct report.
- **Team API** `/api/team` (overview, day attendance, 30-day summary, leave, one member),
  bounded in SQL to the session's own reports, with no pay, coordinates, accuracy or
  distance anywhere in it.
- **Frontend**: capability-built navigation (Me / My team / Company sections), a
  `requires="manager"` route guard, Manager portal labelling, `/team`, `/team/leave`,
  `/team/attendance`, a shared leave decision dialog, a team card on a manager's own
  dashboard, and a "Reports to" picker (loops filtered out client-side as a courtesy) plus
  manager and direct reports on the admin employee record.
- **Demo company**: a Managing Director (new Leadership department) at the top of complete
  reporting lines, three levels deep in Engineering, and sign-ins for two managers
  (Nurul Aisyah, Wei Jian Tan) and one engineer (Aiman Zulkifli) besides the administrator.

Source application of 0010, 11 September 2026 07:22:12 UTC, through the guarded
procedure (evidence `.local-backups/0010-20260911/`):

| Step | Result |
| --- | --- |
| Fresh backup | `hr_nexus_before_0010.dump`, 97,995 bytes, SHA-256 `fd7498bd…a997e7` |
| Restore proof | restored copy matches source on every business digest, orphans and V2 sequences |
| Rehearsal | apply, no-op re-apply, data identical, rollback (ledger back to 0009, data identical), re-apply |
| Source apply | `newlyApplied: ["0010"]`, re-run no-op, business data identical before and after |
| Post-apply dump | SHA-256 `0e7aa82f…1d3127` |

**Incident, recorded rather than smoothed over.** The session lookup began reading
`manager_id` when `userQueries.ts` was saved, before 0010 reached source. Because the
source backend live-reloads from the working tree, sign-ins and authenticated requests on
the source app failed with a 500 (11 occurrences, 07:05:53–07:08:44 UTC, while someone
was signing in) until the guarded apply at 07:22 UTC. No data was affected. The ordering
rule above prevents a repeat.

Verification:

| Check | Result |
| --- | --- |
| Backend typecheck (source and tests) | pass |
| Backend full laboratory suite | **460 pass, 0 fail, 0 skipped** (+20: the org suite, 17 checks and its parent, plus two mock authorisation checks; the session test gained manager assertions) |
| Frontend typecheck, Oxlint, production build | pass, no warnings |
| Initial JavaScript | 321.78 kB (105.51 kB gzip), 99 chunks |
| M1 browser smoke on the V3 demo stack | **49/49**, no page errors: admin reporting lines, manager navigation/dashboard/overview/decision/attendance, non-manager refusal, second manager isolation, 390 light and 375 dark with no overflow |
| V2 navigation gate on the V3 bundle | 48/48 (one fewer bottom-bar check: the demo employee account is now a manager with four bar links plus More) |
| Source fingerprint after apply | business digests identical; ledger 0001–0010; 18 base tables; 1/2/5; orphans `1:1,3:1,4:2,5:1,6:1`; September draft; 0 flagged |

M1 status: **complete.** Cross-role authorization passes (org suite, mock suite, browser).

## M2 — People, directory, social profiles & org chart (11 September 2026)

Delivered:

- **Migration 0011 `profiles_timeline`** (SHA-256 `1e1f92c588a7df8faf706d35ed0336879a3b5b1c17473df0f2e2c157e404b5d0`):
  `employee_profiles` (About ≤ 2000, up to 30 skills, `share_phone` off by default) and the
  append-only `employee_events` timeline with a visibility tier per event (company, self,
  management), bounded detail, and idempotent source keys. New tables only.
- **Directory** `GET /api/people`: working employees only, social fields only, search over
  name, role, department and skills with LIKE wildcards escaped, department facets, bounded
  pages.
- **Social profile** `GET /api/people/:id`: one social layer for every viewer, the relation
  (`self`, `manager`, `admin`, `coworker`) and the layers it may open; phone only when shared
  (or for the person themselves); employment status only for self and HR; manager, reports,
  peers and chain of command limited to visible people. A former employee is 404 to
  colleagues and visible to HR.
- **Timeline** `GET /api/people/:id/timeline`, filtered by relation tier; "Joined" derived from
  the employment date (no back-fill); employee updates write role, department and reporting
  line changes (company tier) and status changes (management tier), SAVEPOINT-contained.
- **Org chart** `GET /api/org/chart`: the visible organisation as a flat list; anyone whose
  manager has left becomes a root.
- **About me** `GET/PUT /api/profile/about`: exactly three fields, audited as
  `PROFILE_UPDATED` with the phone-sharing before/after but not the text.
- **Frontend**: a Workplace navigation section for every role; `/people` (search and
  department in the address), `/people/:id` (hero, About, skills, timeline, reports to,
  direct reports, works with, chain of command, plus the viewer's own layer: My HR, the
  manager's team view, or HR's record link), `/org` (an outline tree with counted
  expanders, find-and-reveal, expand/collapse all, `?focus=`), and an About me editor on
  My profile.
- **Demo**: twelve colleague profiles and a little company-visible history. The V3 demo
  database is now built from a fresh `schema.sql` baseline, so it holds only the fictional
  company and no copy of the real source employee record.

Source application of 0011, 11 September 2026 07:31 UTC, through the guarded procedure,
before any shared code depended on it (evidence `.local-backups/0011-20260911/`): backup
`8abe22d1…a87f906` restore-verified, rehearsal apply/no-op/rollback/re-apply, source apply and
no-op, business data identical before and after, post-apply dump `307b80d5…f575d1`.

Verification:

| Check | Result |
| --- | --- |
| Backend typecheck (source and tests) | pass |
| V3 migration suite | 0010 and 0011 each additive, idempotent and reversible; the whole chain applies to a fresh `schema.sql` |
| Backend full laboratory suite | **478 pass, 0 fail, 0 skipped**, twice in a row (+18: people suite 13 checks and parent, V3 migration suite 3 checks and parent) |
| Frontend typecheck, Oxlint, production build | pass |
| M2 browser smoke on the V3 demo stack | **39/39**, no page errors: directory, skill search, colleague/self/manager/HR profiles, API leak checks, former-employee 404, org chart find-and-reveal, About editor, 390 and 375 dark with no overflow |
| V2 navigation gate on the V3 bundle | 48/48 |
| Source fingerprint | business digests identical; ledger 0001–0011 |

Recorded for M9: one of three full runs failed at the import suite's teardown after all its
checks had passed ("terminating connection due to administrator command" from the clone
drop reaching a connection without an error listener). It is the same class as the V2
intermittent in the settings and audit suites and did not reproduce in the next two runs;
it will be fixed in the harness rather than retried away.

M2 status: **complete.** Cross-role leakage cases pass in the people suite and the browser.
