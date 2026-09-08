-- REVIEW-ONLY compensation for the inspected legacy schema (no attendance FK).
-- Never run directly on the existing database without separate approval.
-- Rehearsed as a NEW numbered migration in an isolated copy so the applied-history
-- ledger is retained. This weakens DB protection; prefer a forward fix instead.
-- No employee/attendance/leave/user rows, IDs or sequences are changed.
LOCK TABLE public.employees, public.users, public.leave_requests, public.attendance
  IN ACCESS EXCLUSIVE MODE;
DROP VIEW public.attendance_integrity_exceptions;
DROP TRIGGER prevent_orphan_attendance_reassignment ON public.attendance;
DROP TRIGGER prevent_orphan_employee_id_reuse ON public.employees;
DROP FUNCTION public.prevent_orphan_attendance_reassignment();
DROP FUNCTION public.prevent_orphan_employee_id_reuse();
ALTER TABLE public.attendance DROP CONSTRAINT attendance_employee_id_fkey;
ALTER TABLE public.users DROP CONSTRAINT users_employee_id_fkey,
  ADD CONSTRAINT users_employee_id_fkey FOREIGN KEY (employee_id)
    REFERENCES public.employees(id) ON DELETE CASCADE;
ALTER TABLE public.leave_requests DROP CONSTRAINT leave_requests_employee_id_fkey,
  ADD CONSTRAINT leave_requests_employee_id_fkey FOREIGN KEY (employee_id)
    REFERENCES public.employees(id) ON DELETE CASCADE;
