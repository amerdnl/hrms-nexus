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

## Authenticated browser completion — 8 September 2026

**Company Settings is complete.** The supported in-app browser used the existing
signed-in admin tab on `http://localhost:5173`. Previously passed checks were retained
when the task resumed. No application code changes were needed for this gate.

| Browser check | Result / observed evidence |
| --- | --- |
| Admin navigation | Settings link opens `/admin/settings` |
| Neutral/default guidance | Blank company/contact/location; setup message explains UTC and Monday–Friday defaults; 09:00–17:00, zero grace and 100-metre radius; unconfigured office message |
| Blank company name | Save rejected; field error: “Enter 1–200 characters without control characters.”; focus moves to invalid field |
| Invalid timezone | `Mars/Olympus` rejected with valid IANA timezone guidance |
| Empty working days | All weekdays unchecked; server error requires at least one unique working day |
| Equal start/end | 09:00–09:00 rejected: “Work start and end times must differ.” |
| Excessive grace | 1440 rejected by the period limit and, with equal times, by the 0–1439 integer range |
| Incomplete coordinates | Latitude 0 with blank longitude rejected; both fields explain that coordinates must be supplied together |
| Reload/discard | Dirty form opens “Reload settings?”; Cancel retains edits; confirmation restores saved defaults |
| Narrow screen | 375×812 viewport: fields stack, weekdays wrap, footer actions fit, mobile navigation exposes Settings; document scroll width equals viewport width (375); override reset afterward |
| Valid lab save/reload | Success feedback appears; full reload retains synthetic company, registration, address, timezone, grace and coordinate/radius values |
| Stale edit | Two real lab editor tabs loaded the same revision; competing save succeeds; stale save shows conflict, retains draft and disables Save; reload Cancel preserves draft, confirmation loads winning revision |
| Employee route denial | Synthetic employee sees employee navigation without Settings; direct `/admin/settings` navigation redirects to `/employee/dashboard` without rendering settings |

Valid writes and role-switch tests used only the fresh database
`hr_nexus_browser_smoke_20260908` on the existing isolated
`hr-nexus-v2-migration-lab` server. It was initialized from the schema and unchanged
migrations without source data or seeds, then given one synthetic employee and two
synthetic accounts. The dedicated frontend at `http://127.0.0.1:5186` used only the
lab API at `http://127.0.0.1:5006/api`. No source credentials were reused.

Synthetic saved fields: company `Synthetic Browser Lab`, registration `LAB-ONLY`,
address explicitly marked synthetic, timezone `Asia/Kuala_Lumpur`, 15-minute grace,
coordinates 0/0 and radius 250. The competing save changed the lab company name to
`Synthetic Lab — current saved revision`. Independent read-only PostgreSQL evidence
confirmed revision 2 and these values; lab attendance remains empty. Temporary
smoke API/frontend services were stopped afterward; the synthetic lab database was
retained. The original production services were not stopped or reconfigured.

Source invalid submissions retained a blank company name and were rejected. The
original source tab was restored, still signed in as admin. A read-only source check
confirmed company name NULL, revision 0, UTC, both coordinates NULL, all five protected
attendance exceptions still present, and both exact migration ledger checksums
matching the immutable files. No source business writes, migration edits, dependency
upgrades, seed replay, orphan changes or production company setup occurred.

The first lab frontend attempt failed because Vite's cache mount was read-only;
port 5174 also belonged to a pre-existing local process. Testing moved to dedicated
explicit loopback ports and a separate Vite cache, with unchanged dependencies.
Native time inputs required keyboard entry because automation `fill` did not retain
the React draft on blur; the equal-time check passed using the actual keyboard flow.
These were test harness issues, not application failures.

## Changed files

- Backend: `src/app.ts`, new `controllers/companySettingsController.ts`,
  `routes/companySettingsRoutes.ts`, `types/companySettings.ts`,
  `utils/companySettingsValidation.ts`, and `migrations/0002_company_settings.sql`.
- Tests: existing `authorization.test.ts` and `migrations.integration.test.ts`;
  new `company-settings-validation.test.ts` and `company-settings.integration.test.ts`.
- Frontend: `src/App.tsx`, `components/layout/Sidebar.tsx`, new
  `api/companySettingsApi.ts` and `pages/admin/CompanySettingsPage.tsx`.
- Documentation: this document plus the V2 plan, audit, architecture, database and demo notes.

Active P0 milestone: employee/department stability, then
company import. The minor leave filtered-empty-state copy issue remains in the polish
backlog. The qs/nanoid security release findings are retained with no dependency upgrades.
