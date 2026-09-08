# HR Nexus V2 architecture

Preserve React 19 + TypeScript + Vite 8 + Tailwind 4, Node/Express 5 + pg,
PostgreSQL 17 and the current three-service Docker Compose deployment.

The SPA restores JWT sessions via /api/auth/me. Axios supplies Bearer tokens;
ProtectedRoute controls navigation, while backend middleware is authoritative.
Employee/department routers are entirely admin-only. Leave, attendance and dashboard
routes have existing endpoint-level role/ownership enforcement. Profile operations
use the current account and explicit editable fields.

Every authenticated API request verifies HS256/expiry/identity and resolves a current
eligible account in PostgreSQL. Role or employee-link changes invalidate the old
session. There is one extra indexed account lookup per authenticated request.
Database errors deny access rather than falling back to token claims.

Controllers retain parameterized SQL, with attendance operations in a service module.
Settings follows this structure; imports, payroll and reports should fit it too.
No new framework, service, role migration or cookie authentication is introduced.

The application remains single-company. Company settings is an admin-only singleton
configuration with explicit timezone/work calendar/location validation and an atomic
revision check for concurrent edits. Its API is GET/PUT /api/settings; its UI is
/admin/settings. Existing attendance calculations are preserved until the attendance
verification milestone wires in configuration. Payroll snapshots and exact monetary
arithmetic remain planned work.

Photos remain managed local uploads, restricted on write and public on read. Future
private HR documents require authorized downloads. Docker build contexts now exclude
local .env files and employee uploads; runtime environment injection remains Compose's
responsibility. Deployment is still a development-server setup, not production hosting.

Migration tooling now lives in backend/src/database with reviewed SQL files in
backend/migrations. It uses pg with a checksummed ledger, advisory locking and one
transaction per version. Its connection URL and exact database name are explicit;
it is never invoked by app/Compose startup. History retention (0001) and additive Company Settings
(0002) are applied and verified on the source, following their respective authorization.
Both applied files are immutable; new schema work uses subsequent numbered migrations.
