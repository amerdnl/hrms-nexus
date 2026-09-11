-- REVIEW-ONLY rollback for migration 0010_org_structure. Not a migration file and
-- never applied by the runner. Rehearsed in the isolated laboratory.
--
-- It removes every object 0010 created and its ledger row, and nothing else. It
-- also DISCARDS every reporting line recorded since 0010 was applied: once
-- managers have been entered, the pre-apply backup is not a substitute for them,
-- and this should be treated as a data-losing operation needing its own approval.
-- Business rows, identifiers and sequences are otherwise unchanged.

DROP TRIGGER prevent_manager_cycle ON public.employees;
DROP FUNCTION public.prevent_manager_cycle();
DROP INDEX public.idx_employees_manager_id;
ALTER TABLE public.employees
  DROP CONSTRAINT employees_manager_not_self,
  DROP CONSTRAINT employees_manager_id_fkey,
  DROP COLUMN manager_id;
DELETE FROM public.schema_migrations WHERE version = '0010';
