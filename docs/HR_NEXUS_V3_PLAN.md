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
| M5 | Recognition & employee timeline | complete |
| M6 | Goals & performance reviews | complete |
| M7 | Attendance, leave & payroll V3 | complete |
| M8 | Analytics, reports, export & settings | complete |
| M9 | Mobile, performance, security & accessibility hardening | complete |
| M10 | Complete demo, final QA & release | complete; release awaits the owner's confirmation (see M10) |

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
- **13 Sep 2026 — Private recognition is for the two people and HR, not the manager.** A
  private thank-you is personal. Letting the receiver's manager read it would turn it into
  a performance signal. Category counts on a profile use the same filter, so it cannot be
  inferred.
- **13 Sep 2026 — Recognition is limited and never rewritten.** Once a day per giver and
  colleague is a database rule; five a day per giver is checked under a per-giver lock. A
  trigger refuses edits and deletion; HR hides and restores instead, and the audit records
  that without copying the words.
- **13 Sep 2026 — Goals: three visibilities and a manager who is never stored.** Private
  goals are for the owner, their current manager and HR; team goals also for colleagues
  who share that manager; company goals for everyone. Progress is a whole percentage the
  owner or manager records, with every change kept, and a completed goal is at 100 by
  database rule. HR reads goals but does not change them.
- **13 Sep 2026 — Reviews run self first, then manager, then an optional response.** The
  order is a database CHECK, and a trigger refuses rewriting anything already submitted.
  The reviewer is the current manager; HR writes the manager review only for someone
  with no manager. Ratings are 1 needs improvement, 2 developing, 3 meets expectations, 4
  exceeds expectations, 5 outstanding.
- **13 Sep 2026 — Review content is private and HR reads are audited.** Lists carry
  status and dates only. The detail endpoint is the one place content appears, filtered by
  role; every HR read writes `REVIEW_VIEWED`, and no audit entry carries words or ratings.
- **13 Sep 2026 — `/api/company/calendar-config` ships in M3,** because the calendar needs
  it. It exposes the timezone, working week, company today and holidays, and nothing else
  from settings. M7 builds the leave preview and cancellation fixes on it.
- **14 Sep 2026 — Company holidays are counted inside a leave range, as in V2.** Payroll's
  unpaid-leave deduction recounts days from the leave dates using the working week alone.
  Excluding holidays from leave would either leave balances and pay disagreeing or change
  pay amounts, which master §27 and §44 make a stop condition. So leave keeps V2's
  working-week count, the preview matches it exactly and names any holiday in the range,
  and a demo announcement that said a holiday "does not use your leave" was corrected.
  Excluding holidays is possible later only as a payroll-semantics change with its own
  decision.
- **14 Sep 2026 — No employee self-service attendance correction.** Master §19 asks for a
  correction workflow "where genuinely useful". V2's verified check-in exists to make
  attendance hard to assert after the fact, and HR already corrects records through an
  audited edit. A request queue would add a second path around verification for little
  gain. Instead HR's Action Center lists recent days with missing check-outs, linking to
  Attendance.
- **14 Sep 2026 — Malaysian statutory automation is intentionally excluded (master §21).**
  Automating EPF, SOCSO, EIS and PCB would need authoritative rule sources, effective-dated
  and versioned rules, rounding rules, test vectors, a legal disclaimer decision and a safe
  rule-update process. None is available to this project with confidence, so statutory
  amounts stay manual payroll lines entered and reviewed by HR. Incorrect automation is
  worse than explicit manual handling.
- **14 Sep 2026 — Payroll V3 changes no money.** It adds when each step happened on the
  period, a "paid" notification to each eligible payslip holder (title only, no amount),
  and HR's next-step items. Integer-sen values, the state machine, snapshots and
  approved/paid immutability are untouched.
- **14 Sep 2026 — Analytics count, they do not trend.** Every figure is a count or sum of
  stored records over a stated scope and window (the last 90 company days, or the leave
  year). There are no period-over-period percentages: at this company's size a month's
  change is noise, and master §22 forbids decorative deltas. Company attendance, leave and
  payroll stay on the V2 reports, which already answer those questions.
- **14 Sep 2026 — Team analytics name nobody.** A manager's figures cover current working
  reports only, open review cycles only, and company-visible recognition only, so a
  private thank-you cannot be inferred from a count. Names stay on the pages that already
  authorise them.
- **14 Sep 2026 — Analytics live inside Reports and My team,** not a new destination: HR
  gains Onboarding, Performance and Recognition tabs, and managers a Team insights card.
  Every plan and cycle links to the page it summarises.
- **14 Sep 2026 — V3 exports carry records, not private words.** Review summaries, ratings
  and responses; the words of private recognition; private goal descriptions; task and
  goal progress notes; and notifications are not exported. Review participation is status
  and submission times only.
- **14 Sep 2026 — Out of scope is 404, not 403, for records.** A record the caller may not
  reach (another person's payslip, review, leave, goal or plan, a non-report's leave
  decision) answers 404 so its existence is not confirmed. Role-gated areas answer 403.
  The security matrix asserts both.
- **14 Sep 2026 — A manager reads a report's leave reason** because the manager decides
  the leave (architecture §4). Coworkers never do, and the calendar never shows reasons.
- **14 Sep 2026 — Vendor chunks and an on-demand search palette, and no performance
  migration.** Measured endpoint times of 2–6 ms on the demo company justified no new
  index, so M9 added no migration.
