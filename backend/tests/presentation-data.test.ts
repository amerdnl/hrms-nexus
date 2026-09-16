/**
 * The presentation dataset, checked without a database.
 *
 * The seed writes thousands of rows into an isolated environment that a person
 * then presents from. These are the properties that must hold before any of it
 * reaches a database: the company is coherent, the reserved range is respected,
 * and nothing in it is a placeholder.
 */
import assert from "node:assert/strict";
import test from "node:test";
import {
  PRESENTATION_ID_MAX,
  PRESENTATION_ID_MIN,
  presentationAdmin,
  presentationAnnouncements,
  presentationCompany,
  presentationDepartments,
  presentationEmployeeAccount,
  presentationEmployeeAccounts,
  presentationEmployees,
  presentationGoals,
  presentationHolidays,
  presentationLeave,
  presentationLifecyclePlans,
  presentationLifecycleTemplates,
  presentationManagerAccount,
  presentationRecognitions,
  presentationReviewCycles,
  type PresentationCalendar,
} from "../src/database/presentationData.js";

const addDays = (date: string, days: number): string => {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
};
const isoWeekday = (date: string) => {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  return day === 0 ? 7 : day;
};
const holidays = new Set(presentationHolidays.map((holiday) => holiday.date));
const working = (date: string) => presentationCompany.workingDays.includes(isoWeekday(date)) && !holidays.has(date);
const addWorkingDays = (date: string, days: number) => {
  let cursor = date;
  const step = days >= 0 ? 1 : -1;
  for (let left = Math.abs(days); left > 0; left -= 1) {
    do { cursor = addDays(cursor, step); } while (!working(cursor));
  }
  return cursor;
};
/** A Thursday, so the fixtures are evaluated on an ordinary working day. */
const calendar: PresentationCalendar = { today: "2026-09-17", addDays, addWorkingDays };

test("the company is a Kuala Lumpur company on a Monday-to-Friday week", () => {
  assert.equal(presentationCompany.timezone, "Asia/Kuala_Lumpur");
  assert.deepEqual([...presentationCompany.workingDays], [1, 2, 3, 4, 5]);
  assert.equal(presentationCompany.workStart, "09:00");
  assert.equal(presentationCompany.workEnd, "18:00");
});

