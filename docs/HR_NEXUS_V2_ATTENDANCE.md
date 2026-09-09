# Attendance Verification — P0

Status: **implemented and verified** on 9 September 2026. Migration 0005 is applied to
source `hr_nexus` with explicit user approval. 208 tests and an 18-check authenticated
browser smoke pass.

Migrations 0001–0004, their ledger rows and checksums, existing business data and the
five protected orphan attendance rows are unchanged.

## What this does and does not prove

Attendance now requires a short-lived code displayed at the office **and** a location
inside the configured radius, with the official timestamp set by the server.

It is **not** fraud-proof, and the UI says so rather than implying otherwise:

- A colleague can photograph the QR and forward it inside its window. A code is usable
  once per person per action, so it cannot clock the same person in twice, but it can
  be used by someone else who is genuinely inside the radius.
- GPS can be spoofed on a rooted or instrumented device.
- Nothing proves who is physically holding a phone.

These checks raise the cost of casual misuse. They are not identity proof, and should
not be described to leadership as such.

## What was replaced

`attendanceTime.ts` hard-coded `Asia/Kuala_Lumpur` and a 09:00 late cutoff for every
company, ignoring Company Settings entirely. It is removed. Timezone, work start, work
end, grace period, office coordinates and radius now all come from settings, and the
read path (`GET /attendance/today`) uses the same zone as the write path, so "today"
cannot disagree with the date a check-in was filed under.

The unverified `createCheckIn` and `createCheckOut` service functions are also removed:
leaving them would have kept an unverified route into the attendance table available.

## Verification flow

```text
Admin displays office QR  ──►  Employee scans (or types) the code
                                        │
                          location read once, at submission
                                        │
      server: settings ► geofence ► spend the code ► official time ► lateness
                                        │
                             verified attendance saved
```

1. **Settings** are loaded. No settings, or no office coordinates, fails closed.
2. **Geofence** is judged *before* the code is spent, so an employee standing outside
   the radius does not burn their one use and can retry after moving.
3. **The code is consumed** inside the same transaction, so any later failure releases
   it.
4. **The server clock**, in the configured zone, sets the date and time. Nothing the
   client sends influences them.

### The QR model

An administrator displays one code; everyone arriving in that window scans the same
one. A strictly single-use token would break that, so replay resistance comes from
`UNIQUE (challenge_id, employee_id, action)` instead: a captured code cannot be
replayed by the same person for the same action even inside its window, and expiry
kills it afterwards. Expiry is evaluated by the database clock.

Codes are 128-bit, `base64url`, and **only their SHA-256 hash is stored** — reading the
table yields nothing usable. The display also shows the code as text, grouped for
readability, so a device without a working camera is never locked out. The employee UI
uses the browser's built-in `BarcodeDetector` where it exists and always accepts a
typed code.

TTL is 45 seconds, clamped to the 30–60 second range the brief asks for. The display
reissues shortly before expiry so there is never a dead code on screen.

### Location and privacy

Only latitude, longitude and accuracy are accepted, and only at the moment of an
action. There is **no `watchPosition` anywhere in the application** — no background or
continuous tracking. What is retained is the minimum needed for audit: the coordinates
of that single fix, its accuracy, and the computed distance.

Accuracy policy: a fix vaguer than **150 m** is refused as unusable rather than
stretched to fit. Otherwise the geofence is the configured radius plus at most a
**50 m** allowance drawn from the reported accuracy, so a client cannot claim enormous
imprecision to reach the office from a kilometre away.

### Lateness

Computed from the configured start time and grace period, and snapshotted into
`late_minutes` so a later settings change cannot rewrite history. The brief's worked
example holds exactly: 09:00 start, 15 minute grace → 08:55 on time, 09:07 on time,
09:22 late by 22.

Overnight shifts are supported to the extent that the early-morning half of a shift is
recognised — a 22:00 start with a 01:00 arrival is three hours late, while a 21:00
arrival is simply early. Attendance is still dated by the calendar day in the
configured zone.

### Methods

| Method | Set by | Status recorded |
| --- | --- | --- |
| `QR_LOCATION` | Employee, verified scan | `verified` |
| `ADMIN_OVERRIDE` | Administrator | `manual` |
| `REMOTE_APPROVED` | Administrator | `exception` |
| `FIELD_WORK` | Administrator | `exception` |

An administrator record is never marked `verified`, and an administrator **cannot**
declare a record to be a QR scan — that is rejected with 400.

## API

| Endpoint | Access | Purpose |
| --- | --- | --- |
| `POST /attendance/qr` | Admin | Issue and render the office code |
| `GET /attendance/verification-status` | Employee | Whether verification is usable |
| `POST /attendance/check-in` | Employee | Verified check-in |
| `PATCH /attendance/check-out` | Employee | Verified check-out |
| `POST /attendance/manual` | Admin | Declared record with an explicit method |

