-- Leave entitlements and balances. Two new tables, four nullable columns on
-- leave_requests, and one status CHECK widened to a strict superset. No existing
-- leave, attendance or employee row is read, rewritten or deleted, and the five
-- protected orphan attendance rows are not involved.
-- The runner owns the transaction and sets lock_timeout=5s / statement_timeout=60s.

DO $preflight$
BEGIN
  IF to_regclass('public.leave_requests') IS NULL OR to_regclass('public.employees') IS NULL THEN
    RAISE EXCEPTION 'Expected leave_requests and employees tables are missing';
  END IF;

  IF to_regclass('public.leave_policies') IS NOT NULL
    OR to_regclass('public.leave_entitlements') IS NOT NULL THEN
    RAISE EXCEPTION 'A leave balance table already exists; review it before applying 0006';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_attribute
    WHERE attrelid = 'public.leave_requests'::regclass
      AND attname = 'working_days' AND NOT attisdropped
  ) THEN
    RAISE EXCEPTION 'leave_requests.working_days already exists; review before applying 0006';
  END IF;

  -- The widened status CHECK must be a superset of what is already stored.
  IF EXISTS (
    SELECT 1 FROM public.leave_requests
    WHERE status NOT IN ('pending', 'approved', 'rejected')
  ) THEN
    RAISE EXCEPTION 'Unexpected leave status values present; review before widening the constraint';
  END IF;
END
$preflight$;

-- Company policy, not statutory entitlement. Every value here is editable by an
-- administrator; the seeded numbers are HR Nexus defaults and carry no legal meaning.
CREATE TABLE public.leave_policies (
  leave_type VARCHAR(30) PRIMARY KEY
    CHECK (leave_type IN ('annual', 'medical', 'emergency', 'unpaid')),
  default_annual_days NUMERIC(4,1) NOT NULL DEFAULT 0
    CHECK (default_annual_days >= 0 AND default_annual_days <= 366),
  -- Whether an approved request of this type consumes an entitlement.
  deducts_balance BOOLEAN NOT NULL DEFAULT TRUE,
  -- Whether the days are paid. Payroll reads this; it does not compute pay here.
  is_paid BOOLEAN NOT NULL DEFAULT TRUE,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO public.leave_policies
  (leave_type, default_annual_days, deducts_balance, is_paid) VALUES
  ('annual',    12, TRUE,  TRUE),
  ('medical',   10, TRUE,  TRUE),
  ('emergency',  2, TRUE,  TRUE),
  -- Unpaid leave is never limited by a balance and is what payroll deducts against.
  ('unpaid',     0, FALSE, FALSE);

-- One grant per employee, per leave year, per type. Usage is NOT stored here: it
-- is derived from approved requests, so an approval can never double-deduct.
CREATE TABLE public.leave_entitlements (
  id BIGSERIAL PRIMARY KEY,
  employee_id INTEGER NOT NULL
    REFERENCES public.employees(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  leave_year INTEGER NOT NULL CHECK (leave_year BETWEEN 1900 AND 2999),
  leave_type VARCHAR(30) NOT NULL
    REFERENCES public.leave_policies(leave_type) ON DELETE RESTRICT ON UPDATE RESTRICT,
  entitled_days NUMERIC(4,1) NOT NULL DEFAULT 0
    CHECK (entitled_days >= 0 AND entitled_days <= 366),
  carried_forward_days NUMERIC(4,1) NOT NULL DEFAULT 0
    CHECK (carried_forward_days >= 0 AND carried_forward_days <= 366),
  -- Signed, so a correction can reduce a grant without rewriting its history.
  adjustment_days NUMERIC(4,1) NOT NULL DEFAULT 0
    CHECK (adjustment_days BETWEEN -366 AND 366),
  source VARCHAR(20) NOT NULL DEFAULT 'manual'
    CHECK (source IN ('policy', 'opening_balance', 'import', 'manual')),
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT leave_entitlements_unique_grant UNIQUE (employee_id, leave_year, leave_type),
  -- A grant can be zero but never negative once adjustments are applied.
  CONSTRAINT leave_entitlements_non_negative CHECK (
    entitled_days + carried_forward_days + adjustment_days >= 0
  )
);

CREATE INDEX idx_leave_entitlements_employee_year
  ON public.leave_entitlements (employee_id, leave_year);

-- Additive columns. Nullable with no default, so existing requests keep NULL and
-- are never rewritten; working_days is snapshotted at submission so a later change
-- to the working-week setting cannot silently restate historical leave.
ALTER TABLE public.leave_requests
  ADD COLUMN working_days NUMERIC(4,1),
  ADD COLUMN leave_year INTEGER,
  ADD COLUMN cancelled_at TIMESTAMPTZ,
  ADD COLUMN cancelled_by INTEGER
    REFERENCES public.users(id) ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE public.leave_requests
  ADD CONSTRAINT chk_leave_working_days CHECK (
    working_days IS NULL OR (working_days >= 0 AND working_days <= 366)
  ),
  ADD CONSTRAINT chk_leave_year CHECK (
    leave_year IS NULL OR leave_year BETWEEN 1900 AND 2999
  ),
  -- Cancellation is recorded, never implied by an absent row.
  ADD CONSTRAINT chk_leave_cancellation CHECK (
    (cancelled_at IS NULL) = (cancelled_by IS NULL)
  );

-- Widen the status set to a strict superset. Every stored row already satisfies
-- the new constraint, which the preflight above verified.
ALTER TABLE public.leave_requests DROP CONSTRAINT leave_requests_status_check;
ALTER TABLE public.leave_requests ADD CONSTRAINT leave_requests_status_check
  CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled'));

COMMENT ON TABLE public.leave_policies IS
  'Configurable company leave policy. Seeded values are HR Nexus defaults, not statutory entitlements, and carry no legal meaning.';
COMMENT ON TABLE public.leave_entitlements IS
  'Leave granted per employee, year and type. Usage is derived from approved requests and is deliberately not stored here.';
COMMENT ON COLUMN public.leave_requests.working_days IS
  'Working days consumed, snapshotted at submission using the configured working week.';
COMMENT ON COLUMN public.leave_requests.leave_year IS
  'Calendar year the request is accounted against; a request may not span two years.';
