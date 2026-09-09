-- Additive workforce import history. No existing business table, column, index,
-- constraint or row is modified, and nothing here touches the attendance
-- integrity exceptions preserved by 0001.
-- The runner owns the transaction and sets lock_timeout=5s / statement_timeout=60s.

-- Fail closed rather than adopting or altering tables this migration did not create.
DO $preflight$
BEGIN
  IF to_regclass('public.import_jobs') IS NOT NULL
    OR to_regclass('public.import_job_rows') IS NOT NULL THEN
    RAISE EXCEPTION 'An import history table already exists; review it before applying 0004';
  END IF;

  IF to_regclass('public.users') IS NULL OR to_regclass('public.employees') IS NULL THEN
    RAISE EXCEPTION 'Expected users and employees tables are missing';
  END IF;
END
$preflight$;

CREATE TABLE public.import_jobs (
  id BIGSERIAL PRIMARY KEY,
  file_name VARCHAR(255) NOT NULL CHECK (length(btrim(file_name)) > 0),
  import_type VARCHAR(30) NOT NULL CHECK (import_type IN ('employees')),
  -- RESTRICT keeps the audit trail intact; who ran an import is not disposable.
  initiated_by INTEGER NOT NULL
    REFERENCES public.users(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'validating', 'ready', 'importing', 'completed', 'failed')),
  -- Header row and raw cells, kept so a confirmation re-validates the original
  -- file against live data instead of trusting a stale preview.
  source_headers JSONB NOT NULL,
  source_rows JSONB NOT NULL,
  column_mapping JSONB,
  total_rows INTEGER NOT NULL DEFAULT 0 CHECK (total_rows >= 0),
  new_rows INTEGER NOT NULL DEFAULT 0 CHECK (new_rows >= 0),
  update_rows INTEGER NOT NULL DEFAULT 0 CHECK (update_rows >= 0),
  unchanged_rows INTEGER NOT NULL DEFAULT 0 CHECK (unchanged_rows >= 0),
  conflict_rows INTEGER NOT NULL DEFAULT 0 CHECK (conflict_rows >= 0),
  invalid_rows INTEGER NOT NULL DEFAULT 0 CHECK (invalid_rows >= 0),
  warning_rows INTEGER NOT NULL DEFAULT 0 CHECK (warning_rows >= 0),
  created_count INTEGER NOT NULL DEFAULT 0 CHECK (created_count >= 0),
  updated_count INTEGER NOT NULL DEFAULT 0 CHECK (updated_count >= 0),
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMPTZ,
  CONSTRAINT import_jobs_completion_check CHECK (
    (status IN ('completed', 'failed')) = (completed_at IS NOT NULL)
  )
);

CREATE TABLE public.import_job_rows (
  id BIGSERIAL PRIMARY KEY,
  job_id BIGINT NOT NULL
    REFERENCES public.import_jobs(id) ON DELETE CASCADE ON UPDATE RESTRICT,
  row_number INTEGER NOT NULL CHECK (row_number > 0),
  classification VARCHAR(20) NOT NULL
    CHECK (classification IN ('new', 'update', 'unchanged', 'conflict', 'invalid')),
  -- Set once a row has been matched to or has created an employee. RESTRICT so
  -- import history can never be the reason an employee record is destroyed.
  employee_id INTEGER
    REFERENCES public.employees(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  row_data JSONB,
  issues JSONB NOT NULL DEFAULT '[]'::jsonb,
  changed_fields TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  applied BOOLEAN NOT NULL DEFAULT FALSE,
  CONSTRAINT import_job_rows_unique_row UNIQUE (job_id, row_number)
);

CREATE INDEX idx_import_jobs_created_at ON public.import_jobs (created_at DESC);
CREATE INDEX idx_import_jobs_initiated_by ON public.import_jobs (initiated_by);
CREATE INDEX idx_import_job_rows_classification
  ON public.import_job_rows (job_id, classification, row_number);

COMMENT ON TABLE public.import_jobs IS
  'Workforce import runs. Rows are retained as an audit trail and are never deleted by the application.';
COMMENT ON COLUMN public.import_jobs.source_rows IS
  'Original cell values. Credentials are never importable, so no plaintext password is stored here.';
COMMENT ON COLUMN public.import_jobs.column_mapping IS
  'Confirmed field to column-index mapping used for validation and for the applied import.';
COMMENT ON TABLE public.import_job_rows IS
  'Per-row import outcome. new and update rows are applied; unchanged, conflict and invalid rows never write.';
