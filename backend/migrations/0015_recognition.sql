-- V3 recognition: short, professional thank-yous between colleagues.
--
-- One new table and one trigger function. No existing table, column,
-- constraint or row is modified; the five protected orphan attendance rows
-- and the payroll tables are not involved.
-- The runner owns the transaction and sets lock_timeout=5s / statement_timeout=60s.
--
-- A recognition is what one employee said to another: giver, receiver, one of
-- a closed list of categories, a message of 5-500 characters, and whether the
-- company may see it. It is never rewritten: the trigger lets only the
-- moderation fields change, so HR hides abuse rather than editing or deleting
-- someone's words. The same giver can recognise the same colleague once per
-- company day; the application also caps how many one person gives a day.
-- Nothing here is pay, a review or a private HR record.

DO $preflight$
BEGIN
  IF to_regclass('public.employees') IS NULL OR to_regclass('public.users') IS NULL THEN
    RAISE EXCEPTION 'Expected employees and users tables are missing';
  END IF;
  IF to_regclass('public.recognitions') IS NOT NULL THEN
    RAISE EXCEPTION 'A recognitions table already exists; review before applying 0015';
  END IF;
  IF to_regprocedure('public.prevent_recognition_rewrite()') IS NOT NULL THEN
    RAISE EXCEPTION 'prevent_recognition_rewrite() already exists; review before applying 0015';
  END IF;
END
$preflight$;

CREATE TABLE public.recognitions (
  id BIGSERIAL PRIMARY KEY,
  giver_employee_id INTEGER NOT NULL
    REFERENCES public.employees(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  receiver_employee_id INTEGER NOT NULL
    REFERENCES public.employees(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  category VARCHAR(20) NOT NULL CHECK (
    category IN ('teamwork', 'above_and_beyond', 'customer_focus', 'problem_solving', 'mentoring')
  ),
  message VARCHAR(500) NOT NULL CHECK (length(btrim(message)) BETWEEN 5 AND 500),
  -- company: colleagues see it on the profile and the feed.
  -- private: only the giver, the receiver and HR.
  visibility VARCHAR(10) NOT NULL DEFAULT 'company' CHECK (visibility IN ('company', 'private')),
  -- The company date it was given on, for the once-a-day rule.
  given_on DATE NOT NULL,
  created_by INTEGER REFERENCES public.users(id) ON DELETE SET NULL ON UPDATE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  hidden_at TIMESTAMPTZ,
  hidden_by INTEGER REFERENCES public.users(id) ON DELETE SET NULL ON UPDATE RESTRICT,
  CONSTRAINT recognitions_not_self CHECK (giver_employee_id <> receiver_employee_id),
  CONSTRAINT recognitions_hidden_by_needs_hidden_at CHECK (hidden_by IS NULL OR hidden_at IS NOT NULL)
);

CREATE UNIQUE INDEX recognitions_once_a_day
  ON public.recognitions (giver_employee_id, receiver_employee_id, given_on);
CREATE INDEX idx_recognitions_receiver
  ON public.recognitions (receiver_employee_id, created_at DESC, id DESC);
CREATE INDEX idx_recognitions_giver_day
  ON public.recognitions (giver_employee_id, given_on);
CREATE INDEX idx_recognitions_company_feed
  ON public.recognitions (created_at DESC, id DESC)
  WHERE visibility = 'company' AND hidden_at IS NULL;

-- Words are not rewritten and not deleted; only moderation changes. A trigger
-- rather than privileges, for the same reason as the audit log: the
-- application connects as the owning role.
CREATE FUNCTION public.prevent_recognition_rewrite()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $recognition$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION USING ERRCODE = '23514',
      MESSAGE = 'Recognition is kept as given and cannot be deleted',
      HINT = 'Hide it instead.';
  END IF;
  IF NEW.giver_employee_id IS DISTINCT FROM OLD.giver_employee_id
    OR NEW.receiver_employee_id IS DISTINCT FROM OLD.receiver_employee_id
    OR NEW.category IS DISTINCT FROM OLD.category
    OR NEW.message IS DISTINCT FROM OLD.message
    OR NEW.visibility IS DISTINCT FROM OLD.visibility
    OR NEW.given_on IS DISTINCT FROM OLD.given_on
    OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION USING ERRCODE = '23514',
      MESSAGE = 'Recognition cannot be rewritten; only whether it is hidden can change',
      HINT = 'Hide it instead of editing it.';
  END IF;
  RETURN NEW;
END
$recognition$;

CREATE TRIGGER prevent_recognition_rewrite
  BEFORE UPDATE OR DELETE ON public.recognitions
  FOR EACH ROW EXECUTE FUNCTION public.prevent_recognition_rewrite();

COMMENT ON TABLE public.recognitions IS
  'Short professional recognition between colleagues: giver, receiver, category, message, company or private. Never rewritten or deleted; HR hides abuse.';
