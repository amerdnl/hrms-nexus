# Audit Log V1 — P0

Status: **implemented and verified** on 9 September 2026. Migration 0008 is applied to
source `hr_nexus`. 358 tests and a 24-check authenticated browser smoke pass.

Migrations 0001–0007, their ledger rows and checksums, existing business data, the five
protected orphan attendance rows and the September 2026 draft payroll period are all
unchanged.

## Migration 0008

Checksum `59dac71d4777da9277f29fa4f072cc3fe810e0d571916617e5411e70ef0c02fa`.

One new table, `audit_events`, plus four indexes, one function and one trigger. Purely
additive: no existing table, column, constraint or row is modified.

| Column | Purpose |
| --- | --- |
| `occurred_at` | Database time, never a client-supplied timestamp |
| `actor_user_id`, `actor_employee_id` | The actor by reference, `ON DELETE SET NULL` |
| `actor_label`, `actor_role` | Identity snapshot, readable after the account is gone |
| `action`, `entity_type`, `entity_id` | What happened, to what |
| `summary` | A sentence a person can read without decoding the change set |
| `changes` | Redacted `{field: {before, after}}`, bounded to 8 KB |
| `outcome` | `success` or `failure` |

`ON DELETE SET NULL` rather than `RESTRICT` is deliberate: an audit row must never be the
reason a permitted deletion fails. `actor_label` is a snapshot, so the entry stays
readable regardless.

`entity_id` is text because the entities involved have both INTEGER and BIGINT keys, and
some events legitimately have no single target.

### Append-only, enforced by the database

```sql
CREATE TRIGGER prevent_audit_event_change
  BEFORE UPDATE OR DELETE ON public.audit_events
  FOR EACH ROW EXECUTE FUNCTION public.prevent_audit_mutation();
```

A trigger rather than `REVOKE`, because the application connects as the owning role and
privileges alone would not restrain it. Both an `UPDATE` and a `DELETE` are refused with
*"Audit events are append-only and cannot be changed or removed"*.

Two CHECK constraints back this up: `audit_outcome_known` limits `outcome` to the two
known values, and `audit_changes_bounded` caps `changes` at 8 KB so no code path can turn
it into a request-body dump.

### Rehearsal and rollback

Rehearsed on an isolated copy restored from the post-0007 dump: applied via the real
runner, ledger `0001…0008`, tables 17 → 18, orphans still 5. `UPDATE`, `DELETE`, a 9 KB
change set and an unknown outcome were each refused. Rollback (drop the trigger, table
and function, delete the ledger row) restored ledger `0001…0007`, tables 17, orphans 5.

### How 0008 reached the source

The design and checksum were presented and approved as drafted, before any change to the
source. The sequence then followed the same gate used for 0003–0007:

1. A fresh backup of the source was taken (`hr_nexus_before_0008.dump`, SHA-256
   `2e18299f…decbbb`).
2. That backup was proved restorable by restoring it into an isolated database and
   comparing it field by field against the live source. It matched exactly.
3. The migration was applied to `hr_nexus` through the checksummed runner with explicit
   `--database` confirmation. The runner reported `newlyApplied: ["0008"]`, and the ledger
   records the apply at 07:36:32 UTC on 9 September 2026 with the approved checksum.
4. Apply was re-run immediately and was a no-op (`newlyApplied: []`).

Verified after the apply: business data is identical to the pre-apply snapshot
(`users=2, employees=1, attendance=5, leave=0, orphans=5`, fingerprint
`1:1,3:1,4:2,5:1,6:1`), `audit_events` exists and is empty, the trigger is present, and
the September 2026 draft payroll period survives. Base tables went from 17 to 18.

`.local-backups/0008-20260909/` holds the post-apply dump and the application record.
One gap is worth stating plainly: the pre-apply dump taken in step 2 above is no longer
present in that directory. Its SHA-256 is recorded in `backup.sha256` and `NOTE.txt` so it
can be identified if recovered; the nearest retained pre-0008 artifact is
`.local-backups/0007-20260909/hr_nexus_after_0007.dump`, which predates both this
migration and the September 2026 draft payroll period.

## Coverage

26 call sites across nine controllers:

| Area | Actions |
| --- | --- |
| Authentication | `LOGIN`, `LOGIN_FAILED`, `LOGOUT`, `PASSWORD_CHANGED` |
| Employees | `EMPLOYEE_CREATED`, `EMPLOYEE_UPDATED`, `EMPLOYEE_DEACTIVATED`, `EMPLOYEE_REACTIVATED` |
| Departments | `DEPARTMENT_CREATED`, `DEPARTMENT_UPDATED`, `DEPARTMENT_DELETED` |
| Settings | `SETTINGS_CHANGED` |
| Import | `IMPORT_STARTED`, `IMPORT_COMPLETED`, `IMPORT_FAILED` |
| Attendance | `ATTENDANCE_CORRECTED`, `ATTENDANCE_MANUAL_CREATED` |
| Leave | `LEAVE_APPROVED`, `LEAVE_REJECTED`, `LEAVE_CANCELLED`, `LEAVE_POLICY_CHANGED`, `LEAVE_ENTITLEMENT_CHANGED` |
| Compensation | `SALARY_CHANGED` |
| Payroll | `PAYROLL_PERIOD_OPENED`, `PAYROLL_CALCULATED`, `PAYROLL_STATE_CHANGED`, `PAYROLL_APPROVED`, `PAYROLL_PAID`, `PAYROLL_LINE_ADDED`, `PAYROLL_LINE_REMOVED` |

