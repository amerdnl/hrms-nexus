-- REVIEW-ONLY rollback for migration 0016_goals_reviews. Not a migration file
-- and never applied by the runner. Rehearsed in the isolated laboratory.
--
-- Removes the four tables 0016 created, their triggers and trigger functions,
-- and the ledger row. It DISCARDS every goal, goal update, review cycle and
-- review recorded since, including submitted self and manager reviews: treat
-- it as data-losing and approve it separately. Timeline events that referred to
-- goals or reviews stay in employee_events (append-only). No V2 table, row,
-- identifier or sequence is touched.

DROP TRIGGER prevent_review_rewrite ON public.review_participants;
DROP TRIGGER prevent_goal_history_change ON public.goal_updates;
DROP TABLE public.review_participants;
DROP TABLE public.review_cycles;
DROP TABLE public.goal_updates;
DROP TABLE public.goals;
DROP FUNCTION public.prevent_review_rewrite();
DROP FUNCTION public.prevent_goal_history_change();
DELETE FROM public.schema_migrations WHERE version = '0016';
