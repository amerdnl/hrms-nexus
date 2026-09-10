-- Forced first-login password change: one boolean on public.users recording that
-- an account is still holding a credential it did not choose.
--
-- Additive only. No existing table, column, constraint, index or row is modified,
-- no data is rewritten, and the five protected orphan attendance rows are not
-- involved. The runner owns the transaction and sets lock_timeout=5s /
-- statement_timeout=60s.
--
-- WHY THE DEFAULT IS FALSE: every account that already exists chose its own
-- password, or has been using one long enough that forcing a change would be a
-- surprise lockout rather than a security improvement. Turning the flag on is
-- therefore an explicit act performed by the code that mints a temporary
-- credential, never a consequence of this migration. Existing source users are
-- unaffected.
--
-- ON POSTGRESQL 11 AND LATER, adding a NOT NULL column with a non-volatile
-- DEFAULT is a catalogue-only change: the default is stored in pg_attribute and
-- no row is rewritten, so this does not scan or lock the table for the length of
-- a rewrite. That matters because users is referenced by ten foreign keys.
--
-- THE STATE IS NEVER A SECRET. This column records only that a change is owed.
-- The temporary password itself is not stored here or anywhere else: it is
-- hashed with bcrypt, shown to the administrator once, and then exists only in
-- that hash.

DO $preflight$
BEGIN
  IF to_regclass('public.users') IS NULL THEN
    RAISE EXCEPTION 'Expected users table is missing';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_attribute
    WHERE attrelid = 'public.users'::regclass
      AND attname = 'must_change_password'
      AND NOT attisdropped
  ) THEN
    RAISE EXCEPTION 'users.must_change_password already exists; review before applying 0009';
  END IF;
END
$preflight$;

ALTER TABLE public.users
  ADD COLUMN must_change_password BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.users.must_change_password IS
  'TRUE while the account still holds a generated or administrator-set temporary '
  'password. The server refuses every protected route except the current-user, '
  'password-change and logout endpoints until it is cleared, which happens in the '
  'same statement that writes the new password hash. Never encoded in a JWT: the '
  'value is read from this column on every authenticated request.';
