-- Where a position sat on the chart this organisation was transcribed from, and
-- the lines on that chart which are not reporting lines.
--
-- Additive only. Two new tables. No existing table, column, constraint, index or
-- row is touched, and the five protected orphan attendance rows are not
-- involved. The runner owns the transaction and sets lock_timeout=5s /
-- statement_timeout=60s.
--
-- WHY THIS IS NOT COLUMNS ON employees. This is not a fact about an employee. It
-- is a fact about one drawing: where a box sat on the page of the chart that a
-- customer handed over. A company that never imported a chart has none of it,
-- and an employee who moves department does not acquire coordinates. Keeping it
-- in its own table means the employees row stays a description of a person or a
-- post, and a chart can be re-imported or dropped without rewriting it.
--
-- WHY COORDINATES ARE KEPT AT ALL. An org chart drawn by an automatic layout is
-- correct and unrecognisable: it puts the boxes where the algorithm likes, which
-- is never where the author put them. When the whole point is to hand the chart
-- back to the person who drew it and ask "is this right?", it has to look like
-- the thing they drew. The source coordinates are the only record of that, so
-- they are kept and the renderer places the cards with them. They are layout,
-- never hierarchy: employees.manager_id remains the only statement about who
-- reports to whom, and nothing here is read by any authorisation check.
--
-- WHY A SECOND TABLE FOR LINKS. A chart can draw a line that a reporting line
-- cannot hold. The EDUK8U chart runs two lines out of one intern box, one into
-- each of two managers; employees.manager_id holds one. Rather than throw the
-- second away or invent a second manager column, it is recorded here as what it
-- is - a line on the source drawing - and the chart draws it as a reference,
-- visibly different from the reporting line it is not.

DO $preflight$
BEGIN
  IF to_regclass('public.employees') IS NULL THEN
    RAISE EXCEPTION 'Expected employees table is missing';
  END IF;
  IF to_regclass('public.org_chart_source_layout') IS NOT NULL THEN
    RAISE EXCEPTION 'org_chart_source_layout already exists; review before applying 0020';
  END IF;
  IF to_regclass('public.org_chart_source_links') IS NOT NULL THEN
    RAISE EXCEPTION 'org_chart_source_links already exists; review before applying 0020';
  END IF;
END
$preflight$;

-- One row per positioned box. Coordinates are in the source drawing's own
-- units, with the origin at its top-left; the client scales them. They are
-- stored as given rather than normalised so that a re-import can be compared
-- against the original without undoing arithmetic.
CREATE TABLE public.org_chart_source_layout (
  employee_id BIGINT PRIMARY KEY REFERENCES public.employees(id) ON DELETE CASCADE,
  source_x NUMERIC(8, 3) NOT NULL,
  source_y NUMERIC(8, 3) NOT NULL,
  source_width NUMERIC(8, 3) NOT NULL CHECK (source_width > 0),
  source_height NUMERIC(8, 3) NOT NULL CHECK (source_height > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE public.org_chart_source_layout IS
  'Where each box sat on the organisation chart this company was transcribed '
  'from. Layout only: it never affects hierarchy, team scope or authorisation, '
  'and a company with no imported chart simply has no rows here, which is what '
  'makes the org chart fall back to laying itself out automatically.';

-- A line the source draws that is not this employee's reporting line. The
-- reporting line itself lives in employees.manager_id and is never duplicated
-- here, which the CHECK below cannot enforce but the loader does.
CREATE TABLE public.org_chart_source_links (
  id BIGSERIAL PRIMARY KEY,
  child_employee_id BIGINT NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  parent_employee_id BIGINT NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  confidence VARCHAR(20) NOT NULL DEFAULT 'unconfirmed'
    CHECK (confidence IN ('confirmed', 'inferred', 'unconfirmed')),
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT org_chart_source_links_not_self CHECK (child_employee_id <> parent_employee_id),
  CONSTRAINT org_chart_source_links_unique UNIQUE (child_employee_id, parent_employee_id)
);

CREATE INDEX idx_org_chart_source_links_child
  ON public.org_chart_source_links (child_employee_id);

COMMENT ON TABLE public.org_chart_source_links IS
  'Lines the source chart draws which are not reporting lines - most often a '
  'second manager for a box that employees.manager_id cannot hold. Drawn as a '
  'reference, distinct from the reporting line, and read by nothing except the '
  'chart.';
