-- Proposed history-retention migration. Apply to the existing database only after
-- explicit review. INTEGER/BIGINT columns, sequence state and business rows are untouched.
-- The runner owns the transaction and sets lock_timeout=5s / statement_timeout=60s.

LOCK TABLE public.employees, public.users, public.leave_requests, public.attendance
  IN ACCESS EXCLUSIVE MODE;

-- Accept the inspected legacy baseline and schema.sql baseline. Fail closed on
-- unexpected FK definitions instead of silently replacing a different relationship.
DO $preflight$
DECLARE
  relation_name TEXT;
  relation_oid REGCLASS;
  foreign_key RECORD;
  employee_column SMALLINT;
  employee_pk SMALLINT;
BEGIN
  SELECT attnum INTO STRICT employee_pk FROM pg_attribute
    WHERE attrelid = 'public.employees'::regclass AND attname = 'id' AND NOT attisdropped;
  IF (SELECT atttypid NOT IN ('integer'::regtype, 'bigint'::regtype)
      FROM pg_attribute WHERE attrelid = 'public.employees'::regclass AND attnum = employee_pk) THEN
    RAISE EXCEPTION 'Unsupported employee ID type';
  END IF;
  FOREACH relation_name IN ARRAY ARRAY['users', 'leave_requests', 'attendance'] LOOP
    relation_oid := format('public.%I', relation_name)::regclass;
    SELECT attnum INTO STRICT employee_column FROM pg_attribute
      WHERE attrelid = relation_oid AND attname = 'employee_id' AND NOT attisdropped;
    IF EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conrelid = relation_oid AND contype = 'f'
        AND employee_column = ANY(conkey)
        AND conname <> relation_name || '_employee_id_fkey'
    ) THEN
      RAISE EXCEPTION 'Unexpected additional employee FK on %', relation_name;
    END IF;
    SELECT * INTO foreign_key FROM pg_constraint
      WHERE conrelid = relation_oid AND conname = relation_name || '_employee_id_fkey';
    IF NOT FOUND THEN
      IF relation_name <> 'attendance' THEN
        RAISE EXCEPTION 'Expected employee FK is missing on %', relation_name;
      END IF;
    ELSE
      IF foreign_key.contype <> 'f'
        OR foreign_key.confrelid <> 'public.employees'::regclass
        OR foreign_key.conkey <> ARRAY[employee_column]
        OR foreign_key.confkey <> ARRAY[employee_pk]
        OR foreign_key.confdeltype NOT IN ('a', 'r', 'c')
        OR foreign_key.confupdtype NOT IN ('a', 'r')
        OR foreign_key.confmatchtype <> 's'
        OR foreign_key.condeferrable
        OR (relation_name <> 'attendance' AND NOT foreign_key.convalidated) THEN
        RAISE EXCEPTION 'Unexpected employee FK definition on %', relation_name;
      END IF;
      EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT %I',
        relation_name, relation_name || '_employee_id_fkey');
    END IF;
    EXECUTE format(
      'ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (employee_id) '
      'REFERENCES public.employees(id) ON DELETE RESTRICT ON UPDATE RESTRICT NOT VALID',
      relation_name, relation_name || '_employee_id_fkey');
  END LOOP;
END
$preflight$;

ALTER TABLE public.users VALIDATE CONSTRAINT users_employee_id_fkey;
ALTER TABLE public.leave_requests VALIDATE CONSTRAINT leave_requests_employee_id_fkey;

-- Existing orphan rows remain exceptions. Fresh/clean baselines can be validated.
DO $validation$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.attendance a
    WHERE NOT EXISTS (SELECT 1 FROM public.employees e WHERE e.id = a.employee_id)
  ) THEN
    ALTER TABLE public.attendance VALIDATE CONSTRAINT attendance_employee_id_fkey;
  END IF;
END
$validation$;

-- NOT VALID alone does not stop insertion of a parent using an orphan's historical
-- employee ID. Prevent that accidental adoption without fabricating employees.
CREATE FUNCTION public.prevent_orphan_employee_id_reuse()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $guard$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.id = OLD.id THEN RETURN NEW; END IF;
  END IF;
  IF EXISTS (SELECT 1 FROM public.attendance WHERE employee_id = NEW.id)
    AND NOT EXISTS (SELECT 1 FROM public.employees WHERE id = NEW.id) THEN
    RAISE EXCEPTION USING ERRCODE = '23514',
      MESSAGE = 'This employee ID is referenced by attendance history; reviewed reconciliation is required';
  END IF;
  RETURN NEW;
END
$guard$;

CREATE TRIGGER prevent_orphan_employee_id_reuse
  BEFORE INSERT OR UPDATE OF id ON public.employees
  FOR EACH ROW EXECUTE FUNCTION public.prevent_orphan_employee_id_reuse();

-- Non-key corrections to historical exceptions still work. Changing their owner
-- requires a separate reviewed reconciliation, not an ordinary attendance edit.
CREATE FUNCTION public.prevent_orphan_attendance_reassignment()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $guard$
BEGIN
  IF NEW.employee_id IS DISTINCT FROM OLD.employee_id
    AND NOT EXISTS (SELECT 1 FROM public.employees WHERE id = OLD.employee_id) THEN
    RAISE EXCEPTION USING ERRCODE = '23514',
      MESSAGE = 'Historical orphan attendance ownership requires reviewed reconciliation';
  END IF;
  RETURN NEW;
END
$guard$;

CREATE TRIGGER prevent_orphan_attendance_reassignment
  BEFORE UPDATE OF employee_id ON public.attendance
  FOR EACH ROW EXECUTE FUNCTION public.prevent_orphan_attendance_reassignment();

CREATE VIEW public.attendance_integrity_exceptions AS
SELECT a.*, 'missing_employee'::text AS integrity_issue
FROM public.attendance a
LEFT JOIN public.employees e ON e.id = a.employee_id
WHERE e.id IS NULL;

REVOKE ALL ON public.attendance_integrity_exceptions FROM PUBLIC;
COMMENT ON VIEW public.attendance_integrity_exceptions IS
  'Unresolved attendance ownership. Retain original rows and employee IDs; reconciliation requires explicit review.';
