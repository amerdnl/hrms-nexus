-- V3 organisation structure: reporting lines.
--
-- Additive only. One nullable column on public.employees with its self-
-- referencing foreign key, one CHECK, one partial index, one function and one
-- trigger. Every existing employee starts with no manager, which is the truthful
-- state until an administrator records one; no row is rewritten or back-filled.
-- The five protected orphan attendance rows are not involved.
-- The runner owns the transaction and sets lock_timeout=5s / statement_timeout=60s.
--
-- WHY A MANAGER IS NOT A ROLE. users.role stays admin | employee. An employee is
-- a manager while at least one active or probation employee reports to them,
-- and the application derives that from this column on every request. Removing
-- a reporting line therefore removes the capability on the very next request:
-- there is no stored "manager" flag to forget and no token claim to go stale.

DO $preflight$
BEGIN
  IF to_regclass('public.employees') IS NULL THEN
    RAISE EXCEPTION 'Expected employees table is missing';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_attribute
    WHERE attrelid = 'public.employees'::regclass
      AND attname = 'manager_id' AND NOT attisdropped
  ) THEN
    RAISE EXCEPTION 'employees.manager_id already exists; review before applying 0010';
  END IF;

  IF to_regprocedure('public.prevent_manager_cycle()') IS NOT NULL THEN
    RAISE EXCEPTION 'prevent_manager_cycle() already exists; review before applying 0010';
  END IF;
END
$preflight$;

-- RESTRICT, like every other reference to an employee: a reporting line can
-- never be the reason an employee record is destroyed, and permanent deletion is
-- retired anyway. INTEGER matches the existing employee references (0004-0007).
ALTER TABLE public.employees
  ADD COLUMN manager_id INTEGER
    CONSTRAINT employees_manager_id_fkey
    REFERENCES public.employees(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT employees_manager_not_self
    CHECK (manager_id IS NULL OR manager_id <> id);

-- Team scope and the org chart both look up "who reports to X".
CREATE INDEX idx_employees_manager_id
  ON public.employees (manager_id) WHERE manager_id IS NOT NULL;

-- A CHECK can only see one row, so a loop through several people (A reports to
-- B, B to C, C to A) needs a trigger. It walks upward from the proposed manager
-- and refuses if it arrives back at the employee being changed.
CREATE FUNCTION public.prevent_manager_cycle()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $cycle$
DECLARE
  cursor_id BIGINT := NEW.manager_id;
  depth INTEGER := 0;
BEGIN
  IF NEW.manager_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.manager_id IS NOT DISTINCT FROM OLD.manager_id THEN
    RETURN NEW;
  END IF;

  -- Serialise reporting-line changes. Without this, "A under B" and "B under A"
  -- in two concurrent transactions each pass a check the other then breaks.
  -- The lock is released at commit or rollback.
  PERFORM pg_advisory_xact_lock(hashtext('hr_nexus:reporting_lines'));

  WHILE cursor_id IS NOT NULL LOOP
    IF cursor_id = NEW.id THEN
      RAISE EXCEPTION USING ERRCODE = '23514',
        CONSTRAINT = 'employees_manager_cycle',
        MESSAGE = 'This reporting line would make an employee report to themselves',
        HINT = 'Choose a manager who is not already below this employee.';
    END IF;

    depth := depth + 1;
    IF depth > 100 THEN
      RAISE EXCEPTION USING ERRCODE = '23514',
        CONSTRAINT = 'employees_manager_cycle',
        MESSAGE = 'Reporting lines deeper than 100 levels are not supported';
    END IF;

    SELECT e.manager_id INTO cursor_id FROM public.employees e WHERE e.id = cursor_id;
  END LOOP;

  RETURN NEW;
END
$cycle$;

CREATE TRIGGER prevent_manager_cycle
  BEFORE INSERT OR UPDATE OF manager_id ON public.employees
  FOR EACH ROW EXECUTE FUNCTION public.prevent_manager_cycle();

COMMENT ON COLUMN public.employees.manager_id IS
  'Direct manager. NULL means no reporting line is recorded. Team scope is the '
  'active and probation employees whose manager_id is a given employee, derived '
  'on every request; users.role is unchanged.';
COMMENT ON FUNCTION public.prevent_manager_cycle() IS
  'Refuses a reporting line that loops back to the employee (SQLSTATE 23514, '
  'constraint employees_manager_cycle). Serialised by a transaction advisory lock.';
