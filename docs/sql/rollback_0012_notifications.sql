-- REVIEW-ONLY rollback for migration 0012_notifications. Not a migration file
-- and never applied by the runner. Rehearsed in the isolated laboratory.
--
-- Removes the notifications table 0012 created and its ledger row. It DISCARDS
-- every in-app notification and read marker recorded since: treat it as
-- data-losing and approve it separately. No V2 table, row, identifier or
-- sequence is touched; the business records the notifications pointed at are
-- unaffected.

DROP TABLE public.notifications;
DELETE FROM public.schema_migrations WHERE version = '0012';
