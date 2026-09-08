# Employee/Department Stability — P0 kickoff

Status: **in progress**, following Company Settings completion in `3289c7f`.
Focused code review and read-only source preflight completed on 8 September 2026.
This is the next implementation scope, not a claim that the milestone is finished.

## Confirmed gaps and implementation order

1. **Lifecycle consistency.** `backend/src/controllers/employeeController.ts` creates
   every user with `is_active=TRUE`, even for an inactive employee. Its update path
   changes employment status without synchronizing account activity; the dedicated
   deactivate/reactivate paths change both. A deactivated employee changed back to
   active using Edit therefore retains a disabled account. Current authentication
   still rejects inactive employment; this is inconsistent lifecycle behavior, not
   evidence of an authentication bypass. Unify transactional lifecycle updates and
   lock the target row so competing edit/deactivate/reactivate operations serialize.
   Keep current role authorization and historical records intact.
2. **Validation and email identity.** Employee writes rely on truthiness, accept
   insufficiently checked types/dates/lengths and compare emails case-sensitively;
   login compares `LOWER(email)`. The update duplicate check uses
   `employee_id <> target`, which excludes standalone admin accounts with NULL
   employee linkage. Define bounded field allowlists, required/optional semantics,
   explicit clearing, valid IDs/dates/statuses, and case-insensitive email uniqueness
   with safe conflict responses and concurrency coverage. Unknown payload fields
   must not silently claim success. Do not rewrite existing email values.
3. **Safe transaction and department failures.** Employee connections are acquired
   before controller try/catch. Department mutations can call `.trim()` on non-string
   input. Department deletion checks membership before a separate DELETE and maps
   a concurrent assignment FK failure to 500. Use safe client cleanup and predictable
   400/404/409/503 responses; preserve FK enforcement and assigned employee history.
4. **Server pagination and lookup contracts.** `EmployeeListPage.tsx` slices a complete
   API result into 25-row pages and derives job titles locally. Department headcounts
   also load all employees, while attendance uses the same unbounded helper for
   employee joins. Add bounded server filtering/pagination (including email search
   and job title), separate aggregate headcounts and lightweight lookup needs, and
   migrate every caller together. Do not silently truncate attendance joins or
   department membership when changing the API contract. Handle stale searches and
   page reset after filter changes.
5. **Form parity.** Align create/edit required-department behavior and supported
   employment/contact/date fields with the backend contract. Preserve existing
   shared UI components, validation feedback and explicit action confirmation.

## Read-only source preflight

A transaction declared `READ ONLY` returned:

| Check | Result |
| --- | --- |
| Duplicate groups by `lower(btrim(users.email))` | 0 |
| Linked account activity differing from active/probation eligibility | 0 |
| Employment status outside active/probation/inactive/resigned/terminated | 0 |

These counts describe existing records only. They do not prove mutation concurrency
or future uniqueness enforcement. No records were repaired or normalized.

## Acceptance and constraints

Use fresh synthetic lab fixtures for all writes and browser lifecycle tests. Cover
create/edit round trips, optional clears, invalid IDs/types/dates, duplicate email
(including standalone admin and case variants), transaction rollback, concurrent
writes, inactive login denial, reactivation, unchanged attendance/leave history,
assigned-department deletion denial, pagination/filter totals and all lookup consumers.

Run targeted Node tests, backend/test typechecks, frontend lint/build and a lab
browser smoke. Review any new additive migration independently before source use;
migrations 0001 and 0002, their ledger/checksums, existing business data and the five
protected orphan attendance rows remain immutable. No dependency upgrades belong
to this work. Keep the master brief and pre-existing schema.dbml untracked/untouched.

Company import remains the next P0 after this milestone; it has not begun.
