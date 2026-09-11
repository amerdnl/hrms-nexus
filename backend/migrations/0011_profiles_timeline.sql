-- V3 social profiles and the employee timeline.
--
-- Entirely new tables: employee_profiles (what an employee chooses to say about
-- themselves) and employee_events (what happened to them, with a visibility
-- tier per event). No existing table, column, constraint or row is modified;
-- the five protected orphan attendance rows are not involved.
-- The runner owns the transaction and sets lock_timeout=5s / statement_timeout=60s.
--
-- NOTHING SENSITIVE LIVES HERE. A profile holds an About text, skills and one
-- privacy switch. A timeline event holds a short title and a bounded detail;
-- salary, review content, reasons for leave, coordinates and credentials are
-- never written to either, and the application's writers name what they store.

DO $preflight$
BEGIN
  IF to_regclass('public.employees') IS NULL OR to_regclass('public.users') IS NULL THEN
    RAISE EXCEPTION 'Expected employees and users tables are missing';
  END IF;
  IF to_regclass('public.employee_profiles') IS NOT NULL
    OR to_regclass('public.employee_events') IS NOT NULL THEN
    RAISE EXCEPTION 'A profile or timeline table already exists; review before applying 0011';
  END IF;
  IF to_regprocedure('public.prevent_timeline_mutation()') IS NOT NULL THEN
    RAISE EXCEPTION 'prevent_timeline_mutation() already exists; review before applying 0011';
  END IF;
END
$preflight$;

-- One row per employee who has said something about themselves. Absent means
-- "nothing shared yet", which is also every existing employee's state.
CREATE TABLE public.employee_profiles (
  employee_id INTEGER PRIMARY KEY
    REFERENCES public.employees(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  about VARCHAR(2000),
  skills TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  -- Off by default: a work phone becomes visible to coworkers only when the
  -- employee turns this on. Email is the work account and is always visible.
  share_phone BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_by INTEGER REFERENCES public.users(id) ON DELETE SET NULL ON UPDATE RESTRICT,
  CONSTRAINT employee_profiles_skills_bounded CHECK (
    cardinality(skills) <= 30
    AND array_position(skills, NULL) IS NULL
    AND length(array_to_string(skills, '')) <= 1200
  ),
  CONSTRAINT employee_profiles_about_not_blank CHECK (about IS NULL OR length(btrim(about)) > 0)
);

-- The timeline. Each event carries who may see it:
--   company     every signed-in colleague (the social layer)
--   self        the employee and HR
--   management  the employee's manager and HR
CREATE TABLE public.employee_events (
  id BIGSERIAL PRIMARY KEY,
  employee_id INTEGER NOT NULL
    REFERENCES public.employees(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  kind VARCHAR(40) NOT NULL,
  visibility VARCHAR(12) NOT NULL
    CHECK (visibility IN ('company', 'self', 'management')),
  occurred_on DATE NOT NULL,
  title VARCHAR(200) NOT NULL CHECK (length(btrim(title)) > 0),
  detail JSONB,
  -- What produced the event, so a repeat delivery is recognised as the same one.
  source_type VARCHAR(40),
  source_id VARCHAR(64),
  actor_user_id INTEGER REFERENCES public.users(id) ON DELETE SET NULL ON UPDATE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT employee_events_detail_bounded CHECK (detail IS NULL OR length(detail::text) <= 2048),
  CONSTRAINT employee_events_source_paired CHECK ((source_type IS NULL) = (source_id IS NULL))
);

CREATE INDEX idx_employee_events_employee
  ON public.employee_events (employee_id, occurred_on DESC, id DESC);

-- Idempotency: the same source can produce a given kind of event for an
-- employee once, so a retried write cannot duplicate a milestone.
CREATE UNIQUE INDEX employee_events_source_once
  ON public.employee_events (employee_id, kind, source_type, source_id)
  WHERE source_id IS NOT NULL;

-- History is not edited. A trigger rather than privileges, for the same reason
-- as audit_events: the application connects as the owning role.
CREATE FUNCTION public.prevent_timeline_mutation()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $timeline$
BEGIN
  RAISE EXCEPTION USING ERRCODE = '23514',
    MESSAGE = 'Timeline events are append-only and cannot be changed or removed',
    HINT = 'Record a new event instead of editing history.';
END
$timeline$;

CREATE TRIGGER prevent_timeline_event_change
  BEFORE UPDATE OR DELETE ON public.employee_events
  FOR EACH ROW EXECUTE FUNCTION public.prevent_timeline_mutation();

COMMENT ON TABLE public.employee_profiles IS
  'What an employee chooses to share with colleagues: About, skills, and whether their phone is visible. Never HR data.';
COMMENT ON TABLE public.employee_events IS
  'Append-only employee timeline with a visibility tier per event (company, self, management). Titles and details never carry pay, review content, leave reasons, coordinates or credentials.';
