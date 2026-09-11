import type { Crumb } from "../components/ui/Breadcrumbs";

/**
 * Breadcrumb trails, derived from the pathname in the shell rather than passed
 * up from each page.
 *
 * Doing it here is what keeps the redesign out of 25 page files: a page does
 * not know, and should not need to know, where it sits in the navigation.
 *
 * Dynamic segments are rendered as a generic label ("Details", "Edit") rather
 * than as the raw id, because "Employees / 42 / Edit" is worse than no name at
 * all. Substituting the real record name needs data the shell has not
 * fetched; that is a later stage, and this shape accepts it without changing.
 */
interface Pattern {
  /** Path split on "/", with ":" marking a dynamic segment. */
  segments: string[];
  crumbs: Crumb[];
}

const ADMIN: Record<string, string> = {
  dashboard: "Dashboard",
  employees: "Employees",
  departments: "Departments",
  attendance: "Attendance",
  leave: "Leave",
  payroll: "Payroll",
  reports: "Reports",
  audit: "Audit log",
  export: "Data export",
  import: "Import",
  settings: "Settings",
};

const EMPLOYEE: Record<string, string> = {
  dashboard: "Dashboard",
  profile: "Profile",
  attendance: "Attendance",
  leave: "Leave",
  payroll: "Payslips",
};

const TEAM: Record<string, string> = {
  leave: "Leave",
  attendance: "Attendance",
};

const patterns: Pattern[] = [
  // Employees
  { segments: ["admin", "employees", "new"],
    crumbs: [{ label: "Employees", to: "/admin/employees" }, { label: "Add" }] },
  { segments: ["admin", "employees", ":", "edit"],
    crumbs: [{ label: "Employees", to: "/admin/employees" }, { label: "Edit" }] },
  { segments: ["admin", "employees", ":"],
    crumbs: [{ label: "Employees", to: "/admin/employees" }, { label: "Details" }] },
  // Departments
  { segments: ["admin", "departments", "new"],
    crumbs: [{ label: "Departments", to: "/admin/departments" }, { label: "Add" }] },
  { segments: ["admin", "departments", ":", "edit"],
    crumbs: [{ label: "Departments", to: "/admin/departments" }, { label: "Edit" }] },
  { segments: ["admin", "departments", ":"],
    crumbs: [{ label: "Departments", to: "/admin/departments" }, { label: "Details" }] },
];

function matches(pattern: Pattern, segments: string[]): boolean {
  if (pattern.segments.length !== segments.length) return false;
  return pattern.segments.every(
    (part, index) => part === ":" || part === segments[index],
  );
}

export function breadcrumbsFor(pathname: string): Crumb[] {
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length === 0) return [];

  const [scope, ...rest] = segments;

  // The team area: its overview is a real page, so it is the linked root.
  if (scope === "team") {
    const leaf = rest[0] ? TEAM[rest[0]] : undefined;
    return leaf ? [{ label: "My team", to: "/team" }, { label: leaf }] : [{ label: "My team" }];
  }

  const root: Crumb = {
    label: scope === "admin" ? "Admin" : "Employee",
    // Not linked: the scope is a grouping, not a page. Breadcrumbs marks a
    // crumb without `to` as plain text.
  };

  const pattern = patterns.find((candidate) => matches(candidate, segments));
  if (pattern) return [root, ...pattern.crumbs];

  const labels = scope === "admin" ? ADMIN : EMPLOYEE;
  const leaf = rest[0] ? labels[rest[0]] : undefined;

  return leaf ? [root, { label: leaf }] : [root];
}

/** The page's own name, used as the mobile header title. */
export function pageTitleFor(pathname: string): string {
  const crumbs = breadcrumbsFor(pathname);
  return crumbs.length > 0 ? crumbs[crumbs.length - 1].label : "HR Nexus";
}
