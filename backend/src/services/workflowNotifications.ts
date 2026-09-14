/**
 * Who is told what, for each workflow event.
 *
 * Each producer resolves its recipients from current data, inside the caller's
 * transaction, and composes text that every recipient is entitled to read:
 *
 *   leave submitted        the employee's manager, or HR when there is none
 *   leave decided          the employee
 *   leave cancelled        the employee, when someone else cancelled it
 *   payroll approved       each employee with a payslip in the period
 *   reporting line changed the employee and their new manager
 *   announcement published its audience
 *
 * No text carries a leave reason, a decision comment, an amount or anything
 * else the recipient's own pages would not show them.
 */
import type { PoolClient } from "pg";
import {
  accountsOfEmployees,
  adminAccounts,
  audienceAccounts,
  managerAccountOf,
  notify,
} from "./notificationService.js";
import { formatDateRange, formatMonth, isoDate, leaveTypeLabel, plural } from "../utils/dateText.js";

type Db = Pick<PoolClient, "query">;

interface LeaveFacts {
  id: number | string;
  employee_id: number | string;
  leave_type: string;
  start_date: string | Date;
  end_date: string | Date;
  working_days?: number | string | null;
}

function rangeOf(leave: LeaveFacts): string {
  return formatDateRange(isoDate(leave.start_date), isoDate(leave.end_date));
}

async function employeeName(employeeId: number, db: Db): Promise<string> {
  const result = await db.query<{ full_name: string }>(
    "SELECT full_name FROM public.employees WHERE id = $1", [employeeId],
  );
  return result.rows[0]?.full_name ?? "An employee";
}

export async function leaveSubmitted(db: Db, leave: LeaveFacts, actorUserId: number | null): Promise<void> {
  const employeeId = Number(leave.employee_id);
  const days = Number(leave.working_days ?? 0);
  const name = await employeeName(employeeId, db);
  const base = {
    kind: "leave_submitted" as const,
    title: `${name} requested leave`,
    body: `${leaveTypeLabel(leave.leave_type)} · ${rangeOf(leave)} · ${plural(days, "working day")}`,
    entityType: "leave",
    entityId: leave.id,
    dedupeKey: `leave:${leave.id}:submitted`,
    actorUserId,
  };

  // The manager decides; HR is told only when there is no manager to tell.
  const manager = await managerAccountOf(employeeId, db);
  if (manager.length > 0) {
    await notify(manager, { ...base, link: "/team/leave?status=pending" }, db);
  } else {
    await notify(await adminAccounts(db), { ...base, link: "/admin/leave?status=pending" }, db);
  }
}

export async function leaveDecided(
  db: Db,
  leave: LeaveFacts & { status: string },
  actorUserId: number | null,
): Promise<void> {
  const approved = leave.status === "approved";
  await notify(await accountsOfEmployees([Number(leave.employee_id)], db), {
    kind: approved ? "leave_approved" : "leave_rejected",
    title: approved ? "Your leave was approved" : "Your leave request was not approved",
    body: `${leaveTypeLabel(leave.leave_type)} · ${rangeOf(leave)}`,
    link: "/employee/leave",
    entityType: "leave",
    entityId: leave.id,
    dedupeKey: `leave:${leave.id}:decided`,
    actorUserId,
  }, db);
}

/** Only reaches the employee when someone else cancelled: nobody is told about their own action. */
export async function leaveCancelled(db: Db, leave: LeaveFacts, actorUserId: number | null): Promise<void> {
  await notify(await accountsOfEmployees([Number(leave.employee_id)], db), {
    kind: "leave_cancelled",
    title: "Your leave was cancelled by HR",
    body: `${leaveTypeLabel(leave.leave_type)} · ${rangeOf(leave)}. The days are available again.`,
    link: "/employee/leave",
    entityType: "leave",
    entityId: leave.id,
    dedupeKey: `leave:${leave.id}:cancelled`,
    actorUserId,
  }, db);
}

export async function payslipsPublished(
  db: Db,
  period: { id: number | string; period_year: number; period_month: number },
  actorUserId: number | null,
): Promise<void> {
  const holders = await db.query<{ employee_id: string | number }>(
    "SELECT DISTINCT employee_id FROM public.payroll_records WHERE period_id = $1",
    [period.id],
  );
  await notify(await accountsOfEmployees(holders.rows.map((row) => Number(row.employee_id)), db), {
    kind: "payslip_published",
    title: `Your payslip for ${formatMonth(Number(period.period_year), Number(period.period_month))} is ready`,
    link: "/employee/payroll",
    entityType: "payroll_period",
    entityId: period.id,
    dedupeKey: `payroll:${period.id}:published`,
    actorUserId,
  }, db);
}

/** Marking a period paid tells each person with a payslip in it, once. */
export async function payrollPaid(
  db: Db,
  period: { id: number | string; period_year: number; period_month: number },
  actorUserId: number | null,
): Promise<void> {
  const holders = await db.query<{ employee_id: string | number }>(
    "SELECT DISTINCT employee_id FROM public.payroll_records WHERE period_id = $1",
    [period.id],
  );
  await notify(await accountsOfEmployees(holders.rows.map((row) => Number(row.employee_id)), db), {
    kind: "payroll_paid",
    title: `Your pay for ${formatMonth(Number(period.period_year), Number(period.period_month))} has been paid`,
    link: "/employee/payroll",
    entityType: "payroll_period",
    entityId: period.id,
    dedupeKey: `payroll:${period.id}:paid`,
    actorUserId,
  }, db);
}

export async function reportingLineChanged(
  db: Db,
  change: { employeeId: number; employeeName: string; managerId: number | null; managerName: string | null },
  actorUserId: number | null,
): Promise<void> {
  await notify(await accountsOfEmployees([change.employeeId], db), {
    kind: "manager_changed",
    title: change.managerId === null ? "Your reporting line was updated" : `You now report to ${change.managerName}`,
    body: change.managerId === null ? "HR removed your recorded manager." : null,
    link: `/people/${change.managerId ?? change.employeeId}`,
    entityType: "employee",
    entityId: change.employeeId,
    actorUserId,
  }, db);

  if (change.managerId !== null) {
    await notify(await accountsOfEmployees([change.managerId], db), {
      kind: "report_added",
      title: `${change.employeeName} now reports to you`,
      link: `/people/${change.employeeId}`,
      entityType: "employee",
      entityId: change.employeeId,
      actorUserId,
    }, db);
  }
}

export async function announcementPublished(
  db: Db,
  announcement: { id: number | string; title: string; body: string; priority: string; department_id: number | string | null },
  actorUserId: number | null,
): Promise<void> {
  const excerpt = announcement.body.replace(/\s+/g, " ").trim();
  await notify(
    await audienceAccounts(announcement.department_id === null ? null : Number(announcement.department_id), db),
    {
      kind: "announcement_published",
      title: announcement.priority === "important" ? `Important: ${announcement.title}` : announcement.title,
      body: excerpt.length > 140 ? `${excerpt.slice(0, 139)}…` : excerpt,
      link: `/announcements/${announcement.id}`,
      entityType: "announcement",
      entityId: announcement.id,
      dedupeKey: `announcement:${announcement.id}:published`,
      actorUserId,
    },
    db,
  );
}