The action list is closed, so the log stays filterable and a typo cannot invent a
category. `EMPLOYEE_DELETED` is deliberately absent: permanent deletion is retired and
returns 409, so the event can never occur.

## What is never recorded

Redaction is by key name, applied **recursively**, so a secret nested two objects deep is
still removed. The denied fragments cover `password`, `passwd`, `hash`, `token`,
`secret`, `jwt`, `authorization`, `credential`, `apikey`, `signature`, `salt`, `otp`,
`pin`, and — for attendance — `latitude`, `longitude`, `accuracy`, `coordinate`,
`geolocation`, `qr`, `challenge`, `nonce`.

A diff **excludes** a forbidden field rather than comparing it, because comparing means
reading it. A password change records the event and nothing else: no change set at all.

Further bounds: strings truncate at 300 characters, nesting stops at depth 4, objects
keep at most 40 keys, and the whole change set is capped at 8 KB — degrading to a marker
rather than failing the operation that produced it. Functions and symbols become null.

An import records the filename and row counts, never the uploaded rows; the generated
temporary passwords are returned to the administrator once and recorded nowhere. An
attendance correction records times and status, never coordinates.

## The savepoint, and why it is load-bearing

The audit insert joins the caller's transaction where one exists, so a rolled-back change
leaves no entry claiming it happened. That join is wrapped in a `SAVEPOINT`, and this is
not defensive tidiness:

PostgreSQL aborts an entire transaction on the first error. An audit insert that failed
inside a caller's transaction and was merely caught would leave the transaction aborted,
turning the caller's `COMMIT` into a rollback — **the API answered 200 while the change
was silently discarded**. This was observed during development on a database where
`audit_events` did not yet exist. The savepoint confines the failure to the audit insert,
so the business change still commits and only the entry is lost.

A test hides the table with `ALTER TABLE ... RENAME` and asserts that a deactivation
still returns 200 *and* is actually committed.

## Security

- **Administrator-only reading**, applied to the whole router. A normal employee has no
  route into company-wide audit records at all.
- **No write endpoint exists.** Entries come only from the actions that produce them, so
  no caller can forge history. `POST`, `PUT`, `PATCH` and `DELETE` on `/api/audit` are all
  refused.
- **A refused read leaks nothing** — asserted against actor addresses and action names.
- Filters are matched against closed lists; `action=DROP TABLE` is ignored, not injected.
  The page size is capped at 100.
- `actor_label` on a failed sign-in is attacker-supplied, so it is truncated in the
  application as well as bounded by the column, and an unknown address records no
  `actor_user_id`.

## API and UI

`GET /api/audit` with `action`, `entityType`, `entityId`, `actorUserId`, `outcome`,
`from`, `to`, `page`, `pageSize`. `/admin/audit` lists events newest first with readable
descriptions, a per-field before/after breakdown, and the same filters. Filter options
come from the server so the UI cannot drift from what the API accepts.

## Verification

- Backend build and type-check pass; frontend Oxlint and build pass (exit 0).
- **358 tests pass, 0 fail** — 12 redaction unit tests, 21 audit integration tests and
  11 demo-data tests among them.
- Docker `down` then `up --build` with the volume preserved; ledger, orphans, the
  September draft period and `audit_events` all survive. `/api/audit` returns 401
  anonymously.
- **24/24 authenticated browser checks** against an isolated lab stack seeded with the
  demo company. Evidence: `.local-backups/0008-20260909/browser/`.

Confirmed in the browser: a wrong password is refused and appears in the log as a
filterable failure attributed to the attempted address; events read in plain language;
the append-only guarantee is stated to the reader; a department created during the run
appears immediately with its actor named; filtering by area narrows the list; **no bcrypt
hash, password or coordinate is rendered anywhere in the log**; an employee is denied both
the page and the API (403) with nothing leaked; the layout does not scroll horizontally at
375px; and no uncaught page errors.

## Limitations, stated rather than implied

- **No IP address or user agent is recorded.** It would help investigating failed
  sign-ins, but it is personal data that was not asked for, so it was left out. Adding a
  nullable column later is straightforward.
- **No retention or archival policy.** The table grows without bound; nothing prunes it.
- **`TRUNCATE` is not blocked.** Row triggers do not fire for it, so a superuser could
  still empty the table. Blocking that needs an event trigger or a non-owning application
  role, neither of which is in this milestone.
- **Reads are not themselves audited.** Only mutations are recorded, so viewing a payslip
  or exporting a report leaves no trace.
- **Self-service employee actions are not covered.** Clock-in, clock-out and leave
  submission are not recorded; the milestone covers administrative, security and
  business-decision actions.
