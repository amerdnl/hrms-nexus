# HR Nexus V3 — Presentation environment

Meridian Digital Solutions Sdn. Bhd., the fictional company the walkthrough is given on. It is
an **isolated environment**: its own database on the laboratory server, its own API container and
its own served bundle. The application database is never involved.

## 1. The company

| | |
| --- | --- |
| Name | Meridian Digital Solutions Sdn. Bhd. ("Meridian Digital") |
| Where | Kuala Lumpur, Malaysia |
| Time zone | `Asia/Kuala_Lumpur` |
| Currency | MYR, shown as RM |
| Working week | Monday to Friday, 09:00–18:00, 15 minutes' grace |
| People | 34 employees across 7 departments, 4 levels deep |
| History | Attendance from about four months back, two paid payroll months, an open review cycle |

Everything is invented. Email addresses use `.invalid`, which RFC 2606 reserves so it can never
reach a real mailbox, and no name, salary, address or telephone number belongs to a real person.

**Departments** — Leadership (1), Engineering (11), Product & Design (5), People & Culture (4),
Finance (4), Sales & Partnerships (5), Operations & Customer Success (4).

**Hierarchy** — the managing director; six department heads reporting to him; five managers and
team leads; and the individual contributors. The reporting lines are acyclic, and the platform
engineering manager has five direct reports, which is what makes the manager walkthrough real.

## 2. Where it lives

| | |
| --- | --- |
| Database | `hr_nexus_v3_presentation` on the isolated laboratory server `hr-nexus-v2-migration-lab` |
| API | container `hr-nexus-v3-presentation-api`, host port **5019** |
| Bundle | served on host port **5191**, built with `VITE_API_BASE_URL=http://localhost:5019/api` |
| Migrations | the full chain `0001`–`0017`, including `0017_dashboard_layouts` |

The application database `hr_nexus` sits on the compose network, ends at migration `0016`, and has
no `user_dashboard_layouts` table. Nothing in this environment touches it.

## 3. Rebuilding it

```bash
PRESENTATION_PASSWORD='<the demo password>' scripts/presentation-reset.sh
```

That is the only supported way to restore the baseline, and it is safe to run between rehearsals.
Before it drops anything it proves the target: the server must be the laboratory container and not
the application's, the database must be named `hr_nexus_v3_presentation`, and that server must not
hold a database called `hr_nexus`. It then recreates the database from `database/schema.sql`,
applies the migration chain, seeds the company, and restarts the API container.

The seeder refuses the wrong target as well: it reads `PRESENTATION_DATABASE_URL` and never
`DATABASE_URL`, `--database` must match the database it actually connected to, it stops if that is
the application's configured database, and every row it writes is confined to identifiers
9200–9299 inside one transaction that is checked before it commits.

## 4. How the data is built

`backend/src/database/presentationData.ts` describes the company; `seedPresentation.ts` writes it.
The description is separate from the loader so the content can be reviewed without reading SQL.

**Dates.** Only genuinely fixed history is written as a calendar date: employment dates, the 2026
public holidays, the July and August payroll months. Everything a viewer reads as "now" is derived
from the company's own today in `Asia/Kuala_Lumpur` — leave that is ahead, work that is overdue,
announcements, the review cycle, the offboarding, and today's attendance. Rebuilding on another
day produces a company that is coherent on that day. Within a day it is deterministic, because the
only variation comes from a generator seeded with the date.

**Today's attendance** follows the clock: whoever would have arrived by now has arrived, nobody has
a check-out time before they would have left, and people on approved leave are on leave rather than
missing. On a public holiday there is no attendance at all, which is correct rather than empty.

**Verification is never faked.** Seeded history carries no verification method or status, so the
product reads it as a record that predates verification. Nothing claims a QR and location scan that
never happened, and attendance security is untouched.

`--today YYYY-MM-DD` exists for rehearsal only: it lets a working-day state be proved on a day that
is a public holiday. The presentation itself never uses it.

## 5. The Malaysian calendar

The company calendar holds Kuala Lumpur's 23 gazetted 2026 public-holiday dates, including the
substitute days that follow a holiday falling on a weekend.

- **Sources:** publicholidays.com.my (Kuala Lumpur, 2026), cross-checked against
  malaysiapublicholiday.my (Kuala Lumpur, 2026). Both were read on 16 September 2026 and agree on
  every gazetted date; the substitute days come from the first.
- **Assumption:** 1 February 2026 is both Thaipusam and Federal Territory Day. The product holds one
  holiday per date, so that day is one row naming both, with their substitutes on 2 and 3 February.
- **No new feature:** these are rows in the existing company calendar. Nothing here adds a
  holiday engine, and Smart Stacks read the same calendar as everything else.

Leave counting, attendance expectations and Who's Out all use that calendar, so a request spanning
a holiday counts the holiday out, and there is no attendance on a holiday or a weekend.

## 6. The three sign-ins

