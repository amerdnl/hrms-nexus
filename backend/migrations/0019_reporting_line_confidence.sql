-- How well established an employee's reporting line is.
--
-- Additive only. One nullable column on public.employees and one CHECK. No
-- existing row is rewritten, no existing column, constraint or index is
-- modified, and the five protected orphan attendance rows are not involved. The
-- runner owns the transaction and sets lock_timeout=5s / statement_timeout=60s.
--
-- WHY THIS EXISTS. employees.manager_id can only be set or not set. That is the
-- right shape when HR records a reporting line it knows to be true, and the
-- wrong shape when an organisation chart is transcribed from a customer's own
-- diagram for them to review. There, some lines are drawn box to box and are
-- certain; some are drawn through a shared elbow and are near-certain; and some
-- are a loose line the diagram never actually attached to anything. Storing all
-- three as a plain manager_id makes the product assert a reporting line that the
-- source never confirmed, which is exactly what the reviewer is being asked to
-- check. This column lets the chart say "this one is not settled" instead.
--
-- WHY NULL IS THE DEFAULT AND MEANS "NOT ASSESSED". Every reporting line that
-- exists today was recorded by an administrator who knew it, so there is no
-- question over it and nothing to display. NULL is therefore the truthful value
-- for all of them, and the interface shows nothing extra. Only a line that some
-- process has deliberately graded carries a value. A NOT NULL column with a
-- default of 'confirmed' would have been a claim about data nobody graded.
--
-- WHAT THIS IS NOT. It is not a permission, not a visibility rule and not an
-- employment status. It changes nothing about who reports to whom: manager_id
-- remains the single source of the hierarchy, and team scope, the org chart and
-- every authorisation check continue to read that column alone. This one is
-- presentational metadata about how much the recorded line is trusted.

DO $preflight$
BEGIN
  IF to_regclass('public.employees') IS NULL THEN
    RAISE EXCEPTION 'Expected employees table is missing';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_attribute
    WHERE attrelid = 'public.employees'::regclass
      AND attname = 'reporting_line_confidence' AND NOT attisdropped
  ) THEN
    RAISE EXCEPTION 'employees.reporting_line_confidence already exists; review before applying 0019';
  END IF;
END
$preflight$;

ALTER TABLE public.employees
  ADD COLUMN reporting_line_confidence VARCHAR(20)
    CONSTRAINT employees_reporting_line_confidence_check
    CHECK (
      reporting_line_confidence IS NULL
      OR reporting_line_confidence IN ('confirmed', 'inferred', 'unconfirmed')
    ),
  -- A grade describes a reporting line, so there has to be one to describe.
  -- Without this, a root of the chart could carry "unconfirmed" and the
  -- interface would have a doubt to show and nothing to attach it to.
  ADD CONSTRAINT employees_reporting_line_confidence_needs_manager
    CHECK (reporting_line_confidence IS NULL OR manager_id IS NOT NULL);

COMMENT ON COLUMN public.employees.reporting_line_confidence IS
  'How well established this employee''s manager_id is, when something has '
  'graded it. NULL, the default and the value every ordinary HR record carries, '
  'means no grading applies. confirmed: the source states this line outright. '
  'inferred: the source implies it, for example through a junction shared with '
  'peers. unconfirmed: the source does not settle it and the interface shows the '
  'line as open to question. Presentational only: manager_id remains the single '
  'source of the hierarchy for team scope and every authorisation check.';
