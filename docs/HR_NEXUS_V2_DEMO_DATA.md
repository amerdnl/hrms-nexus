# Demo dataset — P0

Status: **implemented and verified** on 9 September 2026, for the leadership demo on
16 September 2026.

A fictional company: **6 departments, 24 employees**, eight weeks of attendance history,
leave in every state, compensation, an approved payroll period with 22 payslips, and
audit activity. Enough to make Reports and Dashboards worth looking at.

## Everything is invented

No name, number, address or identifier belongs to a real person. Email addresses use the
`.invalid` top-level domain, which RFC 2606 reserves precisely so it can never resolve to
a real mailbox. Phone numbers use a documentation range. Names are professional and
plausible rather than `Test User 1`, and a test asserts there are no placeholder names.

The dataset lives in `src/database/demoData.ts` as a plain description, separate from the
loader that writes it, so what the demo contains can be reviewed without reading
transaction code.

## The loader refuses the wrong database

`src/database/seedDemo.ts` is built to refuse rather than to be used carefully:

| Guard | Behaviour |
| --- | --- |
| `DEMO_DATABASE_URL` required | Never falls back to `DATABASE_URL`, so the application's connection string cannot be picked up by accident |
| `--database <name>` required | Must match `current_database()`, so a stale URL cannot silently redirect the write |
| Application database | Refused unless `--allow-app-database` is passed — that flag *is* the explicit approval |
| Migration level | Refused if the target is missing 0007 |
| Approved demo payroll present | Refused, rather than working around payroll immutability |
| Identifier range | Every write confined to 9000–9099 |
| Post-write check | Aborts and rolls back if the protected orphan rows or any employee outside the range moved |

The whole load runs in one transaction: the company appears completely or not at all.

Each of these refusals is covered by a test that runs the real script exactly as an
operator would.

## Nothing is mingled with protected data

The loader writes only identifiers 9000–9099 and rows owned by them. Before committing it
re-counts the orphan attendance rows and the employees outside that range, and aborts if
either changed.

**The demo payroll month is August 2026, deliberately.** Payroll periods are unique per
month and the source database holds a September 2026 draft period that must survive, so
the demo cannot collide with it even if someone deliberately used the override flag.

## Reproducible, and honest about what that means

The dataset is fixed, the identifiers are fixed, and attendance variation comes from a
seeded generator (mulberry32) rather than `Math.random`, so the same input produces the
same output. **Two independently seeded fresh databases hold byte-identical employees,
attendance, leave, compensation and payroll totals** — asserted by a test, and confirmed
by hand: 853 attendance rows, 22 payslips, RM 177,597.62 net payroll on both.

Re-seeding *in place* is a different property, and it is deliberately **not** supported
once the demo payroll has been approved. Migration 0007 makes approved payroll immutable
at the database level; the loader refuses and tells the operator to recreate the database
rather than disabling a trigger to get past a guarantee the product makes.

## Passwords

No plaintext password is ever stored. `DEMO_PASSWORD` is hashed with bcrypt at 12 rounds
and only the hash is written. If the variable is absent, a cryptographically random
password is generated and printed once to the operator's terminal, so it exists nowhere
else. A test asserts every demo account holds a bcrypt hash and never the plaintext.

## What the demo contains

- **6 departments**: Human Resources, Engineering, Finance, Marketing, Operations, Sales.
- **24 employees**: mostly active, two on probation, one inactive, one resigned — so the
  workforce report is not one flat bar.
- **~850 attendance records** over eight weeks: present, late with real `late_minutes`,
  occasional absence, a few missing checkouts, and some days with no record at all.
- **Leave** in every state: approved, pending, rejected and cancelled, plus entitlements
  for annual, medical and emergency.
- **Compensation** for every employee who should have it.
- **August 2026 payroll**, opened and calculated through the real payroll service rather
  than hand-written rows, then moved to approved so the employee payslip view has
  something to show.
- **Audit activity**: sign-in, a failed sign-in, settings, employee, leave, salary and
  payroll events.

## Accounts

| Account | Address | Role |
| --- | --- | --- |
| Administrator | `admin@nexus-demo.invalid` | Not linked to an employee, like a real admin |
| Employee | `nurul.aisyah@nexus-demo.invalid` | Head of People, for the self-service walkthrough |

Only two accounts have sign-ins. The other 23 employees are personnel records without
logins, which is what a real company looks like.

## Running it

```bash
docker run --rm --volumes-from hr-nexus-backend:ro --network hr-nexus-v2-migration-lab \
  -e DEMO_DATABASE_URL="postgresql://postgres@hr-nexus-v2-migration-lab/<database>" \
  -e DEMO_PASSWORD="<chosen password>" \
  -w /app hr-nexus-backend npx tsx src/database/seedDemo.ts --database <database>
```

The target must already be migrated to at least 0007 (0008 as well, for audit events).

## Limitations

- **One employee sign-in.** Demonstrating a second employee's self-service view needs
  another account added to `demoData.ts`.
- **No public holidays**, inherited from the leave milestone.
- **The demo has not been loaded into the source database**, and should not be without
  explicit approval. It has been exercised only in isolated laboratory databases.
- **`Iskandar bin Mahmud` (inactive) deliberately has no compensation record.** Payroll V1
  selects every employee with compensation in force regardless of employment status, so
  leaving one would put an inactive employee on the payslip list. That underlying payroll
  behaviour is recorded as a finding, not changed by this milestone.
