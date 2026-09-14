-- V3 goals and performance reviews.
--
-- Four new tables and two trigger functions. No existing table, column,
-- constraint or row is modified; the five protected orphan attendance rows and
-- the payroll tables are not involved.
-- The runner owns the transaction and sets lock_timeout=5s / statement_timeout=60s.
--
-- GOALS belong to an owner. Progress is defined explicitly: a whole percentage
-- from 0 to 100 that the owner or their current manager records, each change
-- kept in goal_updates; a completed goal is at 100 by rule. Visibility is
-- private (owner, manager, HR), team (also colleagues who share the manager)
-- or company. The manager is never stored: it is whoever manages the owner now.
--
-- REVIEWS run in cycles HR opens. Each participant writes a self-review first,
-- then their current manager writes theirs; both carry a 1-5 rating:
--   1 needs improvement, 2 developing, 3 meets expectations,
--   4 exceeds expectations, 5 outstanding.
-- Once submitted, what someone wrote is not rewritten: a trigger refuses it.
-- Review content is private HR data and is never shown to colleagues; the
-- application decides who reads what and audits HR's reads.

DO $preflight$
BEGIN
  IF to_regclass('public.employees') IS NULL OR to_regclass('public.users') IS NULL THEN
    RAISE EXCEPTION 'Expected employees and users tables are missing';
  END IF;
  IF to_regclass('public.goals') IS NOT NULL OR to_regclass('public.goal_updates') IS NOT NULL
    OR to_regclass('public.review_cycles') IS NOT NULL OR to_regclass('public.review_participants') IS NOT NULL THEN
    RAISE EXCEPTION 'A goal or review table already exists; review before applying 0016';
  END IF;
  IF to_regprocedure('public.prevent_goal_history_change()') IS NOT NULL
    OR to_regprocedure('public.prevent_review_rewrite()') IS NOT NULL THEN
    RAISE EXCEPTION 'A goal or review trigger function already exists; review before applying 0016';
  END IF;
END
$preflight$;

CREATE TABLE public.goals (
  id BIGSERIAL PRIMARY KEY,
  owner_employee_id INTEGER NOT NULL
    REFERENCES public.employees(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  title VARCHAR(160) NOT NULL CHECK (length(btrim(title)) > 0),
  description VARCHAR(2000),
  starts_on DATE NOT NULL,
  due_on DATE NOT NULL,
  status VARCHAR(10) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'cancelled')),
  progress SMALLINT NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
  visibility VARCHAR(10) NOT NULL DEFAULT 'private' CHECK (visibility IN ('private', 'team', 'company')),
  -- Whether the owner set it for themselves or their manager set it for them.
  created_as VARCHAR(10) NOT NULL CHECK (created_as IN ('owner', 'manager')),
  created_by INTEGER REFERENCES public.users(id) ON DELETE SET NULL ON UPDATE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1),
  CONSTRAINT goals_dates CHECK (due_on >= starts_on),
  CONSTRAINT goals_completed_stamped CHECK ((status = 'completed') = (completed_at IS NOT NULL)),
  CONSTRAINT goals_completed_at_full_progress CHECK (status <> 'completed' OR progress = 100),
  CONSTRAINT goals_cancelled_stamped CHECK ((status = 'cancelled') = (cancelled_at IS NOT NULL))
);

CREATE INDEX idx_goals_owner ON public.goals (owner_employee_id, status, due_on);

-- Every progress or status change, as it happened.
CREATE TABLE public.goal_updates (
  id BIGSERIAL PRIMARY KEY,
  goal_id BIGINT NOT NULL REFERENCES public.goals(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  author_user_id INTEGER REFERENCES public.users(id) ON DELETE SET NULL ON UPDATE RESTRICT,
  author_role VARCHAR(10) NOT NULL CHECK (author_role IN ('owner', 'manager')),
  progress_before SMALLINT NOT NULL CHECK (progress_before BETWEEN 0 AND 100),
  progress_after SMALLINT NOT NULL CHECK (progress_after BETWEEN 0 AND 100),
  status_before VARCHAR(10) NOT NULL CHECK (status_before IN ('active', 'completed', 'cancelled')),
  status_after VARCHAR(10) NOT NULL CHECK (status_after IN ('active', 'completed', 'cancelled')),
  note VARCHAR(1000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_goal_updates_goal ON public.goal_updates (goal_id, created_at DESC, id DESC);

CREATE FUNCTION public.prevent_goal_history_change()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $goal$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Goal history is kept and cannot be deleted';
  END IF;
  -- Only an account removal clearing the author is allowed through.
  IF NEW.goal_id IS DISTINCT FROM OLD.goal_id OR NEW.author_role IS DISTINCT FROM OLD.author_role
    OR NEW.progress_before IS DISTINCT FROM OLD.progress_before OR NEW.progress_after IS DISTINCT FROM OLD.progress_after
    OR NEW.status_before IS DISTINCT FROM OLD.status_before OR NEW.status_after IS DISTINCT FROM OLD.status_after
    OR NEW.note IS DISTINCT FROM OLD.note OR NEW.created_at IS DISTINCT FROM OLD.created_at
    OR (NEW.author_user_id IS DISTINCT FROM OLD.author_user_id AND NEW.author_user_id IS NOT NULL) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Goal history cannot be rewritten';
  END IF;
  RETURN NEW;
END
$goal$;

CREATE TRIGGER prevent_goal_history_change
  BEFORE UPDATE OR DELETE ON public.goal_updates
  FOR EACH ROW EXECUTE FUNCTION public.prevent_goal_history_change();

CREATE TABLE public.review_cycles (
  id BIGSERIAL PRIMARY KEY,
  name VARCHAR(120) NOT NULL CHECK (length(btrim(name)) > 0),
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  self_due_on DATE NOT NULL,
  manager_due_on DATE NOT NULL,
  status VARCHAR(10) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'open', 'closed')),
  opened_at TIMESTAMPTZ,
  opened_by INTEGER REFERENCES public.users(id) ON DELETE SET NULL ON UPDATE RESTRICT,
  closed_at TIMESTAMPTZ,
  closed_by INTEGER REFERENCES public.users(id) ON DELETE SET NULL ON UPDATE RESTRICT,
  created_by INTEGER REFERENCES public.users(id) ON DELETE SET NULL ON UPDATE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1),
  CONSTRAINT review_cycles_period CHECK (period_end >= period_start),
  CONSTRAINT review_cycles_due_order CHECK (manager_due_on >= self_due_on),
  CONSTRAINT review_cycles_opened_stamped CHECK ((status = 'draft') = (opened_at IS NULL)),
  CONSTRAINT review_cycles_closed_stamped CHECK ((status = 'closed') = (closed_at IS NOT NULL))
);

