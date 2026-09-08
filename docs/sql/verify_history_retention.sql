-- Read-only evidence, safe before or after migration. No row contents or credentials.
SELECT current_database() AS database, version() AS server_version;
SELECT 'departments' AS table_name, COUNT(*) AS row_count,
  md5(COALESCE(jsonb_agg(to_jsonb(t) ORDER BY id)::text, '[]')) AS content_digest FROM public.departments t
UNION ALL SELECT 'employees', COUNT(*), md5(COALESCE(jsonb_agg(to_jsonb(t) ORDER BY id)::text, '[]')) FROM public.employees t
UNION ALL SELECT 'users', COUNT(*), md5(COALESCE(jsonb_agg(to_jsonb(t) ORDER BY id)::text, '[]')) FROM public.users t
UNION ALL SELECT 'leave_requests', COUNT(*), md5(COALESCE(jsonb_agg(to_jsonb(t) ORDER BY id)::text, '[]')) FROM public.leave_requests t
UNION ALL SELECT 'attendance', COUNT(*), md5(COALESCE(jsonb_agg(to_jsonb(t) ORDER BY id)::text, '[]')) FROM public.attendance t;
SELECT a.id, a.employee_id, a.attendance_date,
  md5(to_jsonb(a)::text) AS complete_row_digest
FROM public.attendance a
WHERE NOT EXISTS (SELECT 1 FROM public.employees e WHERE e.id = a.employee_id)
ORDER BY a.id;
SELECT table_name, column_name, data_type, column_default
FROM information_schema.columns WHERE table_schema = 'public'
  AND column_name IN ('id','employee_id','department_id','reviewed_by')
ORDER BY table_name, ordinal_position;
SELECT sequencename, data_type, last_value FROM pg_sequences
WHERE schemaname = 'public' ORDER BY sequencename;
SELECT conrelid::regclass AS table_name, conname, convalidated, pg_get_constraintdef(oid)
FROM pg_constraint WHERE connamespace = 'public'::regnamespace ORDER BY 1, 2;
SELECT to_regclass('public.schema_migrations') AS migration_history,
  to_regclass('public.attendance_integrity_exceptions') AS exception_view;
