-- Additive attendance verification. No existing attendance row is read, rewritten
-- or deleted: every new column is nullable with no default, so legacy records --
-- including the five protected orphan rows -- keep NULL verification metadata and
-- are never touched by this migration.
-- The runner owns the transaction and sets lock_timeout=5s / statement_timeout=60s.

DO $preflight$
BEGIN
  IF to_regclass('public.attendance') IS NULL OR to_regclass('public.company_settings') IS NULL THEN
    RAISE EXCEPTION 'Expected attendance and company_settings tables are missing';
  END IF;

  IF to_regclass('public.attendance_qr_challenges') IS NOT NULL
    OR to_regclass('public.attendance_qr_uses') IS NOT NULL THEN
    RAISE EXCEPTION 'An attendance QR table already exists; review it before applying 0005';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_attribute
    WHERE attrelid = 'public.attendance'::regclass
      AND attname = 'verification_method' AND NOT attisdropped
  ) THEN
    RAISE EXCEPTION 'attendance.verification_method already exists; review before applying 0005';
  END IF;
END
$preflight$;

-- Verification metadata. Nullable throughout: an unverified legacy or admin record
-- is a real and permitted state, and must not be back-filled with invented data.
ALTER TABLE public.attendance
  ADD COLUMN check_in_latitude DOUBLE PRECISION,
  ADD COLUMN check_in_longitude DOUBLE PRECISION,
  ADD COLUMN check_in_accuracy_meters DOUBLE PRECISION,
  ADD COLUMN check_in_distance_meters DOUBLE PRECISION,
  ADD COLUMN check_out_latitude DOUBLE PRECISION,
  ADD COLUMN check_out_longitude DOUBLE PRECISION,
  ADD COLUMN check_out_accuracy_meters DOUBLE PRECISION,
  ADD COLUMN check_out_distance_meters DOUBLE PRECISION,
  ADD COLUMN verification_method VARCHAR(20),
  ADD COLUMN verification_status VARCHAR(20),
  ADD COLUMN late_minutes INTEGER;

ALTER TABLE public.attendance
  ADD CONSTRAINT chk_attendance_verification_method CHECK (
    verification_method IS NULL OR verification_method IN
      ('QR_LOCATION', 'ADMIN_OVERRIDE', 'REMOTE_APPROVED', 'FIELD_WORK')
  ),
  ADD CONSTRAINT chk_attendance_verification_status CHECK (
    verification_status IS NULL OR verification_status IN ('verified', 'manual', 'exception')
  ),
  ADD CONSTRAINT chk_attendance_coordinates CHECK (
    (check_in_latitude IS NULL) = (check_in_longitude IS NULL)
    AND (check_out_latitude IS NULL) = (check_out_longitude IS NULL)
    AND (check_in_latitude IS NULL OR check_in_latitude BETWEEN -90 AND 90)
    AND (check_out_latitude IS NULL OR check_out_latitude BETWEEN -90 AND 90)
    AND (check_in_longitude IS NULL OR check_in_longitude BETWEEN -180 AND 180)
    AND (check_out_longitude IS NULL OR check_out_longitude BETWEEN -180 AND 180)
  ),
  ADD CONSTRAINT chk_attendance_measurements CHECK (
    (check_in_accuracy_meters IS NULL OR check_in_accuracy_meters >= 0)
    AND (check_out_accuracy_meters IS NULL OR check_out_accuracy_meters >= 0)
    AND (check_in_distance_meters IS NULL OR check_in_distance_meters >= 0)
    AND (check_out_distance_meters IS NULL OR check_out_distance_meters >= 0)
    AND (late_minutes IS NULL OR late_minutes >= 0)
  );

COMMENT ON COLUMN public.attendance.verification_method IS
  'How the record was established. NULL for records predating verification.';
COMMENT ON COLUMN public.attendance.late_minutes IS
  'Minutes past the configured work start time, snapshotted at check-in so later settings changes do not rewrite history.';

-- One challenge backs a QR shown on an office display, so many employees may use
-- the same code inside its short window. Only the hash is stored: reading this
-- table must not yield a usable code.
CREATE TABLE public.attendance_qr_challenges (
  id BIGSERIAL PRIMARY KEY,
  token_hash CHAR(64) NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  issued_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMPTZ NOT NULL,
  issued_by INTEGER NOT NULL
    REFERENCES public.users(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT chk_qr_challenge_window CHECK (expires_at > issued_at)
);

-- Replay resistance: an employee may use a given challenge at most once per action,
-- so a captured code cannot be replayed even inside its window.
CREATE TABLE public.attendance_qr_uses (
  id BIGSERIAL PRIMARY KEY,
  challenge_id BIGINT NOT NULL
    REFERENCES public.attendance_qr_challenges(id) ON DELETE CASCADE ON UPDATE RESTRICT,
  employee_id INTEGER NOT NULL
    REFERENCES public.employees(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  action VARCHAR(10) NOT NULL CHECK (action IN ('check_in', 'check_out')),
  used_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT attendance_qr_uses_once UNIQUE (challenge_id, employee_id, action)
);

CREATE INDEX idx_qr_challenges_expires_at ON public.attendance_qr_challenges (expires_at);

COMMENT ON TABLE public.attendance_qr_challenges IS
  'Short-lived office QR challenges. Stores only a SHA-256 hash of the issued token.';
COMMENT ON TABLE public.attendance_qr_uses IS
  'Consumption log giving replay resistance: one use per challenge, employee and action.';
