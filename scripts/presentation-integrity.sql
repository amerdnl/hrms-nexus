-- Cross-module integrity for the presentation environment.
--
--   docker exec -i hr-nexus-v2-migration-lab psql -U postgres -d hr_nexus_v3_presentation \
--     -Atq -f - < scripts/presentation-integrity.sql
--
-- Read-only. Every row is "check|PASS|detail" or "check|FAIL|detail"; any FAIL means the
-- environment is not fit to present. The checks compare modules against each other rather
-- than against the seed, so a coherent company is proved rather than assumed.
\set ON_ERROR_STOP on
WITH
today AS (SELECT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kuala_Lumpur')::date AS d),
working AS (
  SELECT d::date AS day
  FROM generate_series((SELECT d FROM today) - 200, (SELECT d FROM today) + 200, interval '1 day') AS d
  WHERE extract(isodow FROM d) <= 5
    AND NOT EXISTS (SELECT 1 FROM public.company_holidays h WHERE h.holiday_date = d::date)
),
lines AS (SELECT id, manager_id FROM public.employees),
cycles AS (
  WITH RECURSIVE walk(start_id, id, depth) AS (
    SELECT id, manager_id, 1 FROM lines WHERE manager_id IS NOT NULL
    UNION ALL
    SELECT w.start_id, l.manager_id, w.depth + 1
    FROM walk w JOIN lines l ON l.id = w.id
    WHERE l.manager_id IS NOT NULL AND w.depth < 12
  )
  SELECT count(*) AS total FROM walk WHERE id = start_id
),
checks AS (
  SELECT 1 AS n, 'accounts link to real employees' AS label,
         count(*) FILTER (WHERE u.employee_id IS NOT NULL AND e.id IS NULL) AS bad,
         count(*)::text AS detail
  FROM public.users u LEFT JOIN public.employees e ON e.id = u.employee_id

  UNION ALL SELECT 2, 'every employee has a department',
         count(*) FILTER (WHERE department_id IS NULL), count(*)::text FROM public.employees

  UNION ALL SELECT 3, 'every manager reference exists',
         count(*) FILTER (WHERE m.id IS NULL AND e.manager_id IS NOT NULL), count(*)::text
  FROM public.employees e LEFT JOIN public.employees m ON m.id = e.manager_id

  UNION ALL SELECT 4, 'no reporting cycles', (SELECT total FROM cycles), 'walked to depth 12'

  UNION ALL SELECT 5, 'the manager account has direct reports',
         CASE WHEN count(*) >= 3 THEN 0 ELSE 1 END, count(*)::text || ' direct reports'
  FROM public.employees WHERE manager_id = 9203

  UNION ALL SELECT 6, 'the employee account holds no HR capability',
         count(*) FILTER (WHERE role <> 'employee' OR employee_id IS NULL), 'role checked'
  FROM public.users WHERE id = 9205

  -- The product counts leave on the working week alone; a public holiday inside a
  -- range still counts as leave, and the leave page says so. The check holds the
  -- data to the product's rule, not to a different one.
  UNION ALL SELECT 7, 'leave working days match the product''s own counting',
         count(*) FILTER (WHERE l.working_days <> (
           SELECT count(*) FROM generate_series(l.start_date, l.end_date, interval '1 day') d
           WHERE extract(isodow FROM d) <= 5)),
         count(*)::text || ' requests'
  FROM public.leave_requests l

  UNION ALL SELECT 8, 'nobody is clocked in on a day of approved leave',
         count(*), 'overlaps'
  FROM public.attendance a JOIN public.leave_requests l
    ON l.employee_id = a.employee_id AND l.status = 'approved'
   AND a.attendance_date BETWEEN l.start_date AND l.end_date
  WHERE a.check_in_time IS NOT NULL

  UNION ALL SELECT 9, 'approved leave today matches the on-leave attendance rows',
         (SELECT count(*) FROM public.leave_requests l, today t
           WHERE l.status = 'approved' AND t.d BETWEEN l.start_date AND l.end_date
             AND EXISTS (SELECT 1 FROM working w WHERE w.day = t.d))
       - (SELECT count(*) FROM public.attendance a, today t
           WHERE a.attendance_date = t.d AND a.status = 'on_leave'),
         'approved leave vs on_leave rows today'

  UNION ALL SELECT 10, 'no attendance on a weekend or a public holiday',
         count(*), count(*)::text
  FROM public.attendance a
  WHERE extract(isodow FROM a.attendance_date) > 5
     OR EXISTS (SELECT 1 FROM public.company_holidays h WHERE h.holiday_date = a.attendance_date)

  UNION ALL SELECT 11, 'the latest paid payroll has a payslip for every paid employee',
         (SELECT count(*) FROM public.employee_compensation c
           WHERE c.effective_from <= (SELECT end_date FROM public.payroll_periods WHERE status = 'paid' ORDER BY period_month DESC LIMIT 1))
       - (SELECT count(*) FROM public.payroll_records r
           WHERE r.period_id = (SELECT id FROM public.payroll_periods WHERE status = 'paid' ORDER BY period_month DESC LIMIT 1)),
         (SELECT count(*)::text FROM public.payroll_records r
           WHERE r.period_id = (SELECT id FROM public.payroll_periods WHERE status = 'paid' ORDER BY period_month DESC LIMIT 1)) || ' payslips'

  UNION ALL SELECT 12, 'onboarding never starts before the employment date',
         count(*) FILTER (WHERE p.kind = 'onboarding' AND p.starts_on < e.employment_date), count(*)::text || ' plans'
  FROM public.lifecycle_plans p JOIN public.employees e ON e.id = p.employee_id

  UNION ALL SELECT 13, 'every lifecycle task belongs to a plan of a real employee',
         count(*) FILTER (WHERE p.id IS NULL), count(*)::text || ' tasks'
  FROM public.lifecycle_tasks t LEFT JOIN public.lifecycle_plans p ON p.id = t.plan_id

  UNION ALL SELECT 14, 'review states match what has been submitted',
         count(*) FILTER (WHERE (status = 'completed') <> (manager_submitted_at IS NOT NULL)
                             OR (status = 'pending_self') <> (self_submitted_at IS NULL)),
         count(*)::text || ' reviews'
  FROM public.review_participants

  UNION ALL SELECT 15, 'completed goals are at full progress and stamped',
         count(*) FILTER (WHERE status = 'completed' AND (progress <> 100 OR completed_at IS NULL)),
         count(*)::text || ' goals'
  FROM public.goals

  UNION ALL SELECT 16, 'no dangling employee references',
         (SELECT count(*) FROM public.attendance a WHERE NOT EXISTS (SELECT 1 FROM public.employees e WHERE e.id = a.employee_id))
       + (SELECT count(*) FROM public.leave_requests l WHERE NOT EXISTS (SELECT 1 FROM public.employees e WHERE e.id = l.employee_id))
       + (SELECT count(*) FROM public.goals g WHERE NOT EXISTS (SELECT 1 FROM public.employees e WHERE e.id = g.owner_employee_id))
       + (SELECT count(*) FROM public.recognitions r WHERE NOT EXISTS (SELECT 1 FROM public.employees e WHERE e.id = r.receiver_employee_id)),
         'attendance, leave, goals, recognition'

  UNION ALL SELECT 17, 'saved dashboards belong to real accounts and hold no HR-only widget',
         count(*) FILTER (WHERE NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = d.user_id))
       + count(*) FILTER (WHERE d.layout::text ~ '"(headcount|on-leave-today|late-today|pending-leave|attendance-today|payroll-status|lifecycle|recent-activity|recent-employees|insights)"'
                            AND (SELECT role FROM public.users u WHERE u.id = d.user_id) <> 'admin'),
         count(*)::text || ' saved layouts'
  FROM public.user_dashboard_layouts d

  UNION ALL SELECT 18, 'everyone sits inside the reserved presentation range',
         count(*) FILTER (WHERE id < 9200 OR id > 9299), count(*)::text || ' employees'
  FROM public.employees

  UNION ALL SELECT 19, 'attendance history claims no verification it did not perform',
         count(*) FILTER (WHERE verification_status = 'verified'), count(*)::text || ' rows'
  FROM public.attendance

  UNION ALL SELECT 20, 'every published announcement has a publication time',
         count(*) FILTER (WHERE status = 'published' AND published_at IS NULL), count(*)::text || ' announcements'
  FROM public.announcements
)
SELECT n || '. ' || label || '|' || CASE WHEN bad = 0 THEN 'PASS' ELSE 'FAIL' END || '|' || detail
FROM checks ORDER BY n;