CREATE UNIQUE INDEX review_cycles_name_once ON public.review_cycles (lower(name));

CREATE TABLE public.review_participants (
  id BIGSERIAL PRIMARY KEY,
  cycle_id BIGINT NOT NULL REFERENCES public.review_cycles(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  employee_id INTEGER NOT NULL REFERENCES public.employees(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  status VARCHAR(16) NOT NULL DEFAULT 'pending_self'
    CHECK (status IN ('pending_self', 'pending_manager', 'completed')),
  self_summary VARCHAR(4000),
  self_rating SMALLINT CHECK (self_rating BETWEEN 1 AND 5),
  self_submitted_at TIMESTAMPTZ,
  manager_summary VARCHAR(4000),
  manager_rating SMALLINT CHECK (manager_rating BETWEEN 1 AND 5),
  manager_submitted_at TIMESTAMPTZ,
  manager_submitted_by INTEGER REFERENCES public.users(id) ON DELETE SET NULL ON UPDATE RESTRICT,
  employee_response VARCHAR(2000),
  responded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT review_participants_once UNIQUE (cycle_id, employee_id),
  -- Self first, then manager, then complete.
  CONSTRAINT review_participants_order CHECK (
    (status = 'pending_self' AND self_submitted_at IS NULL AND manager_submitted_at IS NULL)
    OR (status = 'pending_manager' AND self_submitted_at IS NOT NULL AND manager_submitted_at IS NULL)
    OR (status = 'completed' AND self_submitted_at IS NOT NULL AND manager_submitted_at IS NOT NULL)
  ),
  CONSTRAINT review_participants_self_complete CHECK (
    self_submitted_at IS NULL OR (self_summary IS NOT NULL AND self_rating IS NOT NULL)
  ),
  CONSTRAINT review_participants_manager_complete CHECK (
    manager_submitted_at IS NULL OR (manager_summary IS NOT NULL AND manager_rating IS NOT NULL)
  ),
  CONSTRAINT review_participants_response CHECK (
    (responded_at IS NULL) = (employee_response IS NULL) AND (responded_at IS NULL OR status = 'completed')
  )
);

CREATE INDEX idx_review_participants_employee ON public.review_participants (employee_id, cycle_id);
CREATE INDEX idx_review_participants_cycle ON public.review_participants (cycle_id, status);

CREATE FUNCTION public.prevent_review_rewrite()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $review$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'A review is kept and cannot be deleted';
  END IF;
  IF NEW.cycle_id IS DISTINCT FROM OLD.cycle_id OR NEW.employee_id IS DISTINCT FROM OLD.employee_id
    OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'A review cannot move to another cycle or person';
  END IF;
  IF OLD.self_submitted_at IS NOT NULL AND (
    NEW.self_summary IS DISTINCT FROM OLD.self_summary OR NEW.self_rating IS DISTINCT FROM OLD.self_rating
    OR NEW.self_submitted_at IS DISTINCT FROM OLD.self_submitted_at) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'A submitted self-review cannot be rewritten';
  END IF;
  IF OLD.manager_submitted_at IS NOT NULL AND (
    NEW.manager_summary IS DISTINCT FROM OLD.manager_summary OR NEW.manager_rating IS DISTINCT FROM OLD.manager_rating
    OR NEW.manager_submitted_at IS DISTINCT FROM OLD.manager_submitted_at) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'A submitted manager review cannot be rewritten';
  END IF;
  IF OLD.responded_at IS NOT NULL AND (
    NEW.employee_response IS DISTINCT FROM OLD.employee_response OR NEW.responded_at IS DISTINCT FROM OLD.responded_at) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'A submitted response cannot be rewritten';
  END IF;
  RETURN NEW;
END
$review$;

CREATE TRIGGER prevent_review_rewrite
  BEFORE UPDATE OR DELETE ON public.review_participants
  FOR EACH ROW EXECUTE FUNCTION public.prevent_review_rewrite();

COMMENT ON TABLE public.goals IS
  'Goals with an owner, dates, 0-100 progress (100 when completed) and private/team/company visibility. The manager is whoever manages the owner now.';
COMMENT ON TABLE public.goal_updates IS
  'Append-only history of each goal''s progress and status changes.';
COMMENT ON TABLE public.review_cycles IS
  'Performance review cycles HR drafts, opens and closes.';
COMMENT ON TABLE public.review_participants IS
  'One person''s review in a cycle: self-review, then manager review, each with a 1-5 rating, then an optional response. Submitted content is never rewritten. Private HR data.';
