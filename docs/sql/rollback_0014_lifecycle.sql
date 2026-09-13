-- REVIEW-ONLY rollback for migration 0014_lifecycle. Not a migration file and
-- never applied by the runner. Rehearsed in the isolated laboratory.
--
-- Removes the four tables 0014 created and its ledger row. It DISCARDS every
-- onboarding and offboarding template, plan and task recorded since: treat it
-- as data-losing and approve it separately. Employment statuses and account
-- states that completed offboarding plans changed are NOT reverted by this
-- file; those changes were made to V2 tables through the audited employee
-- lifecycle and stay as recorded. No V2 table, row, identifier or sequence is
-- touched.

DROP TABLE public.lifecycle_tasks;
DROP TABLE public.lifecycle_plans;
DROP TABLE public.lifecycle_template_tasks;
DROP TABLE public.lifecycle_templates;
DELETE FROM public.schema_migrations WHERE version = '0014';
