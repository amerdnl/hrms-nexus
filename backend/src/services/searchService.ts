/**
 * Global search, filtered on the server before anything is returned.
 *
 * A result is only ever something the caller could open:
 *
 *   people        the working company's social layer (name, role, department)
 *   departments   every department, with how many working people it has
 *   destinations  pages the caller's role and scopes can reach
 *   HR records    HR only: any employee record, including people who have left
 *
 * Nothing is found and then denied at the destination. A former employee, a
 * page for another role or an HR record is simply not in a colleague's
 * results, so titles and counts cannot leak what the caller may not see.
 */
import type { Pool, PoolClient } from "pg";
import pool from "../config/db.js";
import type { AuthenticatedUser } from "../types/auth.js";
import { likePattern } from "./peopleService.js";

type Db = Pick<PoolClient, "query"> | Pool;

type Requirement = "any" | "admin" | "employee" | "manager";

interface Destination {
  label: string;
  description: string;
  path: string;
  keywords: string;
  requires: Requirement;
}

/**
 * Pages worth jumping to, by who may open them. Mirrors the routes the
 * frontend guards; the server decides which of these a caller sees.
 */
const destinations: Destination[] = [
  { label: "Action Center", description: "Work waiting for you", path: "/actions", keywords: "tasks todo pending approvals inbox", requires: "any" },
  { label: "Notifications", description: "Everything you were told about", path: "/notifications", keywords: "alerts inbox updates", requires: "any" },
  { label: "People", description: "Company directory", path: "/people", keywords: "directory colleagues coworkers staff employees find", requires: "any" },
  { label: "Org chart", description: "How the company is organised", path: "/org", keywords: "organisation organization structure hierarchy reporting", requires: "any" },
  { label: "Calendar", description: "Holidays, events and who's out", path: "/calendar", keywords: "who's out whos out holidays events availability absence", requires: "any" },
  { label: "Announcements", description: "News from HR", path: "/announcements", keywords: "news notices updates", requires: "any" },
  { label: "Recognition", description: "Thank a colleague, and see who was thanked", path: "/recognition", keywords: "recognition kudos thanks appreciation praise", requires: "any" },
  { label: "My tasks", description: "Onboarding and offboarding tasks for you", path: "/tasks", keywords: "tasks checklist onboarding offboarding todo", requires: "any" },

  { label: "My dashboard", description: "Your day at a glance", path: "/employee/dashboard", keywords: "home overview", requires: "employee" },
  { label: "My attendance", description: "Check in and your history", path: "/employee/attendance", keywords: "check in clock in check out qr", requires: "employee" },
  { label: "Request leave", description: "Apply for time off and see balances", path: "/employee/leave", keywords: "leave holiday time off vacation annual medical balance apply", requires: "employee" },
  { label: "My payslips", description: "Approved payslips", path: "/employee/payroll", keywords: "payslip salary pay payroll", requires: "employee" },
  { label: "My goals", description: "Your goals and their progress", path: "/goals", keywords: "goals objectives okr targets progress", requires: "employee" },
  { label: "My reviews", description: "Self-reviews and your manager's reviews", path: "/reviews", keywords: "review performance appraisal self-review feedback rating", requires: "employee" },
  { label: "My profile", description: "Your details and About me", path: "/employee/profile", keywords: "profile about skills password account", requires: "employee" },

  { label: "Team overview", description: "Your direct reports today", path: "/team", keywords: "team reports manager direct", requires: "manager" },
  { label: "Team leave", description: "Decide your team's leave", path: "/team/leave", keywords: "team leave approve reject decide requests", requires: "manager" },
  { label: "Team goals", description: "Your reports' goals", path: "/team/goals", keywords: "team goals objectives progress", requires: "manager" },
  { label: "Team reviews", description: "Reviews to write for your reports", path: "/team/reviews", keywords: "team reviews performance appraisal", requires: "manager" },
  { label: "Team attendance", description: "Your team's attendance", path: "/team/attendance", keywords: "team attendance late absent", requires: "manager" },

  { label: "Company dashboard", description: "Workforce at a glance", path: "/admin/dashboard", keywords: "home overview admin", requires: "admin" },
  // No separate "Employees" page: HR manages people from the People directory,
  // which the "People" entry above already finds by "employees" and "staff".
  { label: "Add employee", description: "Create an employee record", path: "/admin/employees/new", keywords: "employees staff records hr add hire new", requires: "admin" },
  { label: "Departments", description: "Company departments", path: "/admin/departments", keywords: "departments teams units", requires: "admin" },
  { label: "Attendance records", description: "Company attendance", path: "/admin/attendance", keywords: "attendance corrections check in", requires: "admin" },
  { label: "Leave requests", description: "Company leave and policies", path: "/admin/leave", keywords: "leave approve policies entitlements balances", requires: "admin" },
  { label: "Payroll", description: "Periods, calculation and approval", path: "/admin/payroll", keywords: "payroll salary pay run approve payslips", requires: "admin" },
  { label: "Reports", description: "Workforce, attendance and leave reports", path: "/admin/reports", keywords: "reports analytics", requires: "admin" },
  { label: "Audit log", description: "Who did what", path: "/admin/audit", keywords: "audit log history security", requires: "admin" },
  { label: "Data export", description: "Download company data", path: "/admin/export", keywords: "export csv xlsx download", requires: "admin" },
  { label: "Import", description: "Bring in employee data", path: "/admin/import", keywords: "import upload spreadsheet csv", requires: "admin" },
  { label: "Company settings", description: "Working week, office and holidays", path: "/admin/settings", keywords: "settings timezone working week office geofence holidays", requires: "admin" },
  { label: "Performance", description: "Review cycles", path: "/admin/performance", keywords: "performance review cycles appraisal goals", requires: "admin" },
  { label: "Onboarding", description: "New joiners' checklists", path: "/admin/onboarding", keywords: "onboarding new hire joiner starter checklist", requires: "admin" },
  { label: "Offboarding", description: "Leavers' checklists and deactivation", path: "/admin/offboarding", keywords: "offboarding leaver exit resignation checklist deactivate", requires: "admin" },
  { label: "New announcement", description: "Write to the company or a department", path: "/admin/announcements/new", keywords: "announcement publish post notice", requires: "admin" },
];

