-- REVIEW-ONLY rollback for migration 0015_recognition. Not a migration file and
-- never applied by the runner. Rehearsed in the isolated laboratory.
--
-- Removes the recognitions table, its trigger and trigger function, and the
-- ledger row. It DISCARDS every recognition given since, hidden or not: treat
-- it as data-losing and approve it separately. Timeline events that referred
-- to a recognition stay in employee_events (append-only); with the table gone
-- the timeline simply stops checking whether they were hidden. No V2 table,
-- row, identifier or sequence is touched.

DROP TRIGGER prevent_recognition_rewrite ON public.recognitions;
DROP TABLE public.recognitions;
DROP FUNCTION public.prevent_recognition_rewrite();
DELETE FROM public.schema_migrations WHERE version = '0015';
