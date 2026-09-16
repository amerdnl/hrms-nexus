-- V3 dashboard personalization: one saved Home layout per account.
--
-- One new table. No existing table, column, constraint or row is modified; the
-- five protected orphan attendance rows and the payroll tables are not involved.
-- The runner owns the transaction and sets lock_timeout=5s / statement_timeout=60s.
--
-- A layout is presentation only: which Home widgets an account placed, in what
-- order and size, and how they are stacked. It is never an authorisation
-- decision. The API re-checks every widget against the account's current role
-- and reporting lines whenever it saves or reads a layout, and every widget's
-- data comes from endpoints that authorise themselves. An account with no row
-- sees the approved default Home, so removing the row is "Reset to default".

DO $preflight$
BEGIN
  IF to_regclass('public.users') IS NULL THEN
    RAISE EXCEPTION 'Expected users table is missing';
  END IF;
  IF to_regclass('public.user_dashboard_layouts') IS NOT NULL THEN
    RAISE EXCEPTION 'A user_dashboard_layouts table already exists; review before applying 0017';
  END IF;
END
$preflight$;

CREATE TABLE public.user_dashboard_layouts (
  user_id INTEGER PRIMARY KEY
    REFERENCES public.users(id) ON DELETE CASCADE ON UPDATE RESTRICT,
  -- Validated in full by the API; the database keeps only the outer shape and
  -- a size ceiling, so a malformed or oversized value can never be stored.
  layout JSONB NOT NULL CONSTRAINT chk_dashboard_layout_shape CHECK (
    jsonb_typeof(layout) = 'object'
    AND jsonb_typeof(layout -> 'version') = 'number'
    AND jsonb_typeof(layout -> 'items') = 'array'
    AND octet_length(layout::text) <= 16384
  ),
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE public.user_dashboard_layouts IS
  'Per-account Home personalization: widget order, sizes and stacks. Presentation only; '
  'never an authorisation decision. No row means the default Home.';
COMMENT ON COLUMN public.user_dashboard_layouts.layout IS
  'Version 1: {"version":1,"items":[{"kind":"widget","widget":id,"size":s} | '
  '{"kind":"stack","id":id,"size":s,"widgets":[ids],"smart":bool}]}.';
