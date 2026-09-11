# HR Nexus V3 architecture

Designed 11 September 2026 against `HR_NEXUS_V3_DEFINITIVE_MASTER_EXECUTION.md`, on
branch `feat/hr-nexus-v3` from the protected baseline `v2.0.0-rc1` (commit `2947aca`).
V2's architecture, design system, migration runner and security model are preserved
and extended; nothing here replaces them. Read `HR_NEXUS_V2_ARCHITECTURE.md` first.

## 1. What V3 adds, in one paragraph

V2 was two portals over one database: an administrator who manages the company and an
employee who manages themselves. V3 adds the relationships between people. Employees get
a reporting line, a company-visible professional profile, a directory and an org chart;
managers get a real, server-authorised team scope over their direct reports; and a
shared workplace layer (Action Center, notifications, search, calendar, announcements)
connects the three. Onboarding, offboarding, recognition, goals and performance reviews
sit on top of that structure. Every new capability is authorised in PostgreSQL-backed
policy code on every request; the frontend never decides what someone may see.

## 2. Roles, and why "manager" is a scope rather than a role

`users.role` stays exactly `admin | employee`. No migration touches the role CHECK.

**Manager is derived, not declared.** An employee-role account is a manager when the
employee it is linked to currently has at least one direct report in an eligible
employment status (`active` or `probation`). The session lookup that already runs on
every authenticated request (`findSessionUserById`) computes `isManager` from
`employees.manager_id` at that moment, exactly as it already reads
`must_change_password` from its column. Consequences, all deliberate:

- A manager relationship that is removed takes effect on the very next request. There
  is no stale claim to revoke, because the JWT never carried one.
- A "manager" whose last report leaves stops being a manager. That is the correct
  outcome, not an edge case.
- Manager never implies Admin/HR. Company-wide routes remain `authorizeRoles("admin")`.
- An administrator account may or may not be linked to an employee record (the schema
  and session rule already permit either). Self-service policies treat a linked admin as
  the employee they are; an unlinked admin has no social profile, gives no recognition
  and holds no goals, and the UI says so rather than pretending.

**Team scope** = the set of employees whose `manager_id` is the manager's employee id
*and* whose employment status is `active` or `probation`. It is recomputed by policy
code from the database for each authorisation decision. A former report is HR's
history, not the manager's team. Scope is direct reports only; the org chart lets anyone
traverse further, but traversal is read-only and social.

## 3. Authorisation model

All policy lives in `backend/src/auth/policy.ts` (M1) and is the only place a
"who may see what about whom" question is answered. Controllers call it; they do not
re-derive it. It is default-deny and reads current data.

```
relationTo(user, employeeId) -> "self" | "admin" | "manager" | "coworker" | null
```

- `self`     the session's own employee id
- `admin`    role admin (company-wide, audited where sensitive)
- `manager`  employeeId is in the session's team scope, right now
- `coworker` any other employee who is company-visible (status active or probation)
- `null`     the employee does not exist or is not visible to this session

Ordering matters: an admin who is also the manager of an employee is answered `admin`;
a manager looking at themselves is `self`.

Route guards (`backend/src/auth/guards.ts`):

- `authorizeRoles("admin")` — unchanged from V2, company-wide operations.
- `requireManager` — 403 unless `request.user.isManager`; the controller then filters by
  team scope through policy, so a manager cannot reach a non-team employee by id.
- `requireEmployeeRecord` — 403 for an account with no linked employee, on self-service
  routes that need one.

**Purpose-specific responses, never a filtered mega-object.** There is no endpoint that
returns "everything about an employee" with fields removed per role. Social data comes
from `/api/people/*`, the employee's own HR data from `/api/*/me`, a manager's team layer
from `/api/team/*`, and HR data from `/api/employees/*` and friends. The profile page
composes tabs from separate authorised calls, and the server tells the page which layers
the relation permits (`layers` on the profile response) so the page can avoid firing
requests it knows will be refused. A hidden tab is convenience; the refused request is
the control.

**Sensitive classes and where they are allowed to appear:**

