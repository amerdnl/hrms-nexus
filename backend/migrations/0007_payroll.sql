-- Payroll V1: compensation history, periods, per-employee records and line items.
-- Entirely new tables. No existing table, column, constraint or row is modified,
-- and the five protected orphan attendance rows are not involved.
-- The runner owns the transaction and sets lock_timeout=5s / statement_timeout=60s.
--
-- MONEY MODEL: every monetary column is BIGINT holding SEN (1/100 MYR). There is
-- no floating point anywhere in payroll, in the database or in the application.
-- Rounding happens only where a division occurs, half-up, and is documented on
-- the columns concerned.

DO $preflight$
BEGIN
  IF to_regclass('public.employees') IS NULL OR to_regclass('public.company_settings') IS NULL
    OR to_regclass('public.leave_requests') IS NULL THEN
    RAISE EXCEPTION 'Expected employee, settings and leave tables are missing';
  END IF;

  IF to_regclass('public.employee_compensation') IS NOT NULL
    OR to_regclass('public.payroll_periods') IS NOT NULL
    OR to_regclass('public.payroll_records') IS NOT NULL
    OR to_regclass('public.payroll_items') IS NOT NULL THEN
    RAISE EXCEPTION 'A payroll table already exists; review it before applying 0007';
  END IF;
END
$preflight$;

