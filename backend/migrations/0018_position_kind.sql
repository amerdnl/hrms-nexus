-- What kind of thing an employee row describes: a member of staff, a position
-- nobody holds yet, or an external party who is not employed here at all.
--
-- Additive only. One NOT NULL column with a constant default on public.employees,
-- one CHECK and one partial index. No existing row is rewritten and no existing
-- column, constraint or index is modified. The five protected orphan attendance
-- rows are not involved. The runner owns the transaction and sets lock_timeout=5s
-- / statement_timeout=60s.
--
-- WHY THIS EXISTS. An org chart taken from a customer's own chart is mostly
-- positions, not people: "3. Snr BD Exec Recruitment" is a seat, and "External
-- Legal - ARK Legal" is a firm on retainer. Until now every employees row read as
-- a real, employed person, so loading such a chart would have made the product
-- assert twenty-odd colleagues who do not exist. The column lets the row carry
-- what it actually is, and lets the interface say so, instead of leaving the
-- distinction in a document nobody reads next to the chart.
--
-- WHY A DEFAULT OF 'staff'. Every row that exists today describes an employed
-- person, so 'staff' is the truthful value for all of them and the column changes
-- nothing about any existing company. On PostgreSQL 11 and later a NOT NULL
-- column with a non-volatile default is a catalogue-only change: the default is
-- stored in pg_attribute and the table is not rewritten, which matters because
-- employees is referenced by many foreign keys.
--
-- WHAT THIS IS NOT. It is not an employment status and it is not a permission.
-- employment_status still decides who is visible and who can sign in, and
-- users.role still decides what an account may do. A 'vacant' or 'external' row
-- is expected to have no user account; nothing here enforces that, because a
-- contractor who genuinely needs a sign-in is a decision for an administrator
-- rather than for a constraint.

DO $preflight$
BEGIN
  IF to_regclass('public.employees') IS NULL THEN
    RAISE EXCEPTION 'Expected employees table is missing';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_attribute
    WHERE attrelid = 'public.employees'::regclass
      AND attname = 'position_kind' AND NOT attisdropped
  ) THEN
    RAISE EXCEPTION 'employees.position_kind already exists; review before applying 0018';
  END IF;
END
$preflight$;

ALTER TABLE public.employees
  ADD COLUMN position_kind VARCHAR(20) NOT NULL DEFAULT 'staff'
    CONSTRAINT employees_position_kind_check
    CHECK (position_kind IN ('staff', 'vacant', 'external'));

-- Only the exceptions are worth an index: the reviews that ask "what is not a
-- real employee here" are rare, and 'staff' is almost every row.
CREATE INDEX idx_employees_position_kind
  ON public.employees (position_kind) WHERE position_kind <> 'staff';

COMMENT ON COLUMN public.employees.position_kind IS
  'What the row describes. staff: a person employed here, the default and the '
  'only value any existing record carries. vacant: a position on the org chart '
  'that nobody holds, whose full_name is the position label rather than a '
  'person. external: a consultant, firm or partner who appears on the chart but '
  'is not employed here. Never a permission and never a visibility rule: '
  'employment_status still decides who is visible and who may sign in.';
