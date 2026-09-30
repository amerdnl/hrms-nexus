-- Boxes on an imported organisation chart that are labels rather than posts.
--
-- Additive only. One new table. No existing table, column, constraint, index or
-- row is touched, and the five protected orphan attendance rows are not
-- involved. The runner owns the transaction and sets lock_timeout=5s /
-- statement_timeout=60s.
--
-- WHY. A chart drawn by hand carries more than its boxes of people. The EDUK8U
-- chart has a reference box between two columns listing the four streams its
-- business development function sells into. It names no post and describes
-- nobody, so it must never become an employee record - that would invent four
-- jobs out of a caption. But dropping it leaves a hole exactly where the author
-- put something, on a chart that is going back to him to check. So it is stored
-- as what it is: a label with a position, drawn as a note and never as a card.
--
-- WHY NOT IN org_chart_source_layout. That table's primary key is an employee,
-- because every row in it is one. A note has no employee and never will, and
-- widening that key to allow nulls would make "which employee is this?"
-- unanswerable for every reader of the table.

DO $preflight$
BEGIN
  IF to_regclass('public.org_chart_source_layout') IS NULL THEN
    RAISE EXCEPTION 'Expected org_chart_source_layout is missing; apply 0020 first';
  END IF;
  IF to_regclass('public.org_chart_source_notes') IS NOT NULL THEN
    RAISE EXCEPTION 'org_chart_source_notes already exists; review before applying 0021';
  END IF;
END
$preflight$;

CREATE TABLE public.org_chart_source_notes (
  id BIGSERIAL PRIMARY KEY,
  label VARCHAR(200) NOT NULL CHECK (length(btrim(label)) > 0),
  body TEXT,
  source_x NUMERIC(8, 3) NOT NULL,
  source_y NUMERIC(8, 3) NOT NULL,
  source_width NUMERIC(8, 3) NOT NULL CHECK (source_width > 0),
  source_height NUMERIC(8, 3) NOT NULL CHECK (source_height > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE public.org_chart_source_notes IS
  'Labelled boxes from an imported organisation chart which describe no post - '
  'a caption, a grouping title, a reference list. Drawn as notes on the chart, '
  'never as people, and read by nothing except the chart.';
