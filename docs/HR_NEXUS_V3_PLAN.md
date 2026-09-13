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
| M3 | Action Center, search, notifications, calendar & announcements | complete |
| M4 | Onboarding & offboarding | complete |
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
   **Name every pending version (learned in M3).** The runner applies every pending file
   at once, so when more than one migration is pending the rehearsal must apply, prove a
   no-op, roll back in reverse order and re-apply exactly that set, and the source apply
   must report exactly that set. Every check in the procedure fails closed.
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
- **13 Sep 2026 — Company events join 0013.** Master §10 names company events alongside
  holidays, so `company_events` sits with `company_holidays` rather than being overloaded
  into announcements.
- **13 Sep 2026 — Two announcement priorities, not three.** "Important" pins an
  announcement in each reader's Action Center until they open it; a third level would
  have no different behaviour.
- **13 Sep 2026 — An announcement's audience is fixed once published.** The people it
  reached were notified; retargeting would leave them holding links to something they can
  no longer open. Drafts are deleted; published announcements are archived.
- **13 Sep 2026 — HR's Action Center carries only the leave no manager can decide** (no
  manager, a manager who has left, or one without a usable account). Everything else stays
  with the manager, so HR's list is work, not noise.
- **13 Sep 2026 — Who's out:** approved leave for everyone as a name and dates; pending
  requests only for the person, their manager and HR; the leave type only for the person,
  their team's manager and HR; reasons never.
- **13 Sep 2026 — Lifecycle tasks belong to roles, not people.** A task is for the
  employee, their manager or HR, resolved from current data on every request. A reporting
  line that changes mid-plan hands the manager's tasks over at once, and nothing stored can
  go stale.
- **13 Sep 2026 — Onboarding completes itself; offboarding never does.** When the last
  onboarding task is finished the plan closes. Offboarding is completed by HR only, on or
  after the last working day, with no task pending and nobody still reporting to the
  leaver. Completion runs the same employee lifecycle statements as HR's deactivate action,
  and records `EMPLOYEE_DEACTIVATED` alongside `LIFECYCLE_PLAN_COMPLETED`.
- **13 Sep 2026 — No "due soon" notifications.** They would need a scheduler, which V3 does
  not run. Due and overdue tasks are shown in the Action Center and on My tasks instead.
- **13 Sep 2026 — `/api/company/calendar-config` ships in M3,** because the calendar needs
  it. It exposes the timezone, working week, company today and holidays, and nothing else
  from settings. M7 builds the leave preview and cancellation fixes on it.

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

## M3 — Action Center, search, notifications, calendar & announcements (13 September 2026)

Delivered:

- **Migration 0012 `notifications`** (SHA-256 `8c4b0dd53344cb84da4d9f2361a6d8cbfbf1407cfb936601f09a000f4e22cb30`):
  one table, one account per row, an app-relative link enforced by CHECK (no scheme, host,
  `//` or spaces), paired entity, a per-account dedupe key, and indexes for the list and
  the unread badge.
- **Migration 0013 `announcements_calendar`** (SHA-256 `d5b5edbb977722099e211cb871bb2c2094701df39b7aacb0adfb98522b7696e2`):
  `announcements` (plain text, company or one department, draft/published/archived with
  stamps, optional expiry, revision), `announcement_reads`, `company_holidays` (one per
  date) and `company_events` (up to 32 days, optional times and location). New tables
  only; a department an announcement was addressed to cannot be deleted from under it, and
  department deletion now says so.
- **Notifications**: a SAVEPOINT-contained writer that targets eligible accounts only,
  never the actor, drops an unsafe link rather than failing, and dedupes per account.
  Produced by leave submitted (manager, else HR), decided and cancelled by HR (employee),
  payroll approved (each payslip holder), reporting line changed (employee and new
  manager) and announcement published (its audience). No text carries a reason, comment
  or amount. API: list with cursor, unread count, read one, read all; retention on open.
- **Action Center** `GET /api/action-center`, computed from current records: needs you
  (a manager's team decisions, HR's manager-less decisions, payroll's next step, unread
  important announcements), waiting on others, the next 14 days, recent notifications.
- **Search** `GET /api/search`: working people, departments, destinations filtered by
  role and manager scope, and HR records for admins only.
- **Calendar** `GET /api/calendar` and `GET /api/company/calendar-config`; HR holiday
  settings and company events, revisioned and audited.
- **Announcements**: an audience-filtered feed and detail for everyone; HR drafts,
  publishes, corrects, archives and deletes drafts, with revision checks and audit that
  never copies the text.