| Class | Self | Manager (team) | Admin | Coworker |
| --- | --- | --- | --- | --- |
| Salary, compensation, payroll records, payslips | own | never | yes | never |
| Attendance coordinates, accuracy, distance | never on V3 surfaces (V2 own-record view unchanged) | never | existing admin attendance record only | never |
| Leave reason and leave type | own | yes | yes | never (calendar shows "Out") |
| Private review content and ratings | own self-review; manager review once submitted | their team's | yes, audited | never |
| Goal description and updates | own | team (visibility private/team) | yes | only when visibility is company |
| Personal contact: phone, address, DOB, emergency contact | own | never | yes | phone only when the employee opts in |
| Account state (email, active, forced change) | own email | never | yes | work email only |
| Onboarding/offboarding tasks | own tasks | team tasks assigned to them | all | never |

## 4. Social profile visibility matrix

`Directory → Profile → Manager → Team → Org chart → Profile` all render from the social
layer. The social layer is exactly this, no more:

| Field | Source | Company-visible |
| --- | --- | --- |
| Name, photo/initials | `employees` | yes |
| Job title, department | `employees`, `departments` | yes |
| Reporting manager (name, link) and direct reports | `employees.manager_id` | yes |
| Work email | `users.email` | yes (it is the work account) |
| Phone | `employees.phone` | only when `employee_profiles.share_phone` is true |
| About, skills | `employee_profiles` | yes |
| Join date and tenure | `employees.employment_date` | yes |
| Recognition received and given | `recognitions` with visibility `company` | yes |
| Company-visible timeline events | `employee_events` with visibility `company` | yes |
| Employment status | `employees` | shown only as "on probation" where relevant; inactive, resigned and terminated employees are not in the directory at all |

Never social: salary, payslips, attendance records, leave balances and requests, private
reviews, goals marked private, emergency contacts, address, date of birth, gender,
account flags, coordinates.

The **self** view adds the V2 self-service pages as tabs (attendance, leave, payslips)
plus goals, reviews, onboarding and recognition given. The **manager** view adds team
attendance, leave decisions, goals, reviews and onboarding tasks for that report. The
**admin** view adds a link to the HR record (`/admin/employees/:id`) and the management
layers.

## 5. Schema: the V3 migrations

All additive, all through the existing checksummed runner, numbered after `0009`. Each
file opens with a fail-closed preflight (refuses if any object it creates already exists,
or a table it depends on is missing), creates only new tables/columns/indexes/triggers,
touches no existing row, and is rehearsed on a restored copy before source. Identifier
columns follow the V2 convention (`INTEGER` references to `employees`/`users`, which
matches the source's INTEGER keys and is FK-compatible with the fresh schema's BIGINT
keys, as 0004–0008 already prove).

| Version | Milestone | Objects |
| --- | --- | --- |
| `0010_org_structure` | M1 | `employees.manager_id` (nullable, self-FK RESTRICT, `<> id`), index on `manager_id`, trigger `prevent_manager_cycle` (serialised by an advisory lock; walks the chain from the new manager and raises 23514 on a loop, bounded at 100 levels) |
| `0011_profiles_timeline` | M2 | `employee_profiles` (1:1 on employee: `about` ≤ 2000, `skills TEXT[]` ≤ 30 entries, `share_phone`), `employee_events` (append-only timeline: kind, visibility company/self/management, occurred_on, title, bounded `detail` JSONB ≤ 2 KB, source, actor) |
| `0012_notifications` | M3 | `notifications` (per user: kind, title, body, app-relative `link` validated by CHECK, entity, `dedupe_key` unique per user, `read_at`); indexes for unread listing and pruning |
| `0013_announcements_holidays` | M3 | `announcements` (title, body ≤ 5000, priority normal/important/urgent, audience company/department, status draft/published/archived, publish/expiry, authors), `announcement_reads` (user × announcement), `company_holidays` (date unique, name, active) |
| `0014_lifecycle` | M4 | `lifecycle_templates`, `lifecycle_template_tasks`, `lifecycle_plans` (kind onboarding/offboarding, one active plan per employee per kind, `exit_status` for offboarding), `lifecycle_tasks` (assignee role employee/manager/hr resolved to a user where one exists, due date, status pending/done/skipped, completion actor) |
| `0015_recognition` | M5 | `recognitions` (giver ≠ receiver, message 5–500, closed category list, visibility company/private, admin `hidden_at/hidden_by`) |
| `0016_goals_reviews` | M6 | `goals` (owner, title, description, dates, status active/completed/cancelled, progress 0–100, visibility private/team/company), `goal_updates` (history), `review_cycles` (period, self and manager due dates, status draft/open/closed), `review_participants` (cycle × employee, reviewer, self and manager summaries and 1–5 ratings, timestamps, status) |

