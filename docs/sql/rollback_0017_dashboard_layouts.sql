-- REVIEW-ONLY rollback for migration 0017_dashboard_layouts. Not a migration file and
-- never applied by the runner. Rehearsed in the isolated laboratory.
--
-- Removes every saved Home layout and the ledger row. Each account simply returns
-- to its default Home; the API reports personalization as unavailable until 0017
-- is applied again. No other table, row, identifier or sequence is touched.

DROP TABLE public.user_dashboard_layouts;
DELETE FROM public.schema_migrations WHERE version = '0017';