- **Frontend**: header search palette (Ctrl/⌘K) and notification bell; `/actions`,
  `/notifications`, `/calendar` (month grid from md, agenda on phones, day panel, HR event
  dialog), `/announcements` (Drafts and Archived tabs for HR), `/announcements/:id`, the
  HR editor, a holidays card in Settings, Action Center and announcement cards on both
  dashboards, and team and HR leave pages that open on `?status=`.
- **Demo**: fixed-date holidays, four company events, three published announcements and
  a draft, and the notifications the demo accounts would have received.

Source application of 0012 and 0013, 11 September 2026. The first attempt (07:55:42 UTC)
named only 0012. The runner applied 0012 and 0013 together in the rehearsal copy, the
0012 rollback then left 0013 in the ledger without 0012, and the next apply refused, so the
procedure stopped at rehearsal. Source was untouched: ledger 0001–0011, no new tables. The
evidence is in `.local-backups/0012-aborted-20260911/`. Reviewing the script also showed that
a `check && say` line does not stop under `set -e`. The 0010 and 0011 logs print every
step, so those checks had passed, but the script now fails closed on every check. The
second run (07:57:34 UTC) named both versions (evidence `.local-backups/0012-0013-20260911/`):
backup `c7276f84…f513f6072` restore-verified; pending set exactly 0012 and 0013; rehearsal
apply, no-op, identical business data, rollback in reverse order, re-apply; source apply of
exactly 0012 and 0013, no-op, identical business data; ledger 0001–0013; post-apply dump
`bd5143c3…dc894250`.

Verification:

| Check | Result |
| --- | --- |
| Backend typecheck (source and tests) | pass |
| V3 migration suite | 0010–0013 each additive, idempotent and reversible; the chain applies to a fresh `schema.sql` |
| M3 workplace suite | **18/18**: leakage through notification titles, search, calendar and the Action Center; dedupe and unsafe links; a stale token for a resigned employee; stale reporting lines; announcement audience, revisions, archive and audit redaction; holidays and events |
| Backend full laboratory suite | **498 pass, 0 fail, 0 skipped** (+20: workplace 18, migration suite 2) |
| Frontend typecheck, Oxlint (0 warnings), production build | pass |
| Initial JS | **345.17 kB (gzip 112.26 kB), 113 chunks** — corrected on 13 September, see M4. The bell and search palette, with the dialog they open, are in the shell |
| M3 browser smoke on the V3 demo stack | **59/59**, no page errors: every role's Action Center and deep links, bell, palette, calendar grid and team view, announcement read state, HR publish, holidays, events, API leak checks, 390 light and 375 dark with no overflow |
| V2 navigation gate on the V3 bundle | 48/48 |
| Source fingerprint (13 September) | V2 business data, orphans and ledger identical to the post-0013 record; M3 tables empty on source |

Recorded:

- **A V2 test that depended on the time of day.** The first full run had 496 passes and 2
  failures, both in `attendance.integration.test.ts`. The test checks in at the real Kuala
  Lumpur time, then sets check-out to a fixed 18:30, which the schema's check-in/check-out
  ordering refuses after 18:30 there. Earlier runs happened in the afternoon. The test now
  uses 18:30 only when that is still after the check-in. No product code changed; the
  suite and then the full run passed.
- **Three browser smoke script errors.** The first smoke run had 56 of 59. Two checks
  matched a success notice that repeats the removed item's name, and one compared a
  CSS-uppercased heading case-sensitively. The checks were corrected, the demo rebuilt,
  and the rerun passed 59/59.
- **Source audit log.** Between the post-0013 record and the 13 September re-read, source
  gained two audit entries: successful administrator sign-ins at 11:37:24 and 12:02:06 UTC
  on 13 September, made through the source app. This work did not sign in to source; its
  checks there were unauthenticated health reads.
- **Initial JS correction (recorded in M4).** The figure first written here, 321.78 kB,
  came from running the measuring script without a directory. It fell back to
  `frontend/dist`, an earlier build this work never refreshes, instead of the M3 bundle.
  Rebuilding commit `d2230c4` in a temporary worktree measured 345.17 kB. The script now
  refuses to run without an explicit directory. Moving the search dialog and the
  notification panel out of the shell is recorded for M9.
- **Screenshots reviewed.** No defects. Holiday and event names are truncated inside
  month-grid cells, but each day button's accessible name and the day panel carry them in
  full. Fixed bars appear mid-page only in full-page captures.

M3 status: **complete.**

## M4 — Onboarding & offboarding (13 September 2026)

Delivered:

