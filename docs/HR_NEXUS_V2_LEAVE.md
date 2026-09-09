# Leave Balances and Validation — P0

Status: **implemented and verified** on 9 September 2026. Migration 0006 is applied to
source `hr_nexus` with explicit user approval. 243 tests and a 23-check authenticated
browser smoke pass.

Migrations 0001–0005, their ledger rows and checksums, existing business data and the
five protected orphan attendance rows are unchanged.

## Policy is company configuration, not law

`leave_policies` holds the entitlement defaults, whether a type deducts a balance, and
whether it is paid. Every value is editable by an administrator. The seeded numbers —
annual 12, medical 10, emergency 2, unpaid 0 and non-deducting — are **HR Nexus
defaults with no legal meaning**, stated in the table comment, the API and the UI.

**No Malaysian statutory entitlement is encoded anywhere, and no compliance is
claimed.** A company must configure its own policy before relying on these figures.

## The central design decision: usage is derived, never stored

A balance is the **grant** minus the working days on that employee's **approved
requests** for that year and type. Usage is not a stored counter.

This makes the brief's hardest requirement structural rather than procedural: approving
the same request twice cannot deduct twice, because the deduction is a property of the
request row and that row changes once. The status guard and transaction below are
defence in depth, not the thing correctness rests on.

Grants carry `entitled_days`, `carried_forward_days` and a signed `adjustment_days`, so
a correction never has to rewrite history.

| Figure | Meaning |
| --- | --- |
| Entitled | grant for the year: entitlement + carry-forward + adjustment |
| Used | working days on approved requests |
| Pending | working days awaiting a decision — never deducted twice |
| Remaining | entitled − used |
| Available | entitled − used − pending; what a new request is checked against |

Pending is withheld from *availability* so an employee cannot queue several requests
that each look affordable alone, while *remaining* still reflects approved usage only,
exactly as master §28 requires.

## Working days come from Company Settings

Duration counts only days whose ISO weekday is in the configured working week, so a
company working Sunday to Thursday needs no special case. `working_days` in settings
was previously stored, validated and used by nothing; it now drives leave.

The count is **snapshotted onto the request at submission**, so changing the working
week later cannot restate historical leave — the same principle as attendance
`late_minutes` and payroll snapshots.

**Public holidays are not modelled in V1** (master §29, P1). A holiday inside a leave
range still counts as leave, and the UI says so rather than leaving it implied.

## Validation

- **Dates**: real calendar dates, start ≤ end, at most 366 days.
- **Year boundary**: a request may **not** span two leave years. Attributing it wholly
  to one would quietly overdraw that year and under-use the next, which is impossible
  to explain later when a balance looks wrong. The employee is asked to split it.
- **Working days**: a range containing no working days is refused rather than recorded
  as zero-cost leave.
- **Overlap**: pending and approved requests block; rejected and cancelled do not,
  because they consume nothing.
- **Balance**: refused when the request exceeds availability, naming the days requested,
  the days left and how many are already awaiting a decision.
- **Payload**: unknown fields are refused, so `status`, `employeeId` or `workingDays`
  cannot be smuggled in by a client.

## Concurrency

Every balance-affecting write takes a transaction-scoped advisory lock keyed on the
employee (`pg_advisory_xact_lock`) before checking overlap and balance, so two
simultaneous submissions cannot both pass. It is released automatically at commit or
rollback and is keyed on leave alone, so it never contends with employee record edits.

Decisions are guarded **inside the UPDATE** (`WHERE id = $1 AND status = 'pending'`), so
two simultaneous approvals cannot both succeed. The balance is re-checked at approval
time, because other requests may have been approved since submission.

## Cancellation and reversal

An employee may cancel their own request; an administrator may cancel anyone's. The row
is marked `cancelled` with `cancelled_at` and `cancelled_by` and **kept**, never
deleted, so history stays intact and the days become available again.

Leave that has **already started** cannot be cancelled — the days have been taken — and
the employee is directed to an administrator correction. Another employee's request
reports 404 rather than 403, so its existence is not confirmed to a stranger.

## Unpaid leave for payroll

Unpaid leave never limits by balance and is marked `is_paid = false`. `GET
/leaves/employees/:id/unpaid?startDate=&endDate=` returns the approved unpaid working
days in a period, so payroll consumes one agreed definition rather than reimplementing
which leave costs money.

## Company Import adapter

Three optional columns — opening annual, medical and emergency balances — with the
usual alias matching. They are recorded as **carry-forward** for the current leave year
with `source = 'opening_balance'`, because an opening balance is what an employee had
left in the previous system rather than a fresh grant. A type the file does not map is
never touched, and the policy default never overwrites an imported balance.

## API

