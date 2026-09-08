# HR Nexus V2 database baseline and migration plan

Inspected live PostgreSQL 17.10 on 8 September 2026. No business data or persistent
schema was changed during the first security increment.

| Table | Existing relationships/constraints |
| --- | --- |
| departments | unique name; live INTEGER PK |
| employees | unique employee_number; department FK; live INTEGER PK/reference |
| users | unique employee_id and email; employee FK ON DELETE CASCADE; admin/employee CHECK; live INTEGER IDs |
| leave_requests | employee FK ON DELETE CASCADE; reviewer user FK; type/status/date-range CHECKs; live INTEGER IDs |
| attendance | BIGINT PK/employee_id; unique employee/date; status/time CHECKs; **no live employee FK** |

Fresh `database/schema.sql` uses BIGINT for most entity IDs and includes a cascading
attendance employee FK. `database/modules/attendance.sql` omits that FK and explains
one possible origin of the divergence; initialization history has not been proven.
The live database has **five orphan attendance rows**. Preserve them pending review.

Existing indexes cover employee department, user employee, leave employee/status,
attendance employee/date/status, and all primary/unique keys. No migration history
exists. Initialization scripts execute only for a new volume; editing schema.sql
will not upgrade the existing database. Never reset the volume as an upgrade method.

## Proposed migration strategy (not yet implemented)

Use existing pg with versioned SQL files, a checksummed history table, an advisory
lock and transactional apply. Supply apply/status commands for local and Docker use.
Status must detect edited applied migrations. Test fresh setup and an old schema
fixture independently; do not replay seed.sql into existing workforce data.
Use forward corrective migrations rather than destructive automatic down scripts.

Do not widen existing identifiers solely to remove cosmetic drift. A safe initial
attendance integrity constraint may use NOT VALID so existing historical exceptions
remain intact while new writes are enforced. This requires careful review and tests,
then explicit reconciliation before full validation. Do not invent employee ownership.
Replace cascades only as part of the approved retention change; avoid downtime locks
and verify referenced user/reviewer history is preserved.

Recommend Extra High before this migration work. The concrete approval request is
in `HR_NEXUS_V2_PLAN.md`: retire permanent employee deletion while retaining normal
deactivate/reactivate and all history. No destructive operations are proposed.

## Verification performed

Read-only inspection: server version, columns/types/nullability, constraints, indexes,
employment-status aggregate and orphan count. A session lookup integration test uses
BEGIN, temporary shadow tables and ROLLBACK; it leaves public tables unchanged.
No migration was applicable to the first security increment.
