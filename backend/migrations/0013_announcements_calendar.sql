-- V3 announcements and the company calendar.
--
-- Four new tables: announcements, announcement_reads, company_holidays and
-- company_events. No existing table, column, constraint or row is modified;
-- the five protected orphan attendance rows and the payroll tables are not
-- involved. The runner owns the transaction and sets lock_timeout=5s /
-- statement_timeout=60s.
--
-- Announcements are written by HR for an audience (the whole company or one
-- department), move draft -> published -> archived, and are plain text. They
-- are not a feed: nobody but HR posts, and nobody comments. Holidays are the
-- company's non-working days; events are dated company occasions. None of
-- these tables holds anything about an individual except who wrote a row and
-- whether an account has read an announcement.

DO $preflight$
BEGIN
  IF to_regclass('public.users') IS NULL OR to_regclass('public.departments') IS NULL THEN
    RAISE EXCEPTION 'Expected users and departments tables are missing';
  END IF;
  IF to_regclass('public.announcements') IS NOT NULL
    OR to_regclass('public.announcement_reads') IS NOT NULL
    OR to_regclass('public.company_holidays') IS NOT NULL
    OR to_regclass('public.company_events') IS NOT NULL THEN
    RAISE EXCEPTION 'An announcement or calendar table already exists; review before applying 0013';
  END IF;
END
$preflight$;

CREATE TABLE public.announcements (
  id BIGSERIAL PRIMARY KEY,
  title VARCHAR(160) NOT NULL CHECK (length(btrim(title)) > 0),
  -- Plain text, shown as written. Never parsed as HTML or markdown.
  body VARCHAR(5000) NOT NULL CHECK (length(btrim(body)) > 0),
  -- "important" pins it and asks each reader to open it from the Action Center.
  priority VARCHAR(10) NOT NULL DEFAULT 'normal' CHECK (priority IN ('normal', 'important')),
  audience VARCHAR(12) NOT NULL DEFAULT 'company' CHECK (audience IN ('company', 'department')),
  -- RESTRICT: a department an announcement was addressed to is part of that
  -- announcement's history, so it cannot be deleted from under it.
  department_id INTEGER REFERENCES public.departments(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  status VARCHAR(10) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  -- The last company date it is shown. Optional: most announcements stand.
  expires_on DATE,
  published_at TIMESTAMPTZ,
  published_by INTEGER REFERENCES public.users(id) ON DELETE SET NULL ON UPDATE RESTRICT,
  archived_at TIMESTAMPTZ,
  archived_by INTEGER REFERENCES public.users(id) ON DELETE SET NULL ON UPDATE RESTRICT,
  created_by INTEGER REFERENCES public.users(id) ON DELETE SET NULL ON UPDATE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_by INTEGER REFERENCES public.users(id) ON DELETE SET NULL ON UPDATE RESTRICT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  -- Optimistic concurrency: an edit names the revision it started from.
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1),
  CONSTRAINT announcements_audience_target CHECK ((audience = 'department') = (department_id IS NOT NULL)),
  CONSTRAINT announcements_published_stamped CHECK (status = 'draft' OR published_at IS NOT NULL),
  CONSTRAINT announcements_archived_stamped CHECK ((status = 'archived') = (archived_at IS NOT NULL))
);

CREATE INDEX idx_announcements_feed
  ON public.announcements (status, published_at DESC, id DESC);
CREATE INDEX idx_announcements_department
  ON public.announcements (department_id)
  WHERE department_id IS NOT NULL;

-- Which accounts have opened which announcement. Nothing else about the reader.
CREATE TABLE public.announcement_reads (
  announcement_id BIGINT NOT NULL
    REFERENCES public.announcements(id) ON DELETE CASCADE ON UPDATE RESTRICT,
  user_id INTEGER NOT NULL
    REFERENCES public.users(id) ON DELETE CASCADE ON UPDATE RESTRICT,
  read_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (announcement_id, user_id)
);

CREATE INDEX idx_announcement_reads_user ON public.announcement_reads (user_id);

-- Company non-working days, one per date.
CREATE TABLE public.company_holidays (
  id BIGSERIAL PRIMARY KEY,
  holiday_date DATE NOT NULL,
  name VARCHAR(120) NOT NULL CHECK (length(btrim(name)) > 0),
  created_by INTEGER REFERENCES public.users(id) ON DELETE SET NULL ON UPDATE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_by INTEGER REFERENCES public.users(id) ON DELETE SET NULL ON UPDATE RESTRICT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1),
  CONSTRAINT company_holidays_date_unique UNIQUE (holiday_date)
);

-- Dated company occasions (a town hall, an office closure for moving day).
-- Times are company wall-clock times, like the working hours in settings.
CREATE TABLE public.company_events (
  id BIGSERIAL PRIMARY KEY,
  title VARCHAR(120) NOT NULL CHECK (length(btrim(title)) > 0),
  description VARCHAR(1000),
  location VARCHAR(120),
  starts_on DATE NOT NULL,
  ends_on DATE NOT NULL,
  start_time TIME,
  end_time TIME,
  created_by INTEGER REFERENCES public.users(id) ON DELETE SET NULL ON UPDATE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_by INTEGER REFERENCES public.users(id) ON DELETE SET NULL ON UPDATE RESTRICT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1),
  CONSTRAINT company_events_dates CHECK (ends_on >= starts_on AND ends_on - starts_on <= 31),
  CONSTRAINT company_events_times CHECK (
    end_time IS NULL OR (start_time IS NOT NULL AND (ends_on > starts_on OR end_time > start_time))
  )
);

CREATE INDEX idx_company_events_dates ON public.company_events (starts_on, ends_on);

COMMENT ON TABLE public.announcements IS
  'HR announcements to the company or one department: draft, published, archived. Plain text; not a feed.';
COMMENT ON TABLE public.announcement_reads IS
  'Which account has opened which announcement, and when. Nothing else about the reader.';
COMMENT ON TABLE public.company_holidays IS
  'Company non-working days, one per date.';
COMMENT ON TABLE public.company_events IS
  'Dated company occasions shown on the company calendar. Times are company wall-clock times.';
