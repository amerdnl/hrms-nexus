# Forced first-login password change

Delivered 10 September 2026. This was the release/security blocker: generated and
administrator-set passwords were unique, cryptographically random and only ever
persisted as bcrypt hashes, but nothing compelled an employee to replace one.

## Migration 0009

`0009_force_password_change.sql`, checksum
`fb90dbcae24ad283ebc8f5c09c8988105bd086d5cf206eaaeb334fd8b06fa680`, applied to source
2026-09-10 03:08:03 UTC after explicit approval.

```sql
ALTER TABLE public.users
  ADD COLUMN must_change_password BOOLEAN NOT NULL DEFAULT FALSE;
```

Additive only. On PostgreSQL 11+ a `NOT NULL` column with a non-volatile `DEFAULT` is a
catalogue-only change, so `users` — referenced by ten foreign keys — is not rewritten or
held for the length of a rewrite.

**The default is the safety decision.** Every account that already exists chose its own
password, or has been using one long enough that forcing a change would be a surprise
lockout rather than a security improvement. Turning the flag on is an explicit act by the
code that mints a temporary credential. Verified on source: **0 of 2** existing accounts
flagged.

Rollback, rehearsed and proven repeatable:

```sql
ALTER TABLE public.users DROP COLUMN must_change_password;
DELETE FROM public.schema_migrations WHERE version = '0009';
```

Rehearsal, against a copy restored from a fresh source backup that was itself proved
restorable: apply → verify → idempotent re-run → rollback → re-apply, with business data
and the five protected orphan attendance rows unchanged throughout. Backups and their
SHA-256s are in `.local-backups/0009-20260910/`.

## Authentication behaviour

**Sign-in succeeds.** The restriction is on what the session may then do, not on whether
it may exist — an account that cannot authenticate cannot change its own password.

**The restriction is default-deny.** It lives inside `authenticateToken`, which every
protected router already uses, so a router added later is covered without anyone
remembering to cover it. Three endpoints opt out explicitly, through
`authenticateForPasswordChange`:

| Endpoint | Why |
| --- | --- |
| `GET /api/auth/me` | Knowing who you are must not require first doing the thing you cannot do without knowing who you are |
| `PUT /api/profile/password` | The way out |
| `POST /api/auth/logout` | A forced change must never be a trap |

Both middlewares share one implementation, differing only in a boolean, so the token
checks cannot drift apart between the restricted and unrestricted paths. Everything else
answers **403** with `code: "PASSWORD_CHANGE_REQUIRED"`, which is what lets the client
route correctly rather than treating it as an ordinary permission failure.

**The flag is never a JWT claim.** It is read from the column by `findSessionUserById` on
every authenticated request. A token minted before the flag was set does not keep
asserting the old answer; a token minted while flagged does not keep asserting it after
the password is replaced; and a token carrying a forged `mustChangePassword: false` is
simply ignored, because nothing reads it. All three are asserted.

**An administrator is not exempt.** The check runs before the role check, and a flagged
administrator is refused the entire admin surface — employees, departments, settings,
reports, audit, export and payroll — while an unflagged one is not.

## Clearing the flag

One statement writes the new hash and clears the flag:

```sql
UPDATE users SET password_hash = $1, must_change_password = FALSE, updated_at = ... WHERE id = $2
```

There is no instant in which the password has been replaced but the account is still
locked to the change screen, or the reverse. A failed attempt reaches neither.

**Concurrency.** The current password is verified against a row locked `FOR UPDATE`, not
against a copy read a moment earlier. Two changes arriving together would otherwise both
compare against the same starting hash and both succeed, the second silently overwriting
the first while its owner believed their password was in force. Locking makes them
serialise: exactly one wins, the other is refused, and exactly one of the two new
passwords is in force afterwards.

Normal validation is unchanged — current password correct, confirmation matching, at
least 8 characters, and different from the current one. An ordinary change by a settled
user clears a flag they never had and never re-enables it.

## Which accounts are flagged

| Flow | Flagged | Reason |
| --- | --- | --- |
| Company Import | **Yes** | The password is generated and handed to an administrator to pass on |
| Administrator creates an employee | **Yes** | The administrator typed it and therefore knows it. There is no opt-out |
| Demo seeder | **No**, stated explicitly | `DEMO_PASSWORD` is chosen by whoever runs the script and is the password they then sign in with. Nobody holds a credential they have never seen, and flagging would open every demonstration with a forced change |
| Existing accounts at 0009 | **No** | The migration default |

**Administrator-created accounts are deliberately not exempt.** A password a second
person knows is a temporary password regardless of how it was produced.

## The screen

A full page, not a modal, because there is nothing behind it to return to. It renders
outside `AppLayout`, so there is no sidebar to click past, and the guard in
`ProtectedRoute` sends every protected path there — including a hand-typed URL, since the
catch-all route redirects the same way. An account that no longer owes a change is
bounced back to its dashboard, so the screen cannot be revisited.

This is convenience, not security: the server refuses those routes whatever the browser
decides. After a successful change the client re-reads the session rather than deciding
on its own that it worked.

Neither the temporary password nor the old one is ever displayed. The temporary one is
typed into a password field like any other.

## Verification

- **434 backend tests pass, 0 fail, 0 skipped**, including 25 new security checks.
- **40/40 authenticated browser checks** at 1280px and 375px, covering all seven required
  steps: a temporary employee signs in, the forced screen appears, six hand-typed paths
  are all blocked, the password is changed, the dashboard becomes available, the old
  password stops working, and the new one works. Evidence in
  `.local-backups/0009-20260910/browser/`.
- Backend typecheck and build pass; frontend build and Oxlint pass.
- Clean `docker compose down` and `up --build` with volumes preserved.
- Regression: normal login, normal profile password change, Company Import, admin and
  employee routing, and every previous P0 workflow all still pass.

Three existing suites needed repair, on the new column rather than on any defect:
`session-database`'s temporary `users` table needed it, and `company-settings` and
`migrations` both deliberately scope themselves to an early part of the migration chain
so later migrations cannot look like drift, then start the real application against that
database. The application requires its real schema, so both now apply the full chain
before their HTTP portion while keeping the scoped chain for the migration assertions.

## Limitations

- **Existing sessions are restricted, not revoked.** Flagging an account mid-session
  takes effect on the next request, which is immediate in practice, but the token itself
  remains valid for its normal lifetime. There is no token revocation list in this system.
- **No password complexity policy beyond a length of 8.** Unchanged from before this
  milestone; introducing one is a separate decision.
- **No expiry on the temporary credential.** A flagged account can sit unused
  indefinitely; it simply cannot do anything until the password is replaced.
- **`must_change_password` is not in the company data export.** The export milestone is
  closed and this is not a defect in it; the column is account state rather than HR data.