test("every employee sits in the reserved range, with a unique number and a real department", () => {
  const ids = new Set<number>();
  const numbers = new Set<string>();
  const departments = new Set(presentationDepartments.map((department) => department.name));
  assert.ok(presentationEmployees.length >= 32 && presentationEmployees.length <= 36,
    `${presentationEmployees.length} employees`);
  for (const employee of presentationEmployees) {
    assert.ok(employee.id >= PRESENTATION_ID_MIN && employee.id <= PRESENTATION_ID_MAX, `${employee.id}`);
    assert.ok(!ids.has(employee.id), `duplicate id ${employee.id}`);
    assert.ok(!numbers.has(employee.employeeNumber), `duplicate number ${employee.employeeNumber}`);
    ids.add(employee.id);
    numbers.add(employee.employeeNumber);
    assert.ok(departments.has(employee.department), `${employee.department} is not a department`);
    assert.match(employee.fullName, /^[A-Za-z][A-Za-z' .@/-]+$/u);
    assert.doesNotMatch(employee.fullName, /lorem|test|employee \d|user \d/i);
  }
  assert.ok(presentationAdmin.id >= PRESENTATION_ID_MIN && presentationAdmin.id <= PRESENTATION_ID_MAX);
});

test("the reporting lines form a tree: every manager exists, nobody is their own, no cycles", () => {
  const byId = new Map(presentationEmployees.map((employee) => [employee.id, employee]));
  let roots = 0;
  for (const employee of presentationEmployees) {
    if (employee.managerId === undefined) { roots += 1; continue; }
    assert.notEqual(employee.managerId, employee.id);
    assert.ok(byId.has(employee.managerId), `${employee.id} reports to a stranger`);
    const seen = new Set<number>([employee.id]);
    let cursor = byId.get(employee.managerId);
    while (cursor) {
      assert.ok(!seen.has(cursor.id), `reporting cycle at ${cursor.id}`);
      seen.add(cursor.id);
      cursor = cursor.managerId === undefined ? undefined : byId.get(cursor.managerId);
    }
  }
  assert.equal(roots, 1, "exactly one person is at the top");
  const depth = (id: number): number => {
    const employee = byId.get(id)!;
    return employee.managerId === undefined ? 1 : depth(employee.managerId) + 1;
  };
  assert.ok(Math.max(...presentationEmployees.map((employee) => depth(employee.id))) >= 3, "at least three levels");
});

test("the three demonstration accounts are what the walkthrough needs", () => {
  const manager = presentationEmployees.find((employee) => employee.id === presentationManagerAccount.id);
  const employee = presentationEmployees.find((person) => person.id === presentationEmployeeAccount.id);
  assert.ok(manager && employee);
  const reports = presentationEmployees.filter((person) => person.managerId === manager.id);
  assert.ok(reports.length >= 3, `the manager account has ${reports.length} direct reports`);
  assert.equal(employee.managerId, manager.id, "the employee reports to the manager account");
  assert.ok(presentationEmployeeAccounts.every((account) => /@meridian-demo\.invalid$/.test(account.email)));
  assert.match(presentationAdmin.email, /@meridian-demo\.invalid$/);
});

test("salaries vary by person and every active employee below the top is paid", () => {
  const salaries = presentationEmployees.map((employee) => employee.basicSalarySen).filter(Boolean) as number[];
  assert.equal(salaries.length, presentationEmployees.length, "everyone has compensation");
  assert.ok(new Set(salaries).size >= salaries.length - 1, "salaries are not copied between people");
  assert.ok(Math.min(...salaries) >= 400000 && Math.max(...salaries) <= 4000000, "salaries are plausible");
});

test("the 2026 public holidays are Kuala Lumpur's, one row per date, in order", () => {
  const dates = presentationHolidays.map((holiday) => holiday.date);
  assert.equal(new Set(dates).size, dates.length, "one row per date");
  assert.deepEqual(dates, [...dates].sort(), "kept in date order");
  assert.ok(dates.every((date) => date.startsWith("2026-")));
  for (const expected of ["2026-01-01", "2026-02-17", "2026-05-01", "2026-08-31", "2026-09-16", "2026-12-25"]) {
    assert.ok(dates.includes(expected), `${expected} is missing`);
  }
  assert.ok(presentationHolidays.some((holiday) => /Malaysia Day/.test(holiday.name)));
  assert.ok(presentationHolidays.some((holiday) => /Federal Territory Day/.test(holiday.name)));
});

test("leave is coherent: real people, ordered dates, a queue and history", () => {
  const leave = presentationLeave(calendar);
  const ids = new Set(presentationEmployees.map((employee) => employee.id));
  for (const request of leave) {
    assert.ok(ids.has(request.employee), `${request.employee} is not an employee`);
    assert.ok(request.start <= request.end, `${request.start} to ${request.end}`);
    assert.ok(request.reason.trim().length > 4);
  }
  assert.ok(leave.some((request) => request.status === "pending"), "someone is waiting for a decision");
  assert.ok(leave.some((request) => request.status === "approved" && request.start > calendar.today), "leave is coming up");
  assert.ok(leave.some((request) => request.status === "approved" && request.end < calendar.today), "leave has been taken");
  assert.ok(leave.some((request) => request.status === "rejected") && leave.some((request) => request.status === "cancelled"));
  const managerQueue = leave.filter((request) => request.status === "pending"
    && presentationEmployees.find((person) => person.id === request.employee)?.managerId === presentationManagerAccount.id);
  assert.ok(managerQueue.length >= 2, "the manager has decisions to make");
});

test("goals, recognition, reviews and lifecycle plans point at real people and read like work", () => {
  const ids = new Set(presentationEmployees.map((employee) => employee.id));
  const goals = presentationGoals(calendar);
  for (const goal of goals) {
    assert.ok(ids.has(goal.owner) && ids.has(goal.setBy));
    assert.ok(goal.startsOn <= goal.dueOn);
    assert.ok(goal.progress >= 0 && goal.progress <= 100);
    assert.equal(goal.status === "completed", goal.progress === 100 && goal.completedOn !== undefined);
    assert.doesNotMatch(goal.title, /goal \d|lorem/i);
  }
  assert.ok(goals.some((goal) => goal.owner === presentationManagerAccount.id), "the manager has goals of her own");
  assert.ok(goals.some((goal) => goal.owner === presentationEmployeeAccount.id), "the employee has goals");
  assert.ok(goals.some((goal) => goal.status === "active" && goal.dueOn < calendar.today), "something is genuinely overdue");

  for (const recognition of presentationRecognitions(calendar)) {
    assert.ok(ids.has(recognition.giver) && ids.has(recognition.receiver));
    assert.notEqual(recognition.giver, recognition.receiver);
    assert.ok(recognition.message.trim().length >= 20);
  }

  const cycles = presentationReviewCycles(calendar);
  assert.ok(cycles.some((cycle) => cycle.status === "open") && cycles.some((cycle) => cycle.status === "closed"));
  for (const cycle of cycles) {
    assert.ok(cycle.periodStart <= cycle.periodEnd && cycle.selfDueOn <= cycle.managerDueOn);
    for (const review of cycle.reviews) {
      assert.ok(ids.has(review.employee));
      if (review.manager) assert.ok(review.self, "a manager review always follows a self-review");
    }
  }
  const open = cycles.find((cycle) => cycle.status === "open")!;
  const waiting = open.reviews.filter((review) => review.self && !review.manager);
  assert.ok(waiting.length >= 2, "the manager has reviews to write");

  const templates = new Set(presentationLifecycleTemplates.map((template) => template.key));
  const plans = presentationLifecyclePlans(calendar);
  assert.ok(plans.some((plan) => plan.template === "onboarding") && plans.some((plan) => plan.template === "offboarding"));
  for (const plan of plans) {
    assert.ok(ids.has(plan.employeeId) && templates.has(plan.template));
    assert.ok(plan.startsOn <= plan.targetDate);
    const template = presentationLifecycleTemplates.find((entry) => entry.key === plan.template)!;
    assert.equal(plan.template === "offboarding", plan.exitStatus !== undefined);
    assert.ok(plan.done.every((position) => position >= 1 && position <= template.tasks.length));
    assert.ok(plan.done.length < template.tasks.length, "a plan in progress still has work in it");
  }
});

test("announcements are dated sensibly around the company's today, and one is still a draft", () => {
  const announcements = presentationAnnouncements(calendar);
  assert.ok(announcements.some((announcement) => announcement.status === "draft"));
  for (const announcement of announcements) {
    assert.ok(announcement.body.trim().length >= 40);
    assert.doesNotMatch(announcement.body, /lorem|placeholder/i);
    if (announcement.status === "published") {
      assert.ok(announcement.publishedOn && announcement.publishedOn <= calendar.today,
        `${announcement.key} is published in the future`);
    } else {
      assert.equal(announcement.publishedOn, undefined);
    }
  }
});
