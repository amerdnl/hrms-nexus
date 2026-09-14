# HR Nexus V3 demo company

A fictional company that shows every V3 module working together, for demonstrations and
for browser verification. It is built in an isolated laboratory database and is never
loaded into the application database.

## Everything is invented

No name, number, address or identifier belongs to a real person. Addresses use the
`.invalid` top-level domain, phone numbers use a documentation range, and the office is a
public point in central Kuala Lumpur chosen for the attendance radius, not anyone's
address. The dataset is a plain description in `backend/src/database/demoData.ts`,
separate from the loader in `backend/src/database/seedDemo.ts`.

## The loader refuses the wrong database

Every V2 guard still applies (see [HR_NEXUS_V2_DEMO_DATA.md](HR_NEXUS_V2_DEMO_DATA.md)):

- `DEMO_DATABASE_URL` is required and never falls back to `DATABASE_URL`.
- `--database <name>` must match the database connected to.
- The application's database is refused without an explicit override.
- An approved demo payroll period is refused rather than worked around.
- Writes are confined to the demo identifier range, and the protected orphan rows and
  employees outside that range are re-counted before commit.

V3 adds:

- The target must carry migrations 0010 to 0016.
- Company settings are filled in only when the settings row was never configured, so a
  company's saved settings are never overwritten.

## What the demo contains

| Area | Contents |
| --- | --- |
| Company | Nexus Demo Sdn. Bhd., Asia/Kuala_Lumpur, Monday to Friday, 09:00 to 18:00, an office location with a 150 m attendance radius |
| People | 7 departments and 25 employees (21 active, 2 on probation, 1 inactive, 1 resigned), with reporting lines giving 8 managers, colleague profiles and an org chart |
| Attendance | 891 records from 15 July to 9 September 2026: present, late, absent, a few missing check-outs. Nothing is recorded for today, so a verified check-in can be shown live |
| Leave | 9 requests: 5 approved, 2 pending, 1 rejected and 1 cancelled, with balances |
| Payroll | August 2026, calculated through the real payroll service and approved, with 23 payslips |
| Calendar | 4 company holidays, including Malaysia Day, and 4 company events |
| Announcements | 3 published, one of them important, and 1 draft |
| Onboarding and offboarding | 2 checklists; 2 onboarding plans and 1 offboarding plan in progress, with 17 tasks |
| Recognition | 7 thank-yous, 1 of them private |
| Goals | 5 goals: 4 active (one past due) and 1 completed, each with history |
| Reviews | Annual 2025 closed with a completed review and response; Mid-year 2026 open with reviews at every stage |
| Workplace | 21 notifications, 17 timeline events and 8 audit events |

## Accounts

All four use the password supplied as `DEMO_PASSWORD`; only its bcrypt hash is stored.

| Account | Role | Shows |
| --- | --- | --- |
| `admin@nexus-demo.invalid` | Administrator, not linked to an employee | HR's company-wide work, settings, reports and audit |
| `nurul.aisyah@nexus-demo.invalid` | Employee who manages people (Head of People) | a manager's team layer beside HR-facing self-service |
| `wei.jian@nexus-demo.invalid` | Employee who manages people (engineering lead) | team leave decisions, attendance, goals, reviews and insights |
| `aiman.zulkifli@nexus-demo.invalid` | Employee | self-service: attendance, leave, payslips, goals, reviews, recognition |

The other employees are personnel records without sign-ins, as in a real company.

## Building it

From the repository root, on the laboratory server `hr-nexus-v2-migration-lab`:

```bash
DB=hr_nexus_v3_demo
LAB=hr-nexus-v2-migration-lab
docker exec $LAB psql -U postgres -v ON_ERROR_STOP=1 -qc "DROP DATABASE IF EXISTS $DB WITH (FORCE)"
docker exec $LAB psql -U postgres -v ON_ERROR_STOP=1 -qc "CREATE DATABASE $DB TEMPLATE template0"
docker exec -i $LAB psql -U postgres -d $DB -v ON_ERROR_STOP=1 -q < database/schema.sql
docker run --rm --volumes-from hr-nexus-backend:ro --network $LAB -w /app \
  -e MIGRATION_DATABASE_URL=postgresql://postgres@$LAB/$DB \
  hr-nexus-backend npx tsx src/database/migrate.ts apply --database $DB
docker run --rm --volumes-from hr-nexus-backend:ro --network $LAB -w /app \
  -e DEMO_DATABASE_URL=postgresql://postgres@$LAB/$DB -e DEMO_PASSWORD='<chosen password>' \
  hr-nexus-backend npx tsx src/database/seedDemo.ts --database $DB
```

The drop only ever names the demo database on the laboratory server. The database starts
from a fresh `schema.sql` rather than a copy of any real data.

To use it, run an API container on the laboratory network with
`DATABASE_URL=postgresql://postgres@hr-nexus-v2-migration-lab/hr_nexus_v3_demo`, its own
random `JWT_SECRET`, and `FRONTEND_URL` set to wherever the bundle is served. Then build
the frontend with `VITE_API_BASE_URL` pointing at that API. Verification used port 5018
for the API and 5190 for the bundle.

## Limitations

- **Rebuild, do not re-seed.** Approved payroll is immutable and the timeline is
  append-only, so a used demo is recreated from `schema.sql`. Browser checks that change
  data rebuild it before each run.
- **Four sign-ins.** Showing another employee's view needs another account in
  `demoData.ts`.
- **The demo payroll month is August 2026**, so it can never collide with the September
  2026 period that exists on the application database.