- **14 Sep 2026 — No new settings in M8.** Timezone, working week and office location
  (V2) and holidays (M3) are the settings with real effects, and all are revisioned. No
  V3 module needs another, and master §24 forbids decorative ones.
- **15 Sep 2026 — An attendance correction needs a reason and cannot exist without its
  evidence.**
  - **Why.** The read-only integrity audit found that a correction overwrote the row,
    audited only new values, needed no reason, left a corrected scan labelled
    verified, and could survive a failed audit write.
  - **Reason and evidence.** Corrections now require a 5–300 character reason, stored
    as the record's note. The row is locked and the correction and its before/after
    `ATTENDANCE_CORRECTED` entry are written in one transaction, so a failed audit
    insert rolls the correction back.
  - **Corrected scans.** A corrected QR record keeps `QR_LOCATION` as its origin, but
    its status becomes `manual`, and every role sees it as "Corrected by HR".
  - **No migration.** The existing note, status and method columns carry all of this.
  - **Scope.** Deliberately not GPS spoof detection, device binding, IP tracking or
    biometrics: those remain future hardening, and nothing here claims physical-presence
    proof (architecture §12).
- **15 Sep 2026 — Home personalization is opt-in, and its storage is not yet on the application
  database.**
  - **Why a migration was needed.** A layout must follow the account across devices, and no
    existing table holds per-account presentation, so migration 0017 adds
    `user_dashboard_layouts`: additive, one table, no existing data touched.
  - **Not applied to source.** The pass forbids changing the protected source database, so 0017
    was applied only to laboratory clones and the isolated demo, not to `hr_nexus`. The backend
    live-reloads on source, so the layout API answers "unavailable" where the table is missing,
    and Home there stays the approved default with no Edit dashboard. Applying 0017 to source is
    a separate, approved step through the migration procedure above.
  - **Defaults are untouched.** They are the previous page bodies, unchanged, and a saved layout
    replaces only the body below the greeting.
  - **Smart ordering.** Deterministic and explainable, it reads only data the widget itself shows,
    uses the company clock, and never runs after the person has moved through a stack.
  - **Deliberately not built.** A Malaysian public-holiday dataset, because that belongs to the
    demo-data pass.

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

## M5 — Recognition & employee timeline (13 September 2026)

Delivered:

- **Migration 0015 `recognition`** (SHA-256 `a0a398d23072b52879497fcbd6fbc7479154edfb44ffb127ef00e35f2697a559`):
  `recognitions` with a closed category list, a 5–500 character message, company or
  private visibility, the company date it was given on (one per giver and colleague per
  day by unique index), and HR's hidden stamp; `prevent_recognition_rewrite` refuses
  deleting or changing anything but the moderation fields. New objects only.
