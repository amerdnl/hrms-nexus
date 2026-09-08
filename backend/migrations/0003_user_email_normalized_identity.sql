-- Additive account-integrity migration: one case- and whitespace-insensitive unique
-- index on user email. No stored email value is rewritten, no business row is touched,
-- no sequence changes, and the existing case-sensitive users_email_key stays in place.
-- The runner owns the transaction and sets lock_timeout=5s / statement_timeout=60s.

-- CREATE INDEX already takes SHARE, which blocks concurrent writes. Taking it first
-- makes the collision preflight below authoritative rather than a stale snapshot.
LOCK TABLE public.users IN SHARE MODE;

-- Fail closed with a reviewable message instead of enforcing a new identity rule
-- against an unexpected column shape, or surfacing a bare 23505 for real collisions.
DO $preflight$
DECLARE
  email_column pg_attribute%ROWTYPE;
  collision_groups BIGINT;
BEGIN
  SELECT * INTO STRICT email_column FROM pg_attribute
    WHERE attrelid = 'public.users'::regclass AND attname = 'email' AND NOT attisdropped;

  IF email_column.atttypid NOT IN ('character varying'::regtype, 'text'::regtype) THEN
    RAISE EXCEPTION 'Unsupported users.email type; normalized identity expects a text column';
  END IF;

  IF NOT email_column.attnotnull THEN
    RAISE EXCEPTION 'users.email must be NOT NULL before normalized uniqueness is enforced';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_class WHERE relname = 'users_email_normalized_key'
      AND relnamespace = 'public'::regnamespace
  ) THEN
    RAISE EXCEPTION 'users_email_normalized_key already exists; review the ledger before reapplying';
  END IF;

  SELECT count(*) INTO collision_groups FROM (
    SELECT 1 FROM public.users GROUP BY lower(btrim(email)) HAVING count(*) > 1
  ) duplicates;

  IF collision_groups > 0 THEN
    RAISE EXCEPTION USING ERRCODE = '23505',
      MESSAGE = format('%s normalized email collision group(s) must be reviewed before enforcement', collision_groups),
      HINT = 'Resolve duplicates by explicit review. This migration never rewrites or deletes account emails.';
  END IF;
END
$preflight$;

CREATE UNIQUE INDEX users_email_normalized_key ON public.users (lower(btrim(email)));

COMMENT ON INDEX public.users_email_normalized_key IS
  'Case- and whitespace-insensitive account identity. Stored email values are preserved as entered; application lookups and duplicate checks must use lower(btrim(email)) to match this index.';
