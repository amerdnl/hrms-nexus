-- V3 onboarding and offboarding.
--
-- Four new tables: lifecycle_templates and lifecycle_template_tasks (the
-- checklists HR maintains), lifecycle_plans (one employee's onboarding or
-- offboarding) and lifecycle_tasks (that plan's own copy of the checklist). No
-- existing table, column, constraint or row is modified; the five protected
-- orphan attendance rows and the payroll tables are not involved.
-- The runner owns the transaction and sets lock_timeout=5s / statement_timeout=60s.
--
-- A task is assigned to a ROLE - the employee, their manager, or HR - and never
-- to a stored person. Who holds a role is read from current data each time, so
-- a reporting line that changes mid-plan moves the manager's tasks with it.
--
-- A plan copies its template's tasks when it starts, so editing a template
-- never rewrites work already under way. Plans are cancelled or completed,
-- never deleted: they are part of the employee's history. Completing an
-- offboarding plan is the only step that changes anything outside these
-- tables, and it does so in the application through the same employee
-- lifecycle path HR's deactivate action uses.

DO $preflight$
BEGIN
  IF to_regclass('public.employees') IS NULL OR to_regclass('public.users') IS NULL THEN
    RAISE EXCEPTION 'Expected employees and users tables are missing';
  END IF;
  IF to_regclass('public.lifecycle_templates') IS NOT NULL
    OR to_regclass('public.lifecycle_template_tasks') IS NOT NULL
    OR to_regclass('public.lifecycle_plans') IS NOT NULL
    OR to_regclass('public.lifecycle_tasks') IS NOT NULL THEN
    RAISE EXCEPTION 'A lifecycle table already exists; review before applying 0014';
  END IF;
END
$preflight$;

CREATE TABLE public.lifecycle_templates (
  id BIGSERIAL PRIMARY KEY,
  kind VARCHAR(12) NOT NULL CHECK (kind IN ('onboarding', 'offboarding')),
  name VARCHAR(120) NOT NULL CHECK (length(btrim(name)) > 0),
  description VARCHAR(1000),
  -- Retired templates stay for the plans that came from them.
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by INTEGER REFERENCES public.users(id) ON DELETE SET NULL ON UPDATE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_by INTEGER REFERENCES public.users(id) ON DELETE SET NULL ON UPDATE RESTRICT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1)
);

CREATE UNIQUE INDEX lifecycle_templates_name_once
  ON public.lifecycle_templates (kind, lower(name));

CREATE TABLE public.lifecycle_template_tasks (
  id BIGSERIAL PRIMARY KEY,
  -- A template's checklist is part of the template; plans hold their own copy.
  template_id BIGINT NOT NULL
    REFERENCES public.lifecycle_templates(id) ON DELETE CASCADE ON UPDATE RESTRICT,
  position SMALLINT NOT NULL CHECK (position BETWEEN 1 AND 100),
  title VARCHAR(160) NOT NULL CHECK (length(btrim(title)) > 0),
  instructions VARCHAR(1000),
  assignee_role VARCHAR(10) NOT NULL CHECK (assignee_role IN ('employee', 'manager', 'hr')),
  -- Days from the plan's anchor: the start date for onboarding, the last
  -- working day for offboarding (so -5 means five days before they leave).
  due_offset_days SMALLINT NOT NULL DEFAULT 0 CHECK (due_offset_days BETWEEN -365 AND 365),
  CONSTRAINT lifecycle_template_tasks_position_once UNIQUE (template_id, position)
);

CREATE TABLE public.lifecycle_plans (
  id BIGSERIAL PRIMARY KEY,
  employee_id INTEGER NOT NULL
    REFERENCES public.employees(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  kind VARCHAR(12) NOT NULL CHECK (kind IN ('onboarding', 'offboarding')),
  template_id BIGINT REFERENCES public.lifecycle_templates(id) ON DELETE SET NULL ON UPDATE RESTRICT,
  -- A snapshot of the template's name when the plan started.
  title VARCHAR(160) NOT NULL CHECK (length(btrim(title)) > 0),
  status VARCHAR(12) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'cancelled')),
  -- Onboarding: first day. Offboarding: the day the plan starts (usually notice).
  starts_on DATE NOT NULL,
  -- Onboarding: when it should be finished. Offboarding: the last working day.
  target_date DATE NOT NULL,
  -- Offboarding only: the employment status the employee leaves with.
  exit_status VARCHAR(12) CHECK (exit_status IN ('resigned', 'terminated', 'inactive')),
  completed_at TIMESTAMPTZ,
  completed_by INTEGER REFERENCES public.users(id) ON DELETE SET NULL ON UPDATE RESTRICT,
  cancelled_at TIMESTAMPTZ,
  cancelled_by INTEGER REFERENCES public.users(id) ON DELETE SET NULL ON UPDATE RESTRICT,
  created_by INTEGER REFERENCES public.users(id) ON DELETE SET NULL ON UPDATE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1),
  CONSTRAINT lifecycle_plans_dates CHECK (target_date >= starts_on),
  CONSTRAINT lifecycle_plans_exit_status CHECK ((kind = 'offboarding') = (exit_status IS NOT NULL)),
  CONSTRAINT lifecycle_plans_completed_stamped CHECK ((status = 'completed') = (completed_at IS NOT NULL)),
  CONSTRAINT lifecycle_plans_cancelled_stamped CHECK ((status = 'cancelled') = (cancelled_at IS NOT NULL))
);

-- One plan of each kind in progress per employee, enforced by the database.
CREATE UNIQUE INDEX lifecycle_plans_one_active
  ON public.lifecycle_plans (employee_id, kind)
  WHERE status = 'active';
CREATE INDEX idx_lifecycle_plans_status ON public.lifecycle_plans (kind, status, target_date);

CREATE TABLE public.lifecycle_tasks (
  id BIGSERIAL PRIMARY KEY,
  plan_id BIGINT NOT NULL
    REFERENCES public.lifecycle_plans(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  position SMALLINT NOT NULL CHECK (position BETWEEN 1 AND 100),
  title VARCHAR(160) NOT NULL CHECK (length(btrim(title)) > 0),
  instructions VARCHAR(1000),
  assignee_role VARCHAR(10) NOT NULL CHECK (assignee_role IN ('employee', 'manager', 'hr')),
  due_on DATE NOT NULL,
  status VARCHAR(10) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'done', 'skipped')),
  -- A short completion note, e.g. "laptop returned to IT"; never a sensitive record.
  note VARCHAR(500),
  completed_at TIMESTAMPTZ,
  completed_by INTEGER REFERENCES public.users(id) ON DELETE SET NULL ON UPDATE RESTRICT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT lifecycle_tasks_position_once UNIQUE (plan_id, position),
  CONSTRAINT lifecycle_tasks_completed_stamped CHECK ((status = 'pending') = (completed_at IS NULL))
);

CREATE INDEX idx_lifecycle_tasks_open ON public.lifecycle_tasks (assignee_role, status, due_on);

COMMENT ON TABLE public.lifecycle_templates IS
  'Onboarding and offboarding checklists HR maintains. Retired, not deleted, once plans have used them.';
COMMENT ON TABLE public.lifecycle_template_tasks IS
  'A template''s tasks: title, instructions, the role that does it, and when relative to the plan''s anchor date.';
COMMENT ON TABLE public.lifecycle_plans IS
  'One employee''s onboarding or offboarding. One active plan per employee per kind. Completed or cancelled, never deleted.';
COMMENT ON TABLE public.lifecycle_tasks IS
  'A plan''s own copy of its checklist. Assigned to a role (employee, manager, hr) resolved from current data, never to a stored person.';
