-- Audit Log V1: one append-only table recording important administrative,
-- security and business actions.
-- Entirely a new table. No existing table, column, constraint or row is modified,
-- and the five protected orphan attendance rows are not involved.
-- The runner owns the transaction and sets lock_timeout=5s / statement_timeout=60s.
--
-- WHAT IS DELIBERATELY NOT STORED: passwords, password hashes, JWTs, QR codes or
-- their hashes, any secret, and attendance coordinates/accuracy/distance. The
-- application redacts by key name before writing, and the size ceiling below
-- means a raw request body cannot be dropped in wholesale either.

DO $preflight$
BEGIN
  IF to_regclass('public.users') IS NULL OR to_regclass('public.employees') IS NULL THEN
    RAISE EXCEPTION 'Expected users and employees tables are missing';
  END IF;

  IF to_regclass('public.audit_events') IS NOT NULL THEN
    RAISE EXCEPTION 'An audit_events table already exists; review it before applying 0008';
  END IF;
END
$preflight$;

CREATE TABLE public.audit_events (
  id BIGSERIAL PRIMARY KEY,

  -- Database time, never a client-supplied timestamp.
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  -- The actor, by reference where it still exists. SET NULL rather than RESTRICT:
  -- an audit row must never be the reason a permitted deletion fails, and
  -- actor_label below preserves who it was regardless.
  actor_user_id INTEGER
    REFERENCES public.users(id) ON DELETE SET NULL ON UPDATE RESTRICT,
  actor_employee_id INTEGER
    REFERENCES public.employees(id) ON DELETE SET NULL ON UPDATE RESTRICT,

  -- Identity snapshot, so an entry stays readable after the account is gone.
  -- For a failed sign-in this is the address that was attempted, which is
  -- untrusted input and is therefore length-bounded like every other column.
  actor_label VARCHAR(160) NOT NULL,
  actor_role VARCHAR(20),

  action VARCHAR(60) NOT NULL,
  entity_type VARCHAR(40) NOT NULL,
  -- Text rather than an integer: entities here have INTEGER and BIGINT keys, and
  -- some events legitimately have no single target.
  entity_id VARCHAR(64),

  -- A sentence a person can read without decoding the change set.
  summary VARCHAR(500) NOT NULL,

  -- {"field": {"before": ..., "after": ...}} with sensitive keys already removed
  -- by the application. Bounded so no code path can turn this into a request-body
  -- dump.
  changes JSONB,

  outcome VARCHAR(20) NOT NULL DEFAULT 'success',

  CONSTRAINT audit_outcome_known CHECK (outcome IN ('success', 'failure')),
  CONSTRAINT audit_changes_bounded CHECK (changes IS NULL OR length(changes::text) <= 8192)
);

-- Newest first is the only ordering the log is ever read in.
CREATE INDEX idx_audit_events_occurred ON public.audit_events (occurred_at DESC, id DESC);
CREATE INDEX idx_audit_events_action ON public.audit_events (action);
CREATE INDEX idx_audit_events_entity ON public.audit_events (entity_type, entity_id);
CREATE INDEX idx_audit_events_actor ON public.audit_events (actor_user_id);

-- Append-only, enforced by the database rather than by convention. A trigger is
-- used instead of REVOKE because the application connects as the owning role,
-- which privileges alone would not restrain.
CREATE FUNCTION public.prevent_audit_mutation()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $audit$
BEGIN
  RAISE EXCEPTION USING ERRCODE = '23514',
    MESSAGE = 'Audit events are append-only and cannot be changed or removed',
    HINT = 'Record a correcting event instead of editing history.';
END
$audit$;

CREATE TRIGGER prevent_audit_event_change
  BEFORE UPDATE OR DELETE ON public.audit_events
  FOR EACH ROW EXECUTE FUNCTION public.prevent_audit_mutation();

COMMENT ON TABLE public.audit_events IS
  'Append-only record of important administrative, security and business actions. '
  'Never contains passwords, hashes, tokens, QR material, secrets or attendance '
  'coordinates. Rows cannot be updated or deleted; a trigger enforces this.';
COMMENT ON COLUMN public.audit_events.actor_label IS
  'Snapshot of the actor identity, kept readable after the account is deleted. '
  'For a failed sign-in this is the attempted address, which is untrusted input.';
COMMENT ON COLUMN public.audit_events.changes IS
  'Redacted before/after summary, bounded to 8 KB so it cannot become a request dump.';