Refusals are specific: `missing_code`, `missing_location`, `invalid_code` (400),
`expired_code` (410), `replayed_code` / `already_checked_in` / `already_checked_out`
(409), `outside` (403), `accuracy` (422), `office_not_configured` (503),
`not_checked_in` (404). Codes and coordinates are never logged.

## Migration 0005

File: `backend/migrations/0005_attendance_verification.sql`
Checksum: `00dede24d12d79e58d8fbbcc772181c9794fd05d9f48f9b77ee8222176f9be2e`

Eleven nullable columns on `attendance` plus `attendance_qr_challenges` and
`attendance_qr_uses`. Nullable with no default, so existing records — including the
five protected orphan rows — keep NULL metadata and are never rewritten or back-filled
with invented data. CHECK constraints bound the four methods, the three statuses,
paired coordinates, coordinate ranges and non-negative measurements.

Applied 9 September 2026 after explicit approval of the checksum, with a backup taken
and restore-verified beforehand. The **only** difference in the source is the ledger
gaining `0005`:

```
users=2  employees=1  attendance=5  orphans=5
fingerprint=1:1,3:1,4:2,5:1,6:1
seq_attendance=6:true
ledger=0001,0002,0003,0004  ->  ledger=0001,0002,0003,0004,0005
```

After application: 21 attendance columns, both QR tables present, and
**0 rows carrying verification metadata** — every legacy row untouched.

Backups and evidence are in `.local-backups/0005-20260909/` (gitignored).

## Verification results

| Check | Result |
| --- | --- |
| Backend type-check, build | Pass |
| Full suite with all lab flags | **208 pass, 0 fail** (was 172) |
| Frontend lint, build | Pass |
| Backend lint | One pre-existing `no-useless-empty-export` warning |
| `docker compose down` then `up --build` | Pass, volumes preserved, data and 0005 intact |
| Authenticated browser smoke | **18/18 pass** |

New tests: `tests/attendance-verification.test.ts` (30 unit checks on the clock,
lateness, geofence, accuracy policy, payload validation and methods) and
`tests/attendance.integration.test.ts` (19 database-backed checks). The integration
suite is gated by `HR_NEXUS_ATTENDANCE_LAB=1`.

Covered: valid code inside the radius; expired code; replayed code; malformed, tampered
and injection-shaped codes; outside the radius; poor and missing geolocation;
unconfigured office; duplicate check-in; check-out without check-in; server-time
enforcement against a client trying to supply its own; the grace boundary in both
directions; timezone deciding the attendance date; overnight shifts; authorization
including a standalone admin having no employee record to clock; administrator
overrides; and history preservation across an administrator edit.

Two bugs were found by these tests and fixed before commit:

- `normalizeToken` stripped hyphens as cosmetic separators, but `-` is a valid
  `base64url` character, so roughly **half of all issued codes were corrupted** before
  hashing. Only whitespace is stripped now, and the display groups with spaces.
- The QR controller fired its housekeeping prune without awaiting it, on a client it
  was about to release — it could have run on a connection another request had already
  taken over. It is awaited before release.

## Authenticated browser smoke

Headless Chromium against an isolated lab stack built from a restore-verified copy of
the source with 0005 applied, using Playwright's geolocation override. Source data was
never used for writes. Screenshots and the script are in
`.local-backups/0005-20260909/browser/`.

All 18 checks passed, including: the QR rendering as an image with a typeable code, a
live countdown, the stated radius and the honest one-use note; a check-in from 2335 m
away refused with the distance named; a denied location permission explained rather
than swallowed; an unrecognised code refused; an **expired** code refused after its
window closed; a fresh code issued afterwards; a verified check-in and check-out; a
375-pixel layout with no horizontal scroll; and an employee denied the admin page.

Database verification after the run: one `QR_LOCATION` / `verified` record with a
0 m distance on both actions and `late_minutes=165` against an 08:00 start, two
challenges, two uses, **five orphan rows still carrying no metadata**, and no raw token
stored anywhere.

## Follow-ups, not in this milestone

- **Release/security blocker: no forced first-login password change.** Imported and
  manually created accounts receive a unique 128-bit random password, only the bcrypt
  hash is stored, and no plaintext reaches import history or logs — all verified. But
  there is no `must_change_password` column and no forced-reset logic, so nothing
  compels an employee to change a distributed temporary password. This needs its own
  milestone before release.
- Attendance exception requests (forgot checkout, GPS failure, remote work) remain P1
  per master §26; the four methods and `admin_note` support them manually today.
- Working days are read from settings but do not yet block a clock action on a
  non-working day; the brief does not require it.
- exceljs's transitive `uuid` advisory, plus qs and nanoid, remain recorded release items.
- Company Import gains compensation fields once Payroll V1 defines them, and opening
  leave balances once Leave Balances does.