| Endpoint | Access |
| --- | --- |
| `GET /leaves/me`, `POST /leaves`, `GET /leaves/:id` | Employee |
| `GET /leaves/me/balances` | Employee |
| `POST /leaves/:id/cancel` | Employee (own) or admin |
| `GET /leaves`, `PUT /leaves/:id/status` | Admin |
| `GET/PUT /leaves/policies[/:leaveType]` | Admin |
| `GET/PUT /leaves/employees/:id/balances`, `/entitlements` | Admin |
| `GET /leaves/employees/:id/unpaid` | Admin |

## Migration 0006

Checksum: `a8c6e479bb00ba46d482389a3082c26f9206fb16761eabaaa2ad6cfc791a34fd`

Adds `leave_policies` and `leave_entitlements`, four nullable columns on
`leave_requests` (`working_days`, `leave_year`, `cancelled_at`, `cancelled_by`), and
widens the status CHECK to a strict superset including `cancelled`.

**Impact.** Everything is additive except the CHECK, which is dropped and re-added. A
preflight verifies every stored status already satisfies the wider rule first, so the
validating scan cannot fail. No existing row is rewritten.

**Rollback.** Drop the two new tables, drop the four columns, restore the original
three-value CHECK. That last step **only succeeds while no row is cancelled**; once a
cancellation exists the retained pre-migration backup is the real recovery path. This
is stated plainly rather than implying a clean reverse.

**Applied** 9 September 2026 after explicit approval, with a backup taken and
restore-verified beforehand. The only differences in the source are the ledger row and
the widened CHECK:

```
users=2  employees=1  attendance=5  leave=0  orphans=5
fingerprint=1:1,3:1,4:2,5:1,6:1
ledger=0001..0005  ->  0001..0006
status_check: +'cancelled'
```

After application: 4 seeded policies, 0 entitlements, and **0 leave rows carrying
balance metadata** — nothing back-filled.

Backups and evidence are in `.local-backups/0006-20260909/` (gitignored).

## Verification results

| Check | Result |
| --- | --- |
| Backend type-check, build | Pass |
| Full suite with all lab flags | **243 pass, 0 fail** (was 208) |
| Frontend lint, build | Pass |
| Backend lint | One pre-existing `no-useless-empty-export` warning |
| `docker compose down` then `up --build` | Pass, volumes preserved, data and 0006 intact |
| Authenticated browser smoke | **23/23 pass** |

New tests: `tests/leave-calculation.test.ts` (14 unit checks) and
`tests/leave.integration.test.ts` (21 database-backed checks, gated by
`HR_NEXUS_LEAVE_LAB=1`).

Covered: additive migration and untouched orphans; database refusal of negative,
oversized, duplicate and unknown-type entitlements; default grant on first view;
working-day duration under two different working weeks; weekend-only refusal; year
boundary refusal; overlap against pending and approved, including touching edges and
other employees; insufficient balance counting pending; single deduction on approval and
refusal of a repeat; **two simultaneous approvals deciding exactly once**; rejection
consuming nothing; cancellation restoring days and keeping the row; cancellation refused
for started leave and for another employee's request; unpaid leave reported for payroll
without touching a balance; administrator entitlement and policy management including
refusal of a negative grant; and role enforcement across every endpoint.

## Authenticated browser smoke

Headless Chromium against an isolated lab stack built from a restore-verified copy of
the source with 0006 applied. Screenshots and the script are in
`.local-backups/0006-20260909/browser/`.

All 23 checks passed, including: balances showing the default grant and labelled as
policy rather than law; the public-holiday limitation stated; a Monday-to-Sunday request
recorded as **5 working days, not 7 calendar days**; pending shown separately from
remaining; an overlap refused naming the clashing dates; weekend-only and year-spanning
refusals; an over-balance request refused with the exact numbers ("needs 10 days but
only 7 remain … with 5 already awaiting a decision"); approval deducting exactly once;
cancellation restoring the balance; a 375-pixel layout with no horizontal scroll; and an
employee denied the admin leave page.

A real UX defect was found by that verification and fixed: field-level validation
messages were being dropped, so a refused submission showed only "Check the highlighted
leave details" while the server had already named the exact rule broken.

## Follow-ups, not in this milestone

- **Release/security blocker, still open: no forced first-login password change.**
- Public holidays (master §29, P1) would make working-day counts exact.
- The leave year is the calendar year. A configurable leave-year start is P1.
- Carry-forward is recorded but not automatically rolled over at year end; an
  administrator or the import sets it.
- Half-days are storable (`NUMERIC(4,1)`) but not offered in the UI.
- The employee balance panel shows the current leave year only, so leave booked for a
  future year is validated correctly but not shown in the panel.