function allowed(user: AuthenticatedUser, requirement: Requirement): boolean {
  switch (requirement) {
    case "any": return true;
    case "admin": return user.role === "admin";
    case "employee": return user.role === "employee";
    case "manager": return user.isManager;
  }
}

export function destinationsFor(user: AuthenticatedUser, term: string, limit = 6) {
  const words = term.toLowerCase().split(/\s+/).filter(Boolean);
  return destinations
    .filter((destination) => allowed(user, destination.requires))
    .map((destination) => {
      const label = destination.label.toLowerCase();
      const haystack = `${label} ${destination.description.toLowerCase()} ${destination.keywords}`;
      if (!words.every((word) => haystack.includes(word))) return null;
      // Label matches first, then description and keywords.
      const score = label.startsWith(words[0]!) ? 0 : words.every((word) => label.includes(word)) ? 1 : 2;
      return { score, destination };
    })
    .filter((entry): entry is { score: number; destination: Destination } => entry !== null)
    .sort((a, b) => a.score - b.score || a.destination.label.localeCompare(b.destination.label))
    .slice(0, limit)
    .map(({ destination }) => ({ label: destination.label, description: destination.description, path: destination.path }));
}

export async function search(user: AuthenticatedUser, term: string, db: Db = pool) {
  const pattern = likePattern(term);
  // "term%": names that start with the term rank first.
  const prefix = pattern.slice(1);

  const people = await db.query<{
    id: string; full_name: string; job_title: string | null; department_name: string | null; profile_image: string | null;
  }>(
    `SELECT e.id, e.full_name, e.job_title, d.name AS department_name, e.profile_image
     FROM public.employees e
     LEFT JOIN public.departments d ON d.id = e.department_id
     LEFT JOIN public.users u ON u.employee_id = e.id
     LEFT JOIN public.employee_profiles p ON p.employee_id = e.id
     WHERE e.employment_status IN ('active', 'probation')
       AND (e.full_name ILIKE $1 ESCAPE '\\' OR e.job_title ILIKE $1 ESCAPE '\\'
            OR d.name ILIKE $1 ESCAPE '\\' OR u.email ILIKE $1 ESCAPE '\\'
            OR EXISTS (SELECT 1 FROM unnest(p.skills) skill WHERE skill ILIKE $1 ESCAPE '\\'))
     ORDER BY (e.full_name ILIKE $2 ESCAPE '\\') DESC, e.full_name, e.id
     LIMIT 6`,
    [pattern, prefix],
  );

  const departments = await db.query<{ id: string; name: string; people: number }>(
    `SELECT d.id, d.name,
            (SELECT count(*)::int FROM public.employees e
             WHERE e.department_id = d.id AND e.employment_status IN ('active', 'probation')) AS people
     FROM public.departments d
     WHERE d.name ILIKE $1 ESCAPE '\\'
     ORDER BY (d.name ILIKE $2 ESCAPE '\\') DESC, d.name, d.id
     LIMIT 4`,
    [pattern, prefix],
  );

  let records: { id: number; fullName: string; employeeNumber: string; status: string; path: string }[] = [];
  if (user.role === "admin") {
    const result = await db.query<{ id: string; full_name: string; employee_number: string; employment_status: string }>(
      `SELECT id, full_name, employee_number, employment_status
       FROM public.employees
       WHERE full_name ILIKE $1 ESCAPE '\\' OR employee_number ILIKE $1 ESCAPE '\\'
       ORDER BY (employment_status IN ('active', 'probation')) ASC, full_name, id
       LIMIT 4`,
      [pattern],
    );
    records = result.rows.map((row) => ({
      id: Number(row.id),
      fullName: row.full_name,
      employeeNumber: row.employee_number,
      status: row.employment_status,
      path: `/admin/employees/${row.id}`,
    }));
  }

  return {
    people: people.rows.map((row) => ({
      id: Number(row.id),
      fullName: row.full_name,
      jobTitle: row.job_title,
      departmentName: row.department_name,
      profileImage: row.profile_image,
      path: `/people/${row.id}`,
    })),
    departments: departments.rows.map((row) => ({
      id: Number(row.id),
      name: row.name,
      people: row.people,
      path: `/people?department=${row.id}`,
    })),
    destinations: destinationsFor(user, term),
    records,
  };
}