- **Migration 0014 `lifecycle`** (SHA-256 `0284a031967c01005de5bba675b6afcdda0e110b42e8785a8daa243edaed6503`):
  checklists and their tasks; plans with one active plan per employee per kind (partial
  unique index), a snapshot title, `exit_status` exactly for offboarding, and completion
  and cancellation stamps; each plan's own copy of its tasks, assigned to a role and dated
  from the plan's anchor. New tables only; a plan with tasks cannot be deleted.
- **Shared employee lifecycle.** The lock-then-apply helpers moved unchanged from the
  employee controller to `employeeLifecycleService`, so HR's deactivate action and a
  completed offboarding plan run the same statements in the same lock order.
- **API** `/api/lifecycle`: HR checklists (validated, unique per kind, revisioned), plans
  (start, list, complete, cancel); for every account, a plan as their roles allow (404
  otherwise), "my work", and task updates by the role holder or HR (skip is HR only).
  Starting a plan notifies each role with tasks and writes the timeline (company-visible
  for onboarding, manager and HR only for offboarding). Every mutation is audited;
  task notes are not copied into the audit log.
- **Action Center and search**: tasks the caller's roles hold now; for HR, offboarding
  plans ready to complete; destinations for My tasks, Onboarding and Offboarding.
- **Frontend**: `/tasks` for every role (to do, your plans, your team), a plan page for
  anyone with a role in it, HR's `/admin/onboarding` and `/admin/offboarding` with a start
  dialog, a checklist editor at `/admin/lifecycle/templates`, and a lifecycle card on the
  HR employee record.
- **Demo**: two checklists, two onboarding plans (one whose manager, Nurul, signs in) and
  one offboarding plan, with fixed progress.

Source application of 0014, 13 September 2026 12:14:07 UTC, through the guarded procedure
(evidence `.local-backups/0014-20260913/`): backup `ce772cf0…443ab0f` restore-verified;
pending set exactly 0014; rehearsal apply, no-op, identical business data, rollback,
re-apply; source apply of exactly 0014, no-op, identical business data; ledger 0001–0014;
post-apply dump `e9304a6b…edaafc33`. The lifecycle routes were mounted only after this.

Verification:

| Check | Result |
| --- | --- |
| Backend typecheck (source and tests) | pass |
| V3 migration suite | 0010–0014 each additive, idempotent and reversible; the chain applies to a fresh `schema.sql` |
| M4 lifecycle suite | **9/9**: HR-only endpoints; template validation, duplicates and revisions; plan start dates and role notifications; each role's view and a stranger's 404; task permissions, HR-only skip, onboarding auto-completion; a mid-plan reporting-line change moving the manager's task; offboarding refusals (tasks pending, before the last day, reports remaining) then deactivation with attendance, leave and the orphans unchanged, a stale token refused, the directory updated, audit and timeline written; cancellation |
| Backend full laboratory suite | **508 pass, 0 fail, 0 skipped** (+10: lifecycle 9, migration suite 1) |
| Frontend typecheck, Oxlint (0 warnings), production build | pass |
| Initial JS | 347.55 kB (gzip 112.84 kB), 123 chunks: +2.38 kB over the corrected M3 figure for navigation icons, breadcrumb labels and route stubs. Every lifecycle page and dialog is its own chunk |
| M4 browser smoke on the V3 demo stack | **41/41**, no page errors: manager task list, Action Center and plan page; a colleague's 404s and refused task update; HR lists, checklist editor, starting a plan, the offboarding refusal shown on screen, the HR record card; 390 light and 375 dark with no overflow |
| V2 navigation gate on the V3 bundle | **50/50**: the admin sidebar expectation moves from 11 to 13 destinations for Onboarding and Offboarding |
| Source fingerprint (13 September) | identical to the post-0014 record; M4 tables empty on source |

Recorded:

- **Two lifecycle defects found by the new suite before any browser check.** The task
  update typed one parameter as both text and varchar, and one test read the raw response
  instead of its text. Both were fixed, and the suite passed.
- **Smoke runs.** The first stopped after 32 passes, because the script opened the
  checklists page without `?kind=offboarding`. The second passed 41/41, but its summary
  counted the 409 the script deliberately provokes. The harness now lets a script declare
  expected statuses. The third run, after the two UI fixes below and a demo rebuild,
  passed 41/41 with no page errors.
- **Screenshots reviewed; two defects fixed.** HR's plan breadcrumb said "Onboarding" on
  offboarding plans; it now says "Onboarding and offboarding". The HR record offered "Start
  onboarding" for someone being offboarded; it no longer does. Fixed bars appear mid-page
  only in full-page captures.

M4 status: **complete.**
