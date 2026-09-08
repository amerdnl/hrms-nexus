-- Additive single-company configuration. No existing business table is modified.
-- Empty profile/location means unconfigured; defaults are editable starting values.
CREATE TABLE public.company_settings (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  company_name VARCHAR(200) CHECK (company_name IS NULL OR length(btrim(company_name)) > 0),
  registration_number VARCHAR(100),
  address VARCHAR(2000),
  email VARCHAR(254),
  phone VARCHAR(50),
  timezone VARCHAR(100) NOT NULL DEFAULT 'UTC' CHECK (length(btrim(timezone)) > 0),
  working_days SMALLINT[] NOT NULL DEFAULT ARRAY[1,2,3,4,5]::SMALLINT[],
  work_start_time TIME NOT NULL DEFAULT '09:00',
  work_end_time TIME NOT NULL DEFAULT '17:00',
  grace_period_minutes INTEGER NOT NULL DEFAULT 0,
  office_latitude DOUBLE PRECISION,
  office_longitude DOUBLE PRECISION,
  attendance_radius_meters INTEGER NOT NULL DEFAULT 100 CHECK (attendance_radius_meters BETWEEN 1 AND 10000),
  revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT company_settings_working_days_check CHECK (
    array_ndims(working_days) = 1 AND array_lower(working_days, 1) = 1
    AND cardinality(working_days) BETWEEN 1 AND 7
    AND array_position(working_days, NULL) IS NULL
    AND working_days <@ ARRAY[1,2,3,4,5,6,7]::SMALLINT[]
    AND cardinality(working_days) =
      (1 = ANY(working_days))::INTEGER + (2 = ANY(working_days))::INTEGER +
      (3 = ANY(working_days))::INTEGER + (4 = ANY(working_days))::INTEGER +
      (5 = ANY(working_days))::INTEGER + (6 = ANY(working_days))::INTEGER +
      (7 = ANY(working_days))::INTEGER
  ),
  CONSTRAINT company_settings_hours_check CHECK (
    work_start_time < TIME '24:00' AND work_end_time < TIME '24:00'
    AND EXTRACT(SECOND FROM work_start_time) = 0 AND EXTRACT(SECOND FROM work_end_time) = 0
    AND work_start_time <> work_end_time
    AND grace_period_minutes >= 0
    AND grace_period_minutes < MOD(EXTRACT(EPOCH FROM (work_end_time - work_start_time))::INTEGER + 86400, 86400) / 60
  ),
  CONSTRAINT company_settings_location_check CHECK (
    (office_latitude IS NULL) = (office_longitude IS NULL)
    AND (office_latitude IS NULL OR office_latitude BETWEEN -90 AND 90)
    AND (office_longitude IS NULL OR office_longitude BETWEEN -180 AND 180)
  )
);

COMMENT ON COLUMN public.company_settings.working_days IS 'ISO weekdays: Monday=1 to Sunday=7; an overnight shift belongs to its start day.';
COMMENT ON COLUMN public.company_settings.revision IS 'Optimistic concurrency token; every successful settings save increments it.';
COMMENT ON TABLE public.company_settings IS 'Single-company configuration. Empty profile and paired NULL coordinates require administrator setup.';

INSERT INTO public.company_settings (id) VALUES (1);
