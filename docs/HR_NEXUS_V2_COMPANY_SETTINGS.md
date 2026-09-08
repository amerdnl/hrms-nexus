# Company Settings implementation and migration review

Scope: master specification section 10, single-company architecture, existing
React/TypeScript/Vite/Tailwind and Express/pg stack. No dependency changes.

## API and UI

`GET /api/settings` and `PUT /api/settings` use the existing current-account JWT
authentication and router-wide admin authorization. Employees receive 403; anonymous
requests receive 401. No settings delete or arbitrary company-ID endpoint exists.

`/admin/settings` is in the protected admin routes and sidebar. Company, Working Hours
and Attendance sections cover all 13 specified fields. It handles initial setup,
loading/retry, save success/failure, field errors, disabled controls, stale edits and
explicit discard confirmation when reloading. Browser reload/close warns about unsaved
edits. In-app navigation currently follows the existing router behavior.

PUT supplies all editable fields plus the revision returned by GET. Unknown fields
are rejected. A single parameterized UPDATE matches the revision and increments it;
two admins saving the same revision produce one success and one 409. The latter
retains local edits and requires explicitly reloading the current saved configuration.

## Defaults and validation

- Blank company/contact profile and NULL office coordinates; no invented company,
  address, contact details or production location.
- UTC, ISO weekdays Monday–Friday, 09:00–17:00, zero grace, 100-metre radius are
  clearly identified editable defaults. First save requires a company name.
- Company name 1–200 characters; registration 100, address 2000, email 254, phone 50.
  Optional blank strings normalize to NULL. Email/phone format and control characters
  are checked; output is ordinary escaped React text.
- Timezone is a valid named IANA timezone or UTC, resolved by the server's Intl data.
  The API is the write boundary for timezone validation; the database also requires
  nonempty bounded text. Node/PostgreSQL timezone-data alignment belongs to attendance
  integration before using settings for official timestamps.
- One to seven distinct ISO weekdays (Monday=1 … Sunday=7).
- Minute-resolution HH:mm times must differ. An earlier end time indicates an
  overnight shift belonging to its starting weekday. Grace is a nonnegative integer
  strictly shorter than the working period.
- Both coordinates must be present or both absent; latitude −90…90 and longitude
  −180…180 must be finite. Zero is a valid coordinate. Radius is 1…10000 whole metres.
- Malformed JSON returns 400 and oversized requests 413 without echoing their body.
  Settings persistence failures return generic 503 errors without logging private SQL.

These settings are configuration storage. Attendance, leave and payroll will consume
them in their respective P0 milestones; this increment does not change existing
attendance date/time calculations or reinterpret historical records. Unset office
coordinates must fail closed when location verification is implemented.

## Migration 0002 review

Only new settings migration: `backend/migrations/0002_company_settings.sql`.
SHA-256:

```text
0ac942c9b64e00dbecfdb0f63df037593dbd574dd8a5be778359559f58269bc8
```

The SQL creates only `public.company_settings`, its primary key and validation
constraints/comments, and one neutral unconfigured row with id 1. No sequence is
created. Existing tables/columns, INTEGER IDs, sequences, history guards and the five
orphan attendance rows are untouched. The reviewed runner adds the matching 0002
ledger row in the same transaction. Migration 0001 and its ledger checksum stay intact.

Review outcome: additive and safe for the existing volume after the recorded backup,
source checks and isolated tests. The user authorizes applying a fully reviewed safe
0002 through the approved process; no additional destructive approval is needed.
The runner verifies applied-file checksums, locks migrations, requires the exact
database target and uses transactional migrations. It remains separate from app startup.

Before application, a separate current custom-format backup was created at
`.local-backups/0002-20260908/hr_nexus_before_0002.dump`. It restored successfully into
`hr_nexus_v2_settings_baseline` on the isolated `hr-nexus-v2-migration-lab` server.
Business/orphan fingerprints, ID types and sequence values match the source.
The previously accepted migration 0001 backup was not changed.

