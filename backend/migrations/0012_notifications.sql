-- V3 in-app notifications.
--
-- One new table. No existing table, column, constraint or row is modified; the
-- five protected orphan attendance rows and the payroll tables are not involved.
-- The runner owns the transaction and sets lock_timeout=5s / statement_timeout=60s.
--
-- A notification tells ONE account that something needs a look. It carries a
-- short title, an optional short body and an app-relative link; the page behind
-- the link authorises the reader again, so a notification is a pointer, never a
-- grant. Writers never put pay, leave reasons, review content, coordinates or
-- credentials in the text.

DO $preflight$
BEGIN
  IF to_regclass('public.users') IS NULL THEN
    RAISE EXCEPTION 'Expected users table is missing';
  END IF;
  IF to_regclass('public.notifications') IS NOT NULL THEN
    RAISE EXCEPTION 'A notifications table already exists; review before applying 0012';
  END IF;
END
$preflight$;

CREATE TABLE public.notifications (
  id BIGSERIAL PRIMARY KEY,
  -- A notification belongs to its account and means nothing without it.
  user_id INTEGER NOT NULL
    REFERENCES public.users(id) ON DELETE CASCADE ON UPDATE RESTRICT,
  kind VARCHAR(40) NOT NULL CHECK (kind ~ '^[a-z][a-z_]{2,39}$'),
  title VARCHAR(160) NOT NULL CHECK (length(btrim(title)) > 0),
  body VARCHAR(500),
  -- An in-app path only: starts with one slash, no scheme, no host, no
  -- protocol-relative "//", no fragment, no spaces. The client routes to it; it
  -- can never send the reader off-site.
  link VARCHAR(300) CHECK (
    link IS NULL OR (link ~ '^/[A-Za-z0-9/_?=&.%-]*$' AND left(link, 2) <> '//')
  ),
  entity_type VARCHAR(40),
  entity_id VARCHAR(64),
  -- A repeated delivery of the same event is recognised and dropped.
  dedupe_key VARCHAR(160),
  actor_user_id INTEGER REFERENCES public.users(id) ON DELETE SET NULL ON UPDATE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  read_at TIMESTAMPTZ,
  CONSTRAINT notifications_entity_paired CHECK ((entity_type IS NULL) = (entity_id IS NULL)),
  CONSTRAINT notifications_read_after_created CHECK (read_at IS NULL OR read_at >= created_at)
);

-- The list a person opens, newest first.
CREATE INDEX idx_notifications_user_recent
  ON public.notifications (user_id, created_at DESC, id DESC);

-- The unread badge, read on every page.
CREATE INDEX idx_notifications_user_unread
  ON public.notifications (user_id)
  WHERE read_at IS NULL;

CREATE UNIQUE INDEX notifications_dedupe_once
  ON public.notifications (user_id, dedupe_key)
  WHERE dedupe_key IS NOT NULL;

COMMENT ON TABLE public.notifications IS
  'In-app notifications, one account each: a short title and an app-relative link the destination page authorises again. Never pay, leave reasons, review content, coordinates or credentials. Read entries are pruned after 90 days.';
