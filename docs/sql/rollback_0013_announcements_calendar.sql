-- REVIEW-ONLY rollback for migration 0013_announcements_calendar. Not a
-- migration file and never applied by the runner. Rehearsed in the isolated
-- laboratory.
--
-- Removes the four tables 0013 created and its ledger row. It DISCARDS every
-- announcement, read marker, company holiday and company event recorded since:
-- treat it as data-losing and approve it separately. No V2 table, row,
-- identifier or sequence is touched.

DROP TABLE public.announcement_reads;
DROP TABLE public.announcements;
DROP TABLE public.company_events;
DROP TABLE public.company_holidays;
DELETE FROM public.schema_migrations WHERE version = '0013';
