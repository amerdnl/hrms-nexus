import type { Crumb } from "../components/ui/Breadcrumbs";

/**
 * Breadcrumb trails, derived from the pathname in the shell rather than passed
 * up from each page.
 *
 * Doing it here is what keeps the shell out of 50 page files: a page does not
 * know, and should not need to know, where it sits in the navigation.
 *
 * Every trail starts at Home. The sidebar that used to say which area a page
 * belonged to is gone, so the trail is now the one persistent statement of
 * "where am I" below the header - and "Admin" or "Employee" as an unlinked
 * root said nothing a person could act on.
 *
 * Dynamic segments are rendered as a generic label ("Details", "Edit") rather
 * than as the raw id, because "Employees / 42 / Edit" is worse than no name at
 * all.
 */
interface Pattern {
  /** Path split on "/", with ":" marking a dynamic segment. */
  segments: string[];
  crumbs: Crumb[];
}

const ADMIN: Record<string, string> = {
  departments: "Departments",
  attendance: "Attendance",
  leave: "Leave",
  payroll: "Payroll",
  reports: "Reports",
  audit: "Audit log",
  export: "Data export",
  import: "Import",
  settings: "Settings",
  onboarding: "Onboarding",
  offboarding: "Offboarding",
  performance: "Performance",
};

const EMPLOYEE: Record<string, string> = {
  profile: "Profile",
  attendance: "Attendance",
  leave: "Leave",
  payroll: "Payslips",
};

const TEAM: Record<string, string> = {
  leave: "Leave",
  attendance: "Attendance",
  goals: "Goals",
  reviews: "Reviews",
};

const patterns: Pattern[] = [
  // Performance
  { segments: ["admin", "performance", "cycles", ":"],
    crumbs: [{ label: "Performance", to: "/admin/performance" }, { label: "Cycle" }] },
  // Onboarding and offboarding
  { segments: ["admin", "lifecycle", "templates"],
    crumbs: [{ label: "Checklists" }] },
  { segments: ["admin", "lifecycle", "plans", ":"],
    // The path does not say which kind of plan it is, so the trail does not guess.
    crumbs: [{ label: "Onboarding and offboarding" }, { label: "Plan" }] },
  // Announcements, written by HR
  { segments: ["admin", "announcements", "new"],
    crumbs: [{ label: "Announcements", to: "/announcements" }, { label: "New" }] },
  { segments: ["admin", "announcements", ":", "edit"],
    crumbs: [{ label: "Announcements", to: "/announcements" }, { label: "Edit" }] },
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

/**
 * The trail for a page, rooted at the session's Home. Empty on Home itself
 * and on any address the shell does not know, where a trail would only guess.
 */
export function breadcrumbsFor(pathname: string, homePath: string): Crumb[] {
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length === 0 || pathname === homePath) return [];

  const home: Crumb = { label: "Home", to: homePath };
  const trail = (...crumbs: Crumb[]): Crumb[] => [home, ...crumbs];
  const [scope, ...rest] = segments;

  // The workplace pages belong to every account.
  if (scope === "people") {
    return rest[0] ? trail({ label: "People", to: "/people" }, { label: "Profile" }) : trail({ label: "People" });
  }
  if (scope === "org") return trail({ label: "Org chart" });
  if (scope === "actions") return trail({ label: "Action Center" });
  if (scope === "tasks") return trail({ label: "My tasks" });
  if (scope === "recognition") return trail({ label: "Recognition" });
  if (scope === "goals") return rest[0] ? trail({ label: "Goals", to: "/goals" }, { label: "Goal" }) : trail({ label: "Goals" });
  if (scope === "reviews") return rest[0] ? trail({ label: "Reviews", to: "/reviews" }, { label: "Review" }) : trail({ label: "Reviews" });
  if (scope === "lifecycle") return trail({ label: "My tasks", to: "/tasks" }, { label: "Plan" });
  if (scope === "notifications") return trail({ label: "Notifications" });
  if (scope === "calendar") return trail({ label: "Calendar" });
  if (scope === "announcements") {
    return rest[0] ? trail({ label: "Announcements", to: "/announcements" }, { label: "Announcement" }) : trail({ label: "Announcements" });
  }

  // The team area: its overview is a real page, so it is the linked root.
  if (scope === "team") {
    const leaf = rest[0] ? TEAM[rest[0]] : undefined;
    return leaf ? trail({ label: "My team", to: "/team" }, { label: leaf }) : trail({ label: "My team" });
  }

  // An HR record hangs off the shared profile it belongs to, so the trail
  // reads People > Profile > HR record, and never names the separate
  // Employees directory that People replaced.
  if (scope === "admin" && rest[0] === "employees") {
    const people: Crumb = { label: "People", to: "/people" };
    if (rest.length === 2 && rest[1] === "new") return trail(people, { label: "Add employee" });
    const [, id, leaf] = rest;
    if (id && /^\d+$/.test(id) && (rest.length === 2 || (rest.length === 3 && leaf === "edit"))) {
      return trail(people, { label: "Profile", to: `/people/${id}` }, { label: leaf === "edit" ? "Edit" : "HR record" });
    }
    return [];
  }

  if (scope !== "admin" && scope !== "employee") return [];
  if (rest[0] === "dashboard") return [];

  const pattern = patterns.find((candidate) => matches(candidate, segments));
  if (pattern) return trail(...pattern.crumbs);

  const labels = scope === "admin" ? ADMIN : EMPLOYEE;
  const leaf = rest[0] ? labels[rest[0]] : undefined;
  return leaf ? trail({ label: leaf }) : [];
}
