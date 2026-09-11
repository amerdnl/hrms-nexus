-- REVIEW-ONLY rollback for migration 0011_profiles_timeline. Not a migration file
-- and never applied by the runner. Rehearsed in the isolated laboratory.
--
-- Removes the two tables 0011 created, their trigger function and the ledger
-- row. It DISCARDS every About text, skill list, phone-sharing choice and
-- timeline event recorded since: treat it as data-losing and approve it
-- separately. No V2 table, row, identifier or sequence is touched.

DROP TRIGGER prevent_timeline_event_change ON public.employee_events;
DROP FUNCTION public.prevent_timeline_mutation();
DROP TABLE public.employee_events;
DROP TABLE public.employee_profiles;
DELETE FROM public.schema_migrations WHERE version = '0011';