Failure before commit rolls back 0002, leaving 0001 and existing business data intact.
An unexpected pre-existing settings table fails closed, with no silent overwrite.
After a successful commit, prefer a reviewed forward fix; do not drop saved company
configuration or remove ledger history. The old application can run without querying
the additive table if an application-only rollback is necessary.

## Verification

98 tests passed in Docker on isolated copies. Coverage includes neutral defaults,
unchanged original business data/schema/IDs/sequences/orphan rows/0001 ledger entry,
repeat application, database constraints, fresh schema initialization without seeds,
failed 0002 rollback, authenticated API authorization, all-field save/read persistence,
concurrent saves, optional clearing, SQL-looking input, invalid/oversized JSON and
safe database failure responses. The original retention/runner suite remains pinned
to an isolated copy of immutable 0001, so later migrations do not alter its scenarios.

Backend source/test typechecks and build, frontend lint/typecheck/build pass. Backend
lint reports only the existing empty-export warning in `src/types/auth.ts`. Initial
host HTTP testing encountered sandbox EPERM on listen; the Docker run passed. A test
response inference error was corrected with an explicit type before final checks.

Evidence: private `.local-backups/0002-20260908/` logs and retained lab database
`hr_nexus_settings_46a3e33f94`. Real source credentials were not used for API testing.
Tests use synthetic accounts only in isolated copies.

## Application result and remaining browser gate

Applied only 0002 to existing `hr_nexus` at **2026-09-08 06:55:44.186031 UTC**.
The runner reported `newlyApplied: ["0002"]`. There are now exactly two matching
ledger rows; the complete original 0001 ledger row, including its timestamp, is
unchanged. The single new settings record exactly matches all reviewed defaults.

All original business-table counts/fingerprints and complete orphan fingerprints,
existing ID columns, constraints, schema statements and full sequence state (including
last_value/is_called/log_cnt) match the immediately preceding source snapshot.
The separate pre-0002 backup SHA-256 is:

```text
d990473e7431a41bfe30363688b2553fabac33a85a46b3c70816249d69b4213c
```

`docker compose up -d --build --wait` passed. It rebuilt the application images and
reused the existing PostgreSQL container/volume and unchanged dependencies. Source
verification output matched again afterward, and both migrations remain applied.
The settings SPA route returned HTTP 200, anonymous `/api/settings` returned 401,
and database health returned 200. SPA delivery is not proof of authenticated UI behavior.

**Company Settings browser smoke is blocked, not passed.** The supported in-app browser
connection returned `Browser is not available: iab`; discovery returned `[]`.
The user accepted the preceding migration/browser gate, which remains complete.
That acceptance is not treated as acceptance of this new settings UI.

Pending browser checks: open Settings as admin; confirm neutral setup/default guidance;
check field errors for blank company name, invalid timezone, empty days, equal times,
excessive grace and incomplete coordinates; save approved company values and reload;
verify persistence and success feedback; exercise the stale-edit/reload confirmation;
check narrow-screen layout and employee-route denial. Use a separately configured lab
for valid-save testing if no source company values have been approved; do not invent
production company details or modify the five protected attendance rows.

## Changed files

- Backend: `src/app.ts`, new `controllers/companySettingsController.ts`,
  `routes/companySettingsRoutes.ts`, `types/companySettings.ts`,
  `utils/companySettingsValidation.ts`, and `migrations/0002_company_settings.sql`.
- Tests: existing `authorization.test.ts` and `migrations.integration.test.ts`;
  new `company-settings-validation.test.ts` and `company-settings.integration.test.ts`.
- Frontend: `src/App.tsx`, `components/layout/Sidebar.tsx`, new
  `api/companySettingsApi.ts` and `pages/admin/CompanySettingsPage.tsx`.
- Documentation: this document plus the V2 plan, audit, architecture, database and demo notes.

Next P0 milestone after settings acceptance: employee/department stability, then
company import. The minor leave filtered-empty-state copy issue remains in the polish
backlog. The qs/nanoid security release findings are retained with no dependency upgrades.
