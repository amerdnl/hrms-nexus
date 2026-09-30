-- What makes an organisation chart editable: whether a seat is taken, a note
-- about the role, and the reporting lines that are real but are not the one
-- operational line.
--
-- Additive only. Two nullable columns on public.employees and one new table. No
-- existing table, column, constraint, index or row is touched, and the five
-- protected orphan attendance rows are not involved. The runner owns the
-- transaction and sets lock_timeout=5s / statement_timeout=60s.
--
-- WHY OCCUPANCY IS SEPARATE FROM position_kind. position_kind says what a row
-- *is* - a person employed here, a seat on the chart, or an outside firm.
-- Occupancy says whether the seat is *taken*. They are different questions and
-- conflating them is how a product ends up inventing people: told that the Head
-- of Compliance post is filled, a single flag would tempt the loader to create
-- an employee to fill it. Here the post stays a post, marked 'filled_unnamed',
-- and the chart says "filled, employee details not entered" until an
-- administrator assigns a real person. Nobody is fabricated to satisfy a column.
--
-- WHY NULL IS THE DEFAULT. An ordinary employee record is a person; asking
-- whether they are "occupied" is meaningless. NULL means the question does not
-- apply, which is the truthful value for every row that exists today and for
-- every company that never imported a chart.
--
-- WHY ADDITIONAL MANAGERS ARE A TABLE. employees.manager_id is the one line the
-- rest of the product runs on: team scope, leave approval, who may see whose
-- attendance. It must stay single-valued or those rules become ambiguous. But a
-- real organisation has people who genuinely answer to more than one person -
-- EDUK8U's interns report to every executive above them - and drawing only one
-- of those lines is a false chart. So the extra lines live here, are shown on
-- the chart, and are deliberately invisible to every operational rule.

DO $preflight$
BEGIN
  IF to_regclass('public.employees') IS NULL THEN
    RAISE EXCEPTION 'Expected employees table is missing';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_attribute
    WHERE attrelid = 'public.employees'::regclass
      AND attname IN ('occupancy', 'position_notes') AND NOT attisdropped
  ) THEN
    RAISE EXCEPTION 'employees.occupancy or position_notes already exists; review before applying 0022';
  END IF;
  IF to_regclass('public.employee_additional_managers') IS NOT NULL THEN
    RAISE EXCEPTION 'employee_additional_managers already exists; review before applying 0022';
  END IF;
END
$preflight$;

ALTER TABLE public.employees
  ADD COLUMN occupancy VARCHAR(20)
    CONSTRAINT employees_occupancy_check
    CHECK (occupancy IS NULL OR occupancy IN ('vacant', 'filled', 'filled_unnamed')),
  ADD COLUMN position_notes TEXT
    CONSTRAINT employees_position_notes_length
    CHECK (position_notes IS NULL OR length(position_notes) <= 2000);

COMMENT ON COLUMN public.employees.occupancy IS
  'Whether the seat this row describes is taken. NULL, the default, means the '
  'question does not apply - an ordinary employee record is a person. vacant: '
  'nobody holds it. filled_unnamed: somebody holds it and who has not been '
  'recorded yet, which the chart states rather than inventing an occupant. '
  'filled: held by the person this record names.';

COMMENT ON COLUMN public.employees.position_notes IS
  'Free text about the role itself, written by an administrator on the org '
  'chart. Never personal information about whoever holds it.';

-- A reporting line that is real but is not the operational one.
CREATE TABLE public.employee_additional_managers (
  id BIGSERIAL PRIMARY KEY,
  employee_id BIGINT NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  manager_id BIGINT NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  confidence VARCHAR(20) NOT NULL DEFAULT 'confirmed'
    CHECK (confidence IN ('confirmed', 'inferred', 'unconfirmed')),
  note TEXT CHECK (note IS NULL OR length(note) <= 1000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT employee_additional_managers_not_self CHECK (employee_id <> manager_id),
  CONSTRAINT employee_additional_managers_unique UNIQUE (employee_id, manager_id)
);

CREATE INDEX idx_employee_additional_managers_employee
  ON public.employee_additional_managers (employee_id);

COMMENT ON TABLE public.employee_additional_managers IS
  'Reporting lines the organisation chart draws in addition to '
  'employees.manager_id, for people who genuinely answer to more than one '
  'person. Read by the chart alone: team scope, leave approval and every '
  'authorisation check continue to use employees.manager_id, which stays the '
  'single operational line.';