- **API**: `/api/recognition` feed views (company; received and given for accounts with an
  employee record; HR's moderation view with private and hidden recognition), giving
  (not yourself, not a leaver, the two limits, 429 past five), HR hide and restore; and
  `/api/people/:id/recognition` for profiles, filtered by the same rule, with counts by
  category. Company recognition leaves colleagues' feeds when either person leaves.
- **Timeline**: giving writes `recognition_received` in the company tier (with the
  giver's name) or the self tier when private. The M2 timeline already drops events whose
  recognition is hidden, so moderation reaches it with no further change.
- **Notifications and search**: the receiver is told, with a link to what they received;
  Recognition is a search destination for everyone.
- **Frontend**: `/recognition` (Company, Received, Given, and Moderation for HR), a give
  dialog with category chips, a character count and a private option, a recognition card
  on every profile with a "Recognise" button, and a recent recognition card on the
  employee dashboard.
- **Demo**: seven recognitions, including a private one to Aiman that his manager does
  not see.

Source application of 0015, 13 September 2026 12:41:34 UTC, through the guarded procedure
(evidence `.local-backups/0015-20260913/`), run only after the migration suites passed:
backup `46870345…6f85c1fd` restore-verified; pending set exactly 0015; rehearsal apply,
no-op, identical business data, rollback, re-apply; source apply of exactly 0015, no-op,
identical business data; ledger 0001–0015; post-apply dump `5780f9bb…865ac42a`. The
recognition routes were mounted only after this.

Verification:

| Check | Result |
| --- | --- |
| Backend typecheck (source and tests) | pass |
| V3 migration suite | 0010–0015 each additive, idempotent and reversible; the chain applies to a fresh `schema.sql` |
| M5 recognition suite | **9/9**: anonymous and record-less accounts; validation, yourself, leavers and strangers; company recognition through notification, profile, feed and timeline, once a day; private recognition invisible to another colleague and to the receiver's manager, including on the timeline and in counts; five a day; HR hide and restore across profile, feed and timeline with no words in the audit; the database refusing rewrites, deletion and self-recognition; a leaver's recognition leaving colleagues' feeds and their token refused |
| Backend full laboratory suite | **518 pass, 0 fail, 0 skipped** (+10: recognition 9, migration suite 1); the demo seeder suite passed 11/11 again after the seed fixes below |
| Frontend typecheck, Oxlint (0 warnings), production build | pass |
| Initial JS | 348.10 kB (gzip 113.01 kB), 128 chunks: +0.55 kB over M4; every recognition page and dialog is its own chunk |
| M5 browser smoke on the V3 demo stack | **28/28**, no page errors: dashboard card; feed without private recognition; received with it; giving from a profile and seeing it at once; the once-a-day refusal shown in the dialog; API refusals; the manager not seeing a report's private recognition; HR moderation and hidden recognition leaving a colleague's feed; 390 light and 375 dark with no overflow and the dialog fitting |
| V2 navigation gate on the V3 bundle | 50/50 |
| Source fingerprint (13 September) | identical to the post-0015 record; the recognitions table is empty on source |

Recorded:

- **Two demo seed defects, both caught by building the demo from a fresh `schema.sql`.**
  The recognition insert first used the giver's employee id as `created_by`, which
  references accounts. Then one parameter was deduced as both integer and bigint, because
  the fresh schema's keys are bigint. Both times the seed failed inside its transaction
  and wrote nothing. The laboratory baseline uses the source's integer keys, which is why
  the demo seeder suite passed before the fix. Both are fixed, the seeder suite was rerun,
  and the demo now builds.
- **Screenshots reviewed.** One defect was fixed: with no colleague chosen, the private
  option read "Only them and HR will see it"; it now names the person, or says "the person
  you recognise". Dialog descriptions sit tight against the first field in every V3
  dialog. That is shared modal spacing, so it is left unchanged here and recorded for M9's
  visual polish.

M5 status: **complete.**

## M6 — Goals & performance reviews (14 September 2026)

Delivered:

- **Migration 0016 `goals_reviews`** (SHA-256 `a124d261f81655bfeb9fad77c6c2e92bab5b62b36d43186b31a80f3335acb442`):
  `goals` and append-only `goal_updates`; `review_cycles` and `review_participants`, with
  the review order and completeness enforced by CHECK constraints, and
  `prevent_review_rewrite` and `prevent_goal_history_change` refusing rewrites and
  deletion. New objects only; this is the last V3 migration the architecture planned.
- **Goals API** `/api/goals`: your goals, a manager's team goals, a person's goals and one
  goal filtered by relation (owner, current manager and HR see all; a peer sharing the
  manager sees team and company; a coworker sees company). Owners and current managers
  create, edit (revision) and record progress; managers only for current reports.
  Completion notifies the manager (or the owner, when the manager acts), and a completed
  company goal reaches the company timeline.
- **Reviews API** `/api/reviews`: HR drafts, edits, opens (whole company or one
  department) and closes cycles; each participant writes a draft or submitted
  self-review, the current manager then writes theirs, and the employee may respond once.
  Drafts are visible only to their writer. Submission notifies the next person and writes
  a self-tier timeline event on completion. HR reads of content are audited.
- **Action Center and search**: self-reviews to write, reports to review, cycles running
  past their manager due date (HR), and your own overdue goals; destinations for goals,
  reviews and Performance.
- **Frontend**: My goals and a goal page with history, progress and edit dialogs; Team
  goals with "Set a goal"; My reviews and a review page with self and manager forms (1–5
  scale, drafts, confirmation before the final submit) and a response; Team reviews;
  HR's Performance cycle list and cycle page with open and close; a goals card on
  profiles and the employee dashboard.
- **Demo**: five goals with history (one past due), a closed Annual 2025 cycle with a
  complete review and response, and an open Mid-year 2026 cycle at every stage.

Source application of 0016, 13 September 2026 12:58:46 UTC, through the guarded procedure
(evidence `.local-backups/0016-20260913/`), run only after the migration suites passed:
backup `e441bb57…6c8af49c` restore-verified; pending set exactly 0016; rehearsal apply,
no-op, identical business data, rollback, re-apply; source apply of exactly 0016, no-op,
identical business data; ledger 0001–0016; post-apply dump `152a8426…c0f9a6ea`. The goal
and review routes were mounted only after this.

Verification:

| Check | Result |
| --- | --- |
| Backend typecheck (source and tests) | pass |
| V3 migration suite | 0010–0016 each additive, idempotent and reversible; the chain applies to a fresh `schema.sql` |
| M6 performance suite | **9/9**: goal creation scope; visibility per relation and 404 for private goals; progress history, completion at 100 and read-only relations; a moved report's private goals leaving the old manager at once; HR-only, validated cycles opening for the working people in scope; nobody outside a review reading it and drafts staying private; self first; ratings bounded; submitted text immutable; lists without content; HR reads audited and no words or ratings in the audit; HR writing only for someone without a manager; a moved report's review changing hands; closing stopping writes |
| Backend full laboratory suite | **528 pass, 0 fail, 0 skipped** (+10: performance 9, migration suite 1) |
| Frontend typecheck, Oxlint (0 warnings), production build | pass |
| Initial JS | 351.04 kB (gzip 113.72 kB), 144 chunks: +2.94 kB over M5 for navigation and routes; every goal and review page is its own chunk |
| M6 browser smoke on the V3 demo stack | **40/40**, no page errors: the employee's Action Center, goals, progress and history, a completed and an open review, draft then submitted self-review; peer and coworker goal visibility and review 404s; the manager's Action Center, team reviews, a submitted manager review, team goals and setting one; HR's cycles, audited review reading, drafting and opening a cycle for one department; 390 light and 375 dark with no overflow |
| V2 navigation gate on the V3 bundle | **51/51**: the admin sidebar now has 14 destinations with Performance |
| Source fingerprint (14 September) | V2 business data, orphans and ledger as recorded after 0016, plus one audit entry: a successful administrator sign-in at 00:56:38 UTC on 14 September made through the source app; goal and review tables empty on source |

Recorded:

- **A V2 export test that could match a timestamp.** The first full run failed "employees
  must not contain 20.0". The suite looked for the fixture's GPS accuracy (12.5) and
  distance (20.0) as plain substrings, which ordinary values can contain. It passed twice
  on its own. The two short numbers are now checked as whole CSV cells, while coordinates
  and column words stay as substring checks. My first version also forbade a bare "20"
  cell, which an audit-log cell legitimately held; that was removed.
- **The teardown race again.** One full run failed at file level for the migration suite
  after all its checks passed ("terminating connection due to administrator command" when
  the clone was dropped). The suite passed 15/15 on its own and the next full run was
  clean. The harness fix is still planned for M9.
- **Defects found before release.** The typecheck caught an icon prop the Alert component
  does not accept. Screenshot review caught the progress slider collapsing to a dot, because
  the number field's full-width style won; it now has a fixed-width wrapper. The smoke
  script's rating click was ambiguous where a rating label already showed the same words;
  it is scoped to the form.

M6 status: **complete.**

## M7 — Attendance, leave & payroll V3 (14 September 2026)

No migration: M7 builds on 0010–0016 and V2's tables.

Delivered:

- **Leave preview from the company's own week.** The request form reads
  `/api/company/calendar-config` and counts working days exactly as the server does at
  submission, naming the working week (for example Mon–Fri) and any company holiday in the
  range, and saying that a holiday inside a range is still counted. A range with no working
  days says so. This resolves V2's first known limitation (master §20.1).
- **Cancellation by the company's today.** "Cancel" appears only for leave starting after
  the company's date in its timezone, the rule the server applies, not the browser's clock
  or UTC date (master §20.2).
- **Attendance follow-ups for HR.** The Action Center lists each of the last seven days
  with missing check-outs, linking to Attendance. Only working employees' records count, so
  the five protected orphan rows never appear. Managers and employees do not get these
  items, and nothing carries coordinates.
- **Payroll state and the paid notification.** The period header shows when it was
  calculated, reviewed, approved and paid. Marking a period paid tells each eligible
  payslip holder once ("Your pay for August 2026 has been paid", no amount, linking to
  their payslips). No money, state machine, snapshot or immutability rule changed.
- **Decisions** (see the log): holidays stay counted in leave, as in V2; no employee
  self-service attendance correction; statutory automation intentionally excluded under
  master §21.
- **Demo**: the Malaysia Day announcement no longer claims a holiday does not use leave.

Verification:

| Check | Result |
| --- | --- |
| Backend typecheck (source and tests) | pass |
| M7 attendance, leave and payroll suite | **7/7**: an employee reads the working week, holidays and today but no coordinates or other settings, and full settings stay HR-only; a week with a holiday is charged 5 working days and a weekend-only range is refused as `no_working_days`; leave starting on the company's today cannot be cancelled and leave starting tomorrow can; HR's missing check-out item counts only working employees and never reaches a manager or employee; team attendance carries no coordinates, accuracy or distance; the paid notification reaches only eligible payslip holders, once, with no amount; the five orphans remain |
| Backend full laboratory suite | **535 pass, 0 fail, 0 skipped** (+7), first run clean |
| Frontend typecheck, Oxlint (0 warnings), production build | pass |
| Initial JS | 351.18 kB (gzip 113.72 kB), 144 chunks: +0.14 kB over M6 |
| M7 browser smoke on the V3 demo stack | **19/19**, no page errors: a 15–18 September preview of 4 working days naming Malaysia Day; a weekend range at 0; the server charging the same 4 days; Cancel shown for future leave and not for past leave; the corrected announcement; HR's missing check-out items opening Attendance without coordinates; approved stamps, Mark paid and the paid stamp; the employee's single paid notification with no amount and the payslip shown as paid; no HR items for a manager; 390 dark with no overflow |
| V2 navigation gate on the V3 bundle | **51/51** |
| Source fingerprint (14 September) | identical to the post-0016 record except audit entry 26, the administrator sign-in at 00:56:38 UTC already recorded in M6; no entry since |

M7 status: **complete.**

## M8 — Analytics, reports, export & settings (14 September 2026)

No migration.

Delivered:

- **Company analytics** `GET /api/analytics/company` (HR): onboarding and offboarding in
  progress, overdue tasks, each plan in progress with tasks finished (done or skipped),
  completions in the last 90 company days; goal counts for working employees; progress of
  every opened review cycle (open first, drafts never); recognition by category and how
  many working employees received any, hidden recognition excluded.
- **Team analytics** `GET /api/analytics/team` (current managers): the same kinds of count
  for current working reports, plus approved leave days by type this year, with private
  recognition excluded and no names in the response.
- **Reports**: Onboarding, Performance and Recognition tabs; plans and cycles open their
  own pages. **My team**: a Team insights card with goals, open reviews by visible cycle
  name, leave taken by type and recognition, linking to Team reviews, leave and goals.
- **Export**: ten V3 datasets (reporting lines, company holidays, company events,
  announcements, lifecycle plans, lifecycle tasks, recognition, goals, review cycles,
  review participation) under the existing authorisation, size ceiling, injection
  protection and audit, with the exclusions in the decisions log.
- **Settings**: reviewed against master §24; nothing added (see the log). Holidays gain
  an export and further tests.

Verification:

| Check | Result |
| --- | --- |
| Backend typecheck (source and tests) | pass |
| M8 analytics and export suite | **7/7** (`analytics-export.integration.test.ts`): company figures equal hand counts for plans, overdue and skipped tasks, the 90-day window's first and last days, goals of former employees, cycle order and drafts, and hidden recognition; company analytics refused to managers and employees; team figures for current working reports only, with private recognition and every name and private word absent; a report who moves leaves the figures on the next request; HR without reports has no team; every export dataset free of eight private markers, with titles, public words and participation status present and no content columns; exports refused to employees and managers; holiday validation, duplicate date, stale revision, removal and export |
| Backend full laboratory suite | **543 pass, 0 fail, 0 skipped** (+8), first run clean |
| Frontend typecheck, Oxlint (0 warnings), production build | pass |
| Initial JS | 351.29 kB (gzip 113.76 kB), 146 chunks: +0.11 kB over M7; the analytics panels load with the Reports and My team chunks |
| M8 browser smoke on the V3 demo stack | **30/30**, no page errors: each tab's figures equal the API's, every plan listed with its task counts, plan and cycle drill-down, the V2 Workforce report unchanged, the V3 datasets offered with their exclusions and no content columns; Team insights equal to the team API with visible cycle names and drill-down; managers refused company analytics; employees refused both and export; 390 and 375 dark with no overflow |
| V2 navigation gate on the V3 bundle | **51/51** |
| Source fingerprint (14 September) | V2 business data, orphans and ledger identical to the M7 reading, plus audit entry 27: a CSV `DATA_EXPORTED` by an administrator at 01:29:05 UTC. It came through the source app. Source Postgres is reachable only on the compose network, every laboratory run and the demo API use the isolated lab network, and nothing in this work called the source API. A CSV export reads data and changes none |

Recorded:

- **A defect found in screenshot review.** Team insights drew each open cycle's progress
  bar with the cycle name only in the bar's accessible title, so a manager could not see
  which cycle it was. The name and managers' due date are now visible, and the smoke
  checks visibility rather than text presence.

M8 status: **complete.**

## M9 — Mobile, performance, security & accessibility hardening (14 September 2026)

No migration.

Delivered:

- **Security matrix** `security-matrix.integration.test.ts`: master §37 as one suite over
  one company (a manager with two reports, an outsider, a resigned employee with an
  active account, an account deactivated after its token was issued, and two
  administrators). Payroll, leave, goals and reviews are created through the API. Rows:
  an employee's own data; a coworker's social profile without sensitive fields, private
  thanks or leave reasons; 25 manager and HR endpoints refused; another person's payslip,
  review, leave, goal and plan refused; direct API writes around the UI refused; the
  manager's team layer without pay or personal fields; outsiders refused; pay and HR data
  refused; valid leave and review decisions; HR workflows; six sensitive actions audited
  with no private words in the audit; per-request eligibility for a deactivated
  administrator; deactivated, resigned and forged-claim tokens refused; search,
  notification counts and titles, deep links and Action Center items bounded to scope; a
  stale reporting line losing access on the next request.
- **Bundle**: vendor chunks for React, the router and axios; the search palette loads on
  first use; `npm run check:bundle` asserts lazy pages, the vendor chunks and a 380 kB
  (125 kB gzip) budget for the first visit.
- **Accessibility**: a WCAG 2.2 AA gate over 41 routes for three roles plus the sign-in
  page, the search palette, the notification panel and a dialog, at 1280 and 390 in
  light and dark; keyboard checks for sign-in, the palette, the bell and dialogs.
- **Fixes**: every dialog now spaces its body from its heading in one place; calendar days
  from other months no longer fade below contrast minimums; the palette's scrolling
  results are keyboard-reachable.
- **Harness**: a lab clone is dropped only once it has no other sessions (up to five
  seconds), which removes the intermittent "terminating connection due to administrator
  command" failure recorded since V2.

Verification:

| Check | Result |
| --- | --- |
| Backend typecheck (source and tests) | pass |
| Security matrix suite | **18/18** |
| Backend full laboratory suite | **562 pass, 0 fail, 0 skipped** (+19); two consecutive full runs with the teardown fix (543, then 562 with the matrix) had no teardown failure |
| Frontend typecheck, Oxlint (0 warnings), production build, `check:bundle` | pass |
| Initial JS | **347.25 kB (gzip 113.00 kB)** in eight files, 152 chunks, down 4.04 kB from M8; V2's entry alone was 569.69 kB (161.75 kB gzip) |
| Endpoint timings on the demo company | median 2–6 ms: company analytics 3, Action Center 4 (HR) / 6 (manager, employee), search 2, team analytics 4, calendar 2, directory 2 |
| Accessibility gate | **200 axe scans, 0 WCAG 2.2 AA violations**; keyboard 12/12. The first run found calendar contrast (2.31–2.69:1 on out-of-month days) and a keyboard-unreachable scrolling region in the palette; both fixed. An arrow-key check that used a one-result query was corrected |
| Visual review | dialog spacing, the palette, the leave decision sheet and the calendar at 1280 light and 390 dark, reviewed by eye; 4/4 automated checks |
| Regression on fresh demo data | M3 smoke **59/59** (the first rerun failed one check that hard-coded "2 unread" from M3's data; later milestones' demo notifications make it 3, and the check now compares with the server's count), M6 smoke **40/40**, V2 navigation gate **51/51** |
| Security matrix expectations corrected, not the product | the fixture had Cole give the private thank-you he was then forbidden to see (the giver may see it; the giver is now another employee, and the receiver's manager is checked too); the manager's leave reason and the 404 for a non-report's leave are the documented design |

Source integrity, 14 September. V2 business data, the orphans, the ledger 0001–0016
and every V3 table (all empty) are as recorded, with two changes this work did not make:

- **Audit entries 28–33**, read without actor details: source user 1 signed in at 01:35:54
  UTC, signed out, one sign-in failed, two `PAYROLL_CALCULATED` actions ran on period 1 at
  01:38:45 and 01:38:51, and user 1 signed in again at 02:02:16.
- **The September 2026 payroll period is now `calculated`** (calculated at 01:38:51 UTC),
  no longer `draft`. It has no payroll records, because source holds no compensation, so
  no money was produced.

Nothing in this execution reaches source: laboratory runs and the demo API are on the
isolated lab network, every script targets the demo ports, and the source frontend and
backend logged no requests from them. The change came through the source application
under source user 1's own session. It has **not** been reverted: changing that period
outside the normal workflow is a master §44 stop condition. It is carried to the release
report for the owner to confirm.

M9 status: **complete.**

## M10 — Complete demo, final QA & release (14 September 2026)

No migration.

Delivered:

- **Demo company settings**: the guarded seed gives the demo company Asia/Kuala_Lumpur,
  Monday to Friday, 09:00 to 18:00 and an office location with a 150 m radius, only when
  settings were never configured, so verified attendance can be demonstrated.
- **A defect found by the final laboratory run, fixed.** The lifecycle, goal and review
  handlers answered before their transaction committed, so a client could be told a
  change was done before it could read it, and a failed COMMIT would have followed a
  success response. It surfaced once as a goal-completion notification missing when read
  back while the laboratory server was also restoring the release backup. The suite
  passed alone twice. Sixteen handlers now record their reply and the helper sends it
  after COMMIT, and `transaction-replies.test.ts` guards the shape. The calendar handlers
  already committed first.
- **Documentation** (master §41): the README describes V3 by role;
  `HR_NEXUS_V3_RELEASE.md` gives every gate, command and checksum and the human-only tag;
  `HR_NEXUS_V3_DEMO.md` describes the demo company; the architecture states the
  reply-after-commit rule.

Final gates:

| Gate | Result |
| --- | --- |
| Backend full laboratory suite | **564 pass, 0 fail, 0 skipped**, no teardown failure. The run before the fix: 560/562 (the defect above) |
| Backend type-check (source and tests), `npm test` guard | pass; transaction-replies 2/2 |
| Frontend typecheck, Oxlint (0 warnings), production build, `check:bundle` | pass; initial JS 347.25 kB (gzip 113.00 kB), 152 chunks |
| Visual gate (master §38) | **408 rendered pages** (29 admin, 18 manager, 18 employee and 2 anonymous routes at 1280, 390 and 375 in light and dark, and System dark and light at 390) plus the account menu, the More sheet and two dialogs at 375 and four permission redirects: no overflow, duplicate heading, bottom-navigation overlap, stuck loading, error state or page error. 411 screenshots; a sample across roles, widths and themes reviewed by eye with no defect |
| Workflow gate (master §39), each on a freshly rebuilt demo | M1 **49/49**, M2 **39/39**, M3 **59/59**, M4 **41/41**, M5 **28/28**, M6 **40/40**, M7 **19/19**, M8 **30/30**, attendance verification **15/15** |
| Accessibility (M9) | 200 axe scans with no WCAG 2.2 AA violation; keyboard 12/12 |
| Security matrix (master §37) | 18/18 inside the full suite |

The workflow gate maps to master §39 as follows: organisation data and reporting lines
(M1); a coworker's social profile, protected data refused by direct API and the org chart
(M2); announcement audience, notification deep links, Action Center resolution and who's
out (M3); onboarding and offboarding with history kept and safe deactivation (M4);
recognition visibility (M5); goals and self then manager reviews (M6); leave by working
week and company date and payroll guarantees (M7); analytics from real data and export
exclusions (M8); verified attendance (the attendance check: HR-only codes, missing code,
missing location, a forged code, a distant and an imprecise location all refused with no
record written; a verified check-in; a duplicate refused; no coordinates for the manager;
coordinates only on HR's record, as designed).

The attendance check first ran at 13/15 because of two mistakes in the check itself: it
read the verification fields at the top level instead of under `verification`, and it
expected HR's record to omit coordinates, which the architecture gives HR by design.

Source integrity (master §40), read-only:

| Item | State |
| --- | --- |
| Ledger | 0001–0016, V3 checksums as in the release procedure |
| Base tables | 34 (V2's 18 and V3's 16); every V3 table empty |
| Employees / accounts / attendance | 1 / 2 / 5 |
| Historical orphans | `1:1,3:1,4:2,5:1,6:1`, row digest unchanged |
| Accounts flagged for a password change | 0 |
| September 2026 payroll period | **`calculated`** since 01:38:51 UTC on 14 September, by source user 1 through the source application (audit entries 31–32); no payroll records. Not caused or reverted by this work; confirmed by the owner as an authorized action (below) |
| Audit events | 33; entries 24–33 are the owner's own sign-ins, an export and the recalculation |
| Release backup | `.local-backups/v3-release-20260914/hr_nexus_v3_release.dump`, 191,857 bytes, SHA-256 `a90ed5bfff94d60a6784058504c713e50057c07aaad73c342a7fdcfd4f7a6dc7`; restored into an isolated laboratory database and matched source in every digest and the ledger; source unchanged across the dump |
| Final fingerprint | identical to the reading taken with the release backup |
| Isolation | application database and backend on `hr-nexus_default` only; laboratory and demo API on `hr-nexus-v2-migration-lab` |
| Docker volume | `hr-nexus_postgres_data`, created 7 August 2026, never removed |
| Repository | clean except the protected untracked `HR_NEXUS_V2_MASTER.md` and `docs/schema.dbml`; `database/` unchanged since `v2.0.0-rc1`; V3 adds migrations 0010–0016 |

The first release report was **NOT READY** on one item only: the protected baseline
expected the September 2026 payroll period to remain `draft`, and it had been recalculated
through the source application.

Owner confirmation, 14 September. The owner confirmed they intentionally recalculated the
September 2026 period through the source application, that the `calculated` state is an
authorized user action and the current source baseline, and that it must not be reverted.
The final integrity assessment was re-run read-only against source:

| Item | State |
| --- | --- |
| Business-data fingerprint | identical to the reading taken with the release backup, in every V2 digest, the orphan rows, the September 2026 state, the flagged-account count and the sequences |
| September 2026 payroll period | `calculated`, last changed 01:38:51 UTC; payroll records, items and compensation all 0 |
| Audit events | 33; entry 33 (the owner's sign-in at 02:02:16 UTC) is still the latest, so nothing has happened on source since the backup |
| Ledger | 0001–0016, V3 checksums unchanged |
| Base tables | 34; every V3 table still empty |
| Release backup | present, SHA-256 unchanged (`a90ed5bf…6dc7`), so it captures the accepted baseline |
| Isolation, volume, repository, tags | unchanged: networks as above, volume created 7 August 2026, clean tree apart from the two protected untracked files, only `v2.0.0-rc1` locally and on `origin` |

M10 status: **complete.** Every engineering gate passes and no blocker remains. The release
report is **READY FOR v3.0.0**. The `v3.0.0` tag has not been created; tagging is left to a
person (see the release procedure).

## Attendance correction integrity (15 September 2026)

This follows the read-only attendance integrity audit at `c7e6840`. The design is in architecture §12 and the decision is in the log above. The audit's findings describe the system *before* this change and are not rewritten.

What changed:
- **Reason.** HR corrections need a 5–300 character reason, validated by the server and stored as the record's note.
- **Evidence.** The service locks the row and applies the change. It writes `ATTENDANCE_CORRECTED` with before/after values for changed fields only, through the new `recordRequiredAudit`, in the same transaction. A failed audit insert therefore rolls the correction back.
- **No-op corrections.** A correction that changes no value is refused.
- **Corrected scans.** A corrected QR record keeps `QR_LOCATION` as its origin, moves from `verified` to `manual`, and exposes `correctedByHr`. HR, the employee and the manager all see "Corrected by HR". The employee's Today card also stops showing "Verified with the office QR code" on a corrected, finished day.
- **The form** sends only the values HR changed.

No migration was needed. Clock-in, clock-out, QR, geofence and authorisation are unchanged.

Verification ran on the isolated laboratory and V3 demo stack only, with a freshly rebuilt demo before each browser smoke and before the gates:

| Check | Result |
| --- | --- |
| Backend type-check (source and tests) | pass |
| Backend full laboratory suite | **570 pass, 0 fail, 0 skipped**. It includes the attendance suite, 25/25, whose new tests check that: a missing, empty, whitespace-only, too-short, too-long or non-text reason is refused; before/after, reason and actor are in the audit entry; unchanged fields are not reported; a second correction diffs from the corrected values; a no-op or reason-only correction is refused with no entry; employees and a real manager get 403; a failed audit insert leaves the record and log untouched, and the retry then succeeds; HR, employee and manager each see the record as corrected; the manager sees no reason or coordinates |
| Database-free unit tests (attendance verification, authorisation, audit redaction) | 71/71 |
| Frontend typecheck, Oxlint (0 findings), production build, `check:bundle` | pass; initial JS 352.96 kB (gzip 115.11 kB) |
| Attendance verification browser smoke | 15/15 |
| Correction browser smoke (`c1-correction.mjs`) | **25/25**, below |
| M1 smoke (manager team attendance) | 51/51, on the implementation before the Today-card caption fix |
| Accessibility gate | 17/17; no WCAG 2.2 AA violation across 252 axe scans |
| Visual gate | 2/2; 676 rendered pages and overlays |
| Employee Home | 46/46, on the implementation before the caption fix; Home does not use the changed card |

What the correction smoke checks:
- **API:** a missing or whitespace-only reason is refused, as are the employee and their manager.
- **Form:** it explains the verified notice and requires the reason.
- **HR's list:** it shows "Corrected by HR · Originally QR + location" and the reason, while an untouched scan still reads "QR + location".
- **Audit page:** it shows "empty → 23:59:00", "verified → manual" and "no → yes", and does not list unchanged fields.
- **Employee:** they see "corrected by HR", the reason as the note, no audit detail and no QR caption, and Home does not say verified.
- **Manager:** they see "Corrected by HR" with no reason or coordinates.
- **Layout and accessibility:** the dialog fits at 375 px dark, and axe finds no violation on any of these surfaces.

The first full run passed every gate except the correction smoke, which scored 23/24. The failure was in the check, not the product: it treated any "→" as audit detail, but the employee's history has always separated check-in and check-out times with one. The check now looks for the audit log's own labels. The same review found that a corrected, finished day still showed "Verified with the office QR code" under "Done for today". That caption is now hidden in that case, and a check was added for it. Frontend checks, both attendance smokes, the accessibility gate and the visual gate were then re-run on the new bundle, with the results above. The backend was unchanged by the fix, so its suite was not repeated.

Source integrity, read-only fingerprints taken at 13:44 before the gates and at 14:54 after them:

| Item | State |
| --- | --- |
| Attendance | 5 rows, digest unchanged; no `ATTENDANCE_CORRECTED` event exists on source |
| Historical orphans | `1:1,3:1,4:2,5:1,6:1`, row digest unchanged |
| September 2026 payroll period | `calculated` |
| Audit events | 69 → 73: sign-outs and sign-ins through the source application, 05:52–06:00 UTC |
| Employees | 1 row; updated at 05:50 UTC, inside a source-application session. Not caused by this work: every test targeted the lab or the demo API, whose database is `hr_nexus_v3_demo` on the laboratory server |
| Leave-entitlement sequence | 324 → 380 from the existing insert-if-absent on source page loads; no row added |

The `v3.0.0` tag has not been created.

Still not claimed: GPS spoof detection, device binding, IP checks and biometric checks do not exist. QR plus geofence is not proof of physical presence against a determined attacker.

## Final UI enhancement — Workflows centring, personalised Home and Smart Widget Stacks (15–16 September 2026)

The design is in architecture §13 and the UI record in `HR_NEXUS_V3_UI_UX.md`. No demo or presentation
company data was created in this pass. Verification ran on the isolated laboratory and the V3 demo
stack only, with the demo rebuilt before each browser smoke and between gate groups:

| Check | Result |
| --- | --- |
| Frontend typecheck, Oxlint, production build, `check:bundle` | pass; 0 lint findings; initial JS **353.37 kB (gzip 115.27 kB)** against the 380 kB / 125 kB budget. The canvas, the gallery and the four widget groups are separate lazy chunks |
| Backend typecheck (source and tests) | pass |
| Backend full laboratory suite | **586 pass, 0 fail, 0 skipped**, including the 7 offline layout tests and the 8 layout laboratory tests |
| Personalised Home smoke (`d1-dashboard.mjs`) | **65/65**, below |
| HR Home (`u3-home`) | 45/45, byte-identical to the run before this pass |
| Employee and manager Home (`u4-home`) | 46/46, byte-identical |
| Navigation and gates (`navgate-v3`) | 64/64, byte-identical |
| Shell (`u2-shell`) | 132/132, byte-identical |
| Approved reference comparison (`u9-compare`) | pass. The Today and My tasks cards are 42 px taller than in yesterday's run because 16 September is Malaysia Day in the demo calendar, so the card carries one more line; every other measurement is unchanged |
| Accessibility gate (`m9-a11y`) | 17/17; no WCAG 2.2 AA violation across 252 axe scans |
| Visual gate (`m10-visual`) | 2/2; 676 rendered pages and overlays |

What the personalised-Home smoke checks, at 1536, 1280, 1024, 834, 390 and 375 px in light, dark
and System:
- **Default first:** HR's, a manager's and an employee's default Homes are unchanged; Edit dashboard
  shares the greeting's line and height; with the layout API unavailable or failing, Home is the
  default and offers no editing at all.
- **Workflows centring:** Onboarding, Offboarding, Performance and the Action Center share one
  centred container, header and tabs included, across 72 rendered pages.
- **Gallery:** search takes focus, categories filter, the preview renders the account's own data,
  and no widget an account may not open is offered.
- **Editing:** add, remove, resize, reorder by pointer with a dashed placeholder at the drop
  position, reorder by keyboard, cancel, Done, and Reset to default returning the exact default.
- **Persistence:** a layout survives a reload and follows the account to another browser and
  sign-in; HR's layout does not reach the employee; only presentation keys are stored.
- **Stacks:** create, add, reorder, take out, unstack without losing widgets, manual cycling by
  button and arrow key with announcements, smart ordering off keeping the manual order, and a
  reason shown only where a rule fired.
- **Accessibility:** no WCAG 2.2 AA violation across 9 axe scans of edit mode, the gallery, the
  stack editor and personalised Homes.

Two findings from the first full run were fixed and re-verified: a pointer drag did not commit
because reordering during the drag moved the handle's node and cancelled pointer capture (the drag
is now tracked on the window, with the DOM order held stable until the drop), and the edit
toolbar's buttons were below the 44 px touch size on a phone.

Source integrity, read-only fingerprints taken before and after the gate run:

| Item | State |
| --- | --- |
| Migration ledger | 16 rows, latest `0016`. **0017 is not applied to the application database** |
| `user_dashboard_layouts` | absent on source |
| Attendance | 5 rows, digest unchanged; rows `1:1,3:1,4:2,5:1,6:1` |
| September 2026 payroll period | `calculated` |
| Whole fingerprint | byte-identical before and after the gates |

The `v3.0.0` tag has not been created, and nothing has been pushed.