All three use the password supplied as `PRESENTATION_PASSWORD` when the environment is built. Only
its bcrypt hash is stored, and the password is never written to the repository.

| Account | Who | What it shows |
| --- | --- | --- |
| `hr.admin@meridian-demo.invalid` | HR administrator, not linked to an employee | the company-wide view: Home, People, profiles, the org chart, Workflows, attendance, leave, payroll, reports and the audit log. Starts on the **approved default Home**, so dashboard editing can be shown from the beginning |
| `nur.hidayah@meridian-demo.invalid` | Nur Hidayah binti Roslan, Engineering Manager, Platform | the manager layer: five direct reports, team attendance, two leave decisions waiting, reviews to write. Starts on a **prepared personalised Home** with a Smart Stack |
| `kar.wai@meridian-demo.invalid` | Chong Kar Wai, Software Engineer | self-service: attendance, leave balance and history, payslip, tasks, goals, recognition and company updates. Reports to the manager account, so a decision in the manager's queue is his request |

Manager capability is still derived from live reporting lines. No new role exists.

## 7. The walkthrough

**HR administrator**
1. Sign in. Home states the company: headcount, who is away, what is late, what is waiting.
2. **Edit dashboard** beside the greeting. Edit mode gives the grid its own quiet surface and a
   toolbar: Add widget, Reset to default, Cancel, Done.
3. Move a widget — drag the handle, or focus it and use Space and the arrow keys.
4. Resize one — the size control (S / M / L) sits on the widget and offers only the sizes that
   widget supports.
5. **Add widget** opens the gallery: search, categories, a live preview of the real widget with real
   data, and only the widgets this account is allowed to open.
6. Stack two compatible widgets, and show the stack's Previous, Next and Smart ordering.
7. **Done** saves. Reload to show it persisted. **Reset to default** returns the approved Home.
8. People → a profile → the org chart.
9. Workflows: Action Center, Onboarding (two joiners in progress), Offboarding (one leaver),
   Performance.
10. Attendance, Leave, Payroll (July and August paid, September open), Reports, Audit log.

**Manager**
1. Sign in — the Home is already personalised, and the Smart Stack leads with the decision waiting.
2. My team: five direct reports, who is in, what is waiting.
3. Team attendance, then the leave queue with the two requests.
4. Reviews and goals for the team.

**Employee**
1. Sign in — the approved default Home, with the leave balance, the payslip and what needs them.
2. Attendance, leave (history, a cancelled request, one pending), payslip in ringgit.
3. Tasks, goals, recognition, company updates.
4. HR pages are absent from the navigation, and HR endpoints refuse this token.

Nothing in that path depends on changing data. If a demonstration does change something, the reset
command in section 3 restores the baseline exactly.

## 8. The Smart Stack on the day

The manager's Home holds one stack: **Leave to decide** and **Reviews to write**, both at medium
size, with smart ordering on.

Ordering is deterministic and explains itself. On presentation day the stack opens on **Leave to
decide**, showing "2 leave requests to decide", because that rule scores 72 while reviews waiting
without being overdue score 62. If the manager's reviews became overdue they would score 78 and
lead instead. The person can always move through the stack with Previous and Next or the arrow
keys, and smart ordering can be turned off in the stack editor, which returns the manual order.

Ordering is presentation only. It never changes what anyone is allowed to see.

## 9. Known limitations

- **A public holiday shows an empty day.** On 16 September (Malaysia Day) there is no attendance,
  correctly. Rebuild on the morning of the presentation so today's mixture is live.
- **Statutory payroll is out of scope.** No EPF, SOCSO, EIS or PCB is calculated; the product says so
  on the payroll page. Salaries are fictional.
- **Four months of history, not years.** Reports covering longer periods will show the earlier
  months as empty.
- **Three sign-ins.** Every other employee is a personnel record without a login, as in a real
  company. Showing another person's own view needs another account in `presentationData.ts`.
- **Attendance verification is not demonstrated live.** Seeded attendance claims no QR or location
  scan. A live check-in can be shown from the Attendance page if the office code is displayed.
- **GPS spoofing is still a stated limit of the product**, unchanged by this environment.

## 10. If something goes wrong

| Symptom | What to do |
| --- | --- |
| Data changed during a rehearsal | `PRESENTATION_PASSWORD='…' scripts/presentation-reset.sh` |
| The API is not answering on 5019 | `docker restart hr-nexus-v3-presentation-api`, then `curl localhost:5019/api/health` |
| The bundle is not answering on 5191 | rebuild and re-serve it, pointing `VITE_API_BASE_URL` at `http://localhost:5019/api` |
| Something looks incoherent | `docker exec -i hr-nexus-v2-migration-lab psql -U postgres -d hr_nexus_v3_presentation -Atq < scripts/presentation-integrity.sql` — every row must read PASS |
| The wrong database is suspected | the reset script prints its target and refuses anything but the isolated one; the application database is `hr_nexus` on `hr-nexus-postgres` and is never written by any of this |