Base tables: 18 → 33. No column type, constraint or row of a V2 table changes. Rollback
for each is drop-the-new-objects plus the ledger row, rehearsed alongside the apply.
Cycle prevention and one-active-plan rules are database constraints, not conventions.

Payroll money semantics are untouched: V3 adds no money column, changes no formula and
no trigger on the payroll tables.

## 6. Events, notifications and the Action Center

Three different things, deliberately kept apart:

1. **Audit** (`audit_events`, V2) — who did what, for investigation. Append-only,
   redacted. V3 extends the closed action list (roles/manager relationships, profile
   changes to sensitive fields, announcements, lifecycle, recognition moderation, goals,
   reviews, holidays). Never a notification and never a timeline.
2. **Timeline** (`employee_events`) — what happened *to an employee*, for people. Written
   inside the producing transaction by the services that already own the change
   (employee update, lifecycle completion, recognition, goal completion, review
   completion). Each row carries a visibility tier; the timeline endpoint filters by the
   viewer's relation. The "joined" entry is synthesised from `employment_date` so existing
   employees need no back-fill.
3. **Notifications** (`notifications`) — something a *user* should look at. Written by
   `notificationService.notify()` inside the producer's transaction, contained by a
   SAVEPOINT exactly like `recordAudit` so a notification failure never rolls back the
   business change. Targets are resolved server-side (an employee's user, the team's
   manager, every active admin, an announcement's audience). `dedupe_key` makes a repeat
   delivery a no-op. Text never carries salary, reasons or credentials; the link is an
   app-relative path the destination page authorises again. Retention: read notifications
   older than 90 days are pruned opportunistically when a user lists theirs.

Producers and their notifications:

| Event | Notified |
| --- | --- |
| Leave submitted | the employee's manager (if any), else every admin |
| Leave approved/rejected/cancelled by someone else | the employee |
| Payroll period approved | every employee with a record in it ("payslip published") |
| Announcement published | its audience |
| Lifecycle plan started / task assigned / task due soon | the assignee |
| Recognition given | the receiver |
| Goal created for you / goal updated by someone else | owner or manager respectively |
| Review cycle opened / self-review submitted / manager review submitted | participant, reviewer, participant |
| Manager assigned or changed | the employee and the new manager |

**Action Center is computed, not stored.** `GET /api/action-center` derives, from the
same tables the destination pages read, exactly the work the current session may act on:
pending leave in scope (manager: team; admin: company), lifecycle tasks assigned to me
(admins also see unassigned HR tasks), reviews awaiting my input, goals overdue that I
own, payroll periods awaiting the next transition (admin), and offboarding plans past
their target date (admin). It also lists "upcoming" (leave starting within 7 days, tasks
due within 7 days, review deadlines) and "recent" (the newest notifications). Resolving
the underlying record removes the item; there is no second source of truth to drift.

## 7. API route map

Existing V2 routers are unchanged except where marked. New routers are listed with their
guard.

| Router | Guard | Endpoints (V3) |
| --- | --- | --- |
| `/api/auth` | — | `me` now returns `isManager` and `capabilities` |
| `/api/profile` | employee record | `PUT /about` (about, skills, share_phone) |
| `/api/employees` | admin | `PUT /:id` accepts `manager_id`; `GET /:id` returns manager; `GET /lookup` unchanged |
| `/api/people` | any session | `GET /` directory (search, department, page); `GET /:id` social profile + relation + layers; `GET /:id/reports`; `GET /:id/timeline`; `GET /:id/recognition` |
| `/api/org` | any session | `GET /chart` (active employees, social fields, manager links, department) |
| `/api/team` | manager | `GET /` summary; `GET /members`; `GET /attendance?date`; `GET /availability?from&to`; `GET /leave`; `GET /goals`; `GET /reviews`; `GET /tasks` |
| `/api/leaves` | mixed | `PUT /:id/status` now admin **or** the employee's manager (never self); `GET /team` for managers |
| `/api/action-center` | any session | `GET /` |
| `/api/notifications` | any session | `GET /`, `PUT /:id/read`, `PUT /read-all` |
| `/api/search` | any session | `GET /?q=` people, departments, destinations, authorisation-filtered |
| `/api/calendar` | any session | `GET /?from&to` holidays, who's out (names and dates only unless self/manager/admin), company config (timezone, working week) |
| `/api/announcements` | mixed | `GET /` audience-filtered; `PUT /:id/read`; admin `POST/PUT/DELETE`, `POST /:id/publish`, `POST /:id/archive` |
| `/api/lifecycle` | mixed | admin templates and plans; `GET /me` for employees; `GET /tasks` (mine); `PUT /tasks/:id` complete/skip by assignee or admin; admin `POST /plans/:id/complete` (offboarding deactivates) |
| `/api/recognition` | employee record | `GET /` feed (company-visible); `POST /`; admin `PUT /:id/hide` |
| `/api/goals` | mixed | `GET /me`, `POST /me`, `PUT /:id`, `POST /:id/updates`; manager `GET /team`, `POST /team/:employeeId`; admin `GET /` |
| `/api/reviews` | mixed | admin cycles CRUD, open/close; `GET /me`; `PUT /participants/:id/self`; manager `PUT /participants/:id/manager`; admin `GET /cycles/:id/participants` |
| `/api/settings` | admin | `GET/PUT` unchanged; `GET/POST/PUT/DELETE /holidays` |
| `/api/company` | any session | `GET /calendar-config` timezone, working days, holidays — the safe exposure Leave V3 needs |
| `/api/analytics` | admin / manager | `GET /company/*` (admin), `GET /team/*` (manager) |
| `/api/export` | admin | new datasets: reporting lines, holidays, announcements, lifecycle, recognition, goals, review participation (status only, no content) |

Every list endpoint is bounded (page size ≤ 100) and sorted by a stable key. Every id
is parsed as a positive safe integer before SQL. Every write is a single transaction.

## 8. Frontend module map

Shared pages sit under neutral paths because every role uses them. `ProtectedRoute`
gains a `requires` prop (`"admin" | "manager" | "employee-record"`) alongside
`allowedRoles`; navigation is built from the session's capabilities rather than from the
role alone.

| Area | Routes | Who |
| --- | --- | --- |
| Workplace | `/actions`, `/people`, `/people/:id`, `/org`, `/calendar`, `/announcements`, `/notifications` | everyone |
| Me | `/employee/dashboard`, `/attendance`, `/leave`, `/payroll`, `/profile`, `/goals`, `/reviews`, `/onboarding`, `/recognition` | employee record |
| Team | `/team`, `/team/attendance`, `/team/leave`, `/team/goals`, `/team/reviews`, `/team/onboarding` | manager |
| Company | existing `/admin/*` plus `/admin/announcements`, `/admin/onboarding`, `/admin/offboarding`, `/admin/performance`, `/admin/analytics`, holidays inside `/admin/settings` | admin |

Global search is a header command palette (keyboard `⌘K`/`Ctrl+K`), not a route.
Navigation renders in sections (Workplace, Me, Team, Company); the phone bottom bar keeps
four direct slots plus More, chosen per capability set. Every route is lazy-loaded; the
shell, auth and design primitives stay in the entry chunk.

## 9. Performance

V2's entry chunk was 569.69 kB (161.75 kB gzip), over Vite's 500 kB advisory. V3 loads
every page component with `React.lazy` behind one route-level fallback (M0), so adding
twenty pages grows the number of chunks rather than the entry. M9 finishes the job with
vendor chunking and measured query review; the release report states before/after
numbers from `vite build`.

## 10. Security assumptions carried forward

- JWT in `localStorage`, HS256, 8-hour expiry, no revocation list (V2, unchanged, stated).
- Authorisation is server-side and per request; the frontend hides, the server refuses.
- Profile photos remain public static files (V2). No V3 feature stores private files.
- The application connects as the database owner, so append-only and immutability rules
  are triggers, not privileges (V2 pattern, reused for the timeline).
- No external email or push. Notifications are in-app only. Adding delivery channels
  is out of scope and would need its own privacy decision.

## 11. Intentionally unsupported in V3

- Automated EPF/SOCSO/EIS/PCB (decided under master §21 in M7 — see the plan).
- Indirect (transitive) manager scope for decisions. The org chart is browsable; the
  scope that decides leave and reads team data is direct reports only.
- Multi-company tenancy, document storage, external identity providers, self sign-up,
  password reset by email, WebSockets. None is required for the product to be complete
  and each would widen the security surface for no approved requirement.