-- Salary history. Rows are append-only in practice: a change closes the previous
-- row and opens a new one, so a past payslip can always be explained.
CREATE TABLE public.employee_compensation (
  id BIGSERIAL PRIMARY KEY,
  employee_id INTEGER NOT NULL
    REFERENCES public.employees(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  basic_salary_sen BIGINT NOT NULL CHECK (basic_salary_sen >= 0 AND basic_salary_sen <= 1000000000),
  allowance_sen BIGINT NOT NULL DEFAULT 0 CHECK (allowance_sen >= 0 AND allowance_sen <= 1000000000),
  -- Per hour. Overtime hours are entered by an administrator: attendance does
  -- not capture overtime in V1.
  overtime_rate_sen BIGINT NOT NULL DEFAULT 0 CHECK (overtime_rate_sen >= 0 AND overtime_rate_sen <= 100000000),
  effective_from DATE NOT NULL,
  effective_to DATE,
  note TEXT,
  created_by INTEGER REFERENCES public.users(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT compensation_period_order CHECK (effective_to IS NULL OR effective_to >= effective_from),
  CONSTRAINT compensation_unique_start UNIQUE (employee_id, effective_from)
);

CREATE INDEX idx_compensation_employee_effective
  ON public.employee_compensation (employee_id, effective_from DESC);

-- One period per calendar month.
CREATE TABLE public.payroll_periods (
  id BIGSERIAL PRIMARY KEY,
  period_year INTEGER NOT NULL CHECK (period_year BETWEEN 1900 AND 2999),
  period_month INTEGER NOT NULL CHECK (period_month BETWEEN 1 AND 12),
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'calculated', 'reviewed', 'approved', 'paid')),
  -- Snapshotted from Company Settings when the period is opened, so a later
  -- change to the working week cannot restate a finished payroll.
  working_days INTEGER NOT NULL CHECK (working_days > 0 AND working_days <= 31),
  working_days_pattern SMALLINT[] NOT NULL,
  note TEXT,
  calculated_at TIMESTAMPTZ,
  reviewed_at TIMESTAMPTZ,
  approved_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  approved_by INTEGER REFERENCES public.users(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  paid_by INTEGER REFERENCES public.users(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  created_by INTEGER REFERENCES public.users(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT payroll_period_unique_month UNIQUE (period_year, period_month),
  CONSTRAINT payroll_period_dates CHECK (end_date >= start_date),
  CONSTRAINT payroll_period_pattern CHECK (
    array_length(working_days_pattern, 1) BETWEEN 1 AND 7
  )
);

-- One record per employee per period. The unique constraint is what makes a
-- duplicate calculation impossible rather than merely unlikely.
CREATE TABLE public.payroll_records (
  id BIGSERIAL PRIMARY KEY,
  period_id BIGINT NOT NULL
    REFERENCES public.payroll_periods(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  employee_id INTEGER NOT NULL
    REFERENCES public.employees(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  -- Identity snapshot: a payslip must still read correctly after a rename or a
  -- department move.
  employee_number VARCHAR(50) NOT NULL,
  full_name VARCHAR(150) NOT NULL,
  department_name VARCHAR(100),
  job_title VARCHAR(100),
  -- Compensation snapshot. compensation_id records which row was used; the
  -- amounts are copied so a later salary change cannot rewrite this payslip.
  compensation_id BIGINT
    REFERENCES public.employee_compensation(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  basic_salary_sen BIGINT NOT NULL CHECK (basic_salary_sen >= 0),
  allowance_sen BIGINT NOT NULL DEFAULT 0 CHECK (allowance_sen >= 0),
  overtime_rate_sen BIGINT NOT NULL DEFAULT 0 CHECK (overtime_rate_sen >= 0),
  -- Administrator input, in hundredths of an hour.
  overtime_hours NUMERIC(7,2) NOT NULL DEFAULT 0 CHECK (overtime_hours >= 0 AND overtime_hours <= 1000),
  -- Approved unpaid leave falling inside this period, in tenths of a day.
  unpaid_leave_days NUMERIC(5,1) NOT NULL DEFAULT 0 CHECK (unpaid_leave_days >= 0),
  working_days INTEGER NOT NULL CHECK (working_days > 0),
  gross_sen BIGINT NOT NULL CHECK (gross_sen >= 0),
  deductions_sen BIGINT NOT NULL CHECK (deductions_sen >= 0),
  -- Deliberately not clamped at zero: if deductions exceed gross the figure must
  -- be visibly wrong rather than silently rounded up to nothing.
  net_sen BIGINT NOT NULL,
  calculated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT payroll_record_unique_employee UNIQUE (period_id, employee_id),
  CONSTRAINT payroll_record_net CHECK (net_sen = gross_sen - deductions_sen)
);

CREATE INDEX idx_payroll_records_employee ON public.payroll_records (employee_id, period_id);

-- Every figure on a payslip is a line, so a total can always be explained.
CREATE TABLE public.payroll_items (
  id BIGSERIAL PRIMARY KEY,
  record_id BIGINT NOT NULL
    REFERENCES public.payroll_records(id) ON DELETE CASCADE ON UPDATE RESTRICT,
  item_type VARCHAR(10) NOT NULL CHECK (item_type IN ('earning', 'deduction')),
  code VARCHAR(40) NOT NULL,
  label VARCHAR(120) NOT NULL,
  amount_sen BIGINT NOT NULL CHECK (amount_sen >= 0),
  -- Manual lines are inputs, not outputs: recalculation regenerates the derived
  -- lines and leaves these alone.
  is_manual BOOLEAN NOT NULL DEFAULT FALSE,
  -- A statutory line is entered by hand in V1. HR Nexus computes no statutory
  -- rate and claims no compliance.
  is_statutory BOOLEAN NOT NULL DEFAULT FALSE,
  note TEXT,
  created_by INTEGER REFERENCES public.users(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT payroll_item_statutory_is_manual CHECK (NOT is_statutory OR is_manual)
);

CREATE INDEX idx_payroll_items_record ON public.payroll_items (record_id, item_type);

-- Controlled transitions. Encoded here so no code path, now or later, can move a
-- period backwards out of approval or payment.
CREATE FUNCTION public.enforce_payroll_period_transition()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $transition$
BEGIN
  IF NEW.status = OLD.status THEN RETURN NEW; END IF;

  IF NOT (
    (OLD.status = 'draft'      AND NEW.status = 'calculated') OR
    (OLD.status = 'calculated' AND NEW.status IN ('draft', 'reviewed')) OR
    (OLD.status = 'reviewed'   AND NEW.status IN ('calculated', 'approved')) OR
    (OLD.status = 'approved'   AND NEW.status = 'paid')
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514',
      MESSAGE = format('Payroll cannot move from %s to %s', OLD.status, NEW.status),
      HINT = 'Approved and paid payroll is final; correct it with a reversal instead.';
  END IF;

  RETURN NEW;
END
$transition$;

CREATE TRIGGER enforce_payroll_period_transition
  BEFORE UPDATE OF status ON public.payroll_periods
  FOR EACH ROW EXECUTE FUNCTION public.enforce_payroll_period_transition();

-- Immutability of approved payroll, enforced by the database rather than by
-- convention, so a historical payslip cannot change however it is reached.
CREATE FUNCTION public.prevent_locked_payroll_change()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $locked$
DECLARE
  target_period BIGINT;
  period_status TEXT;
BEGIN
  IF TG_TABLE_NAME = 'payroll_records' THEN
    target_period := COALESCE(NEW.period_id, OLD.period_id);
  ELSE
    SELECT r.period_id INTO target_period FROM public.payroll_records r
      WHERE r.id = COALESCE(NEW.record_id, OLD.record_id);
  END IF;

  SELECT p.status INTO period_status FROM public.payroll_periods p WHERE p.id = target_period;

  IF period_status IN ('approved', 'paid') THEN
    RAISE EXCEPTION USING ERRCODE = '23514',
      MESSAGE = 'Approved payroll is immutable and cannot be changed or removed',
      HINT = 'Reverse it in a later period instead of editing history.';
  END IF;

  RETURN COALESCE(NEW, OLD);
END
$locked$;

CREATE TRIGGER prevent_locked_payroll_record_change
  BEFORE INSERT OR UPDATE OR DELETE ON public.payroll_records
  FOR EACH ROW EXECUTE FUNCTION public.prevent_locked_payroll_change();

CREATE TRIGGER prevent_locked_payroll_item_change
  BEFORE INSERT OR UPDATE OR DELETE ON public.payroll_items
  FOR EACH ROW EXECUTE FUNCTION public.prevent_locked_payroll_change();

COMMENT ON TABLE public.employee_compensation IS
  'Salary history in sen. A change closes the previous row and opens a new one; rows are not edited in place.';
COMMENT ON TABLE public.payroll_periods IS
  'One payroll run per calendar month. working_days and working_days_pattern are snapshotted from Company Settings when the period is opened.';
COMMENT ON TABLE public.payroll_records IS
  'Per-employee payroll result. Identity and compensation are snapshotted so a later change cannot rewrite a payslip. Approved records are immutable by trigger.';
COMMENT ON COLUMN public.payroll_records.net_sen IS
  'gross_sen - deductions_sen in sen. Not clamped: an over-deducted record must be visibly wrong.';
COMMENT ON TABLE public.payroll_items IS
  'Earning and deduction lines in sen. Statutory lines are entered manually; HR Nexus computes no statutory rate and claims no compliance.';
