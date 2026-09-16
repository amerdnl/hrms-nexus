/**
 * Home dashboard layouts: what an account may save, checked against what it may
 * use right now.
 *
 * The catalog mirrors `frontend/src/components/dashboard/widgetCatalog.ts` - the
 * same ids, sizes and required capability. The frontend decides what to offer;
 * this decides what may be stored, so a hand-made request cannot place a widget
 * its account could not have added. Neither is what protects the data: every
 * widget reads endpoints that authorise themselves.
 *
 * A layout carries no permission. It is re-checked on every save and filtered
 * on every read, so a manager who no longer has reports simply stops seeing
 * their team widgets, and the stored row is never trusted as a grant.
 */

export type WidgetSize = "small" | "medium" | "large";
export type WidgetCapability = "any" | "employee" | "manager" | "admin";

export interface LayoutSubject {
  role: string;
  isManager: boolean;
  employeeId: number | null;
}

export const dashboardWidgetCatalog = {
  "action-center": { sizes: ["small", "medium", "large"], requires: "any" },
  "my-tasks": { sizes: ["medium"], requires: "any" },
  today: { sizes: ["medium", "large"], requires: "any" },
  "whos-out": { sizes: ["medium", "large"], requires: "any" },
  "company-updates": { sizes: ["medium"], requires: "any" },
  "my-attendance": { sizes: ["small", "medium"], requires: "employee" },
  "leave-balance": { sizes: ["small", "medium"], requires: "employee" },
  "my-payslip": { sizes: ["small"], requires: "employee" },
  "my-goals": { sizes: ["small", "medium"], requires: "employee" },
  recognition: { sizes: ["medium"], requires: "employee" },
  "team-today": { sizes: ["medium"], requires: "manager" },
  "team-leave": { sizes: ["small", "medium"], requires: "manager" },
  "team-reviews": { sizes: ["small", "medium"], requires: "manager" },
  headcount: { sizes: ["small"], requires: "admin" },
  "on-leave-today": { sizes: ["small"], requires: "admin" },
  "late-today": { sizes: ["small"], requires: "admin" },
  "pending-leave": { sizes: ["small"], requires: "admin" },
  "attendance-today": { sizes: ["medium"], requires: "admin" },
  "payroll-status": { sizes: ["small", "medium"], requires: "admin" },
  lifecycle: { sizes: ["small", "medium"], requires: "admin" },
  "recent-activity": { sizes: ["medium"], requires: "admin" },
  "recent-employees": { sizes: ["medium"], requires: "admin" },
  insights: { sizes: ["medium"], requires: "admin" },
} as const satisfies Record<string, { sizes: readonly WidgetSize[]; requires: WidgetCapability }>;

export type WidgetId = keyof typeof dashboardWidgetCatalog;

export const LAYOUT_VERSION = 1;
export const MAX_LAYOUT_ITEMS = 16;
export const MIN_STACK_WIDGETS = 2;
export const MAX_STACK_WIDGETS = 6;
const STACK_ID = /^stack-[a-z0-9]{4,24}$/;
const SIZES: readonly WidgetSize[] = ["small", "medium", "large"];

export interface WidgetItem { kind: "widget"; widget: WidgetId; size: WidgetSize }
export interface StackItem { kind: "stack"; id: string; size: WidgetSize; widgets: WidgetId[]; smart: boolean }
export type LayoutItem = WidgetItem | StackItem;
export interface DashboardLayout { version: typeof LAYOUT_VERSION; items: LayoutItem[] }

/** The capability behind each widget, matching the guard on the endpoints it reads. */
export function hasCapability(subject: LayoutSubject, capability: WidgetCapability): boolean {
  switch (capability) {
    case "any":
      return subject.role === "admin" || subject.role === "employee";
    case "employee":
      return subject.role === "employee" && subject.employeeId !== null;
    case "manager":
      return subject.role === "employee" && subject.employeeId !== null && subject.isManager;
    case "admin":
      return subject.role === "admin";
  }
}

export function isWidgetId(value: unknown): value is WidgetId {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(dashboardWidgetCatalog, value);
}

function isSize(value: unknown): value is WidgetSize {
  return typeof value === "string" && (SIZES as readonly string[]).includes(value);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function fits(id: WidgetId, size: WidgetSize): boolean {
  return (dashboardWidgetCatalog[id].sizes as readonly WidgetSize[]).includes(size);
}

export type LayoutValidation =
  | { ok: true; layout: DashboardLayout }
  | { ok: false; status: 400 | 403; code: string; message: string };

/**
 * Checks a layout an account wants to save and returns it rebuilt from known
 * fields only, so nothing unrecognised is ever stored.
 */
export function validateLayout(input: unknown, subject: LayoutSubject): LayoutValidation {
  const fail = (code: string, message: string, status: 400 | 403 = 400): LayoutValidation =>
    ({ ok: false, status, code, message });

  if (!isObject(input)) return fail("invalid_layout", "Send the layout as an object.");
  if (input.version !== LAYOUT_VERSION) return fail("unsupported_version", "This layout version is not supported.");
  if (!Array.isArray(input.items)) return fail("invalid_layout", "A layout lists its items.");
  if (input.items.length > MAX_LAYOUT_ITEMS) {
    return fail("too_many_items", `Home holds at most ${MAX_LAYOUT_ITEMS} widgets and stacks.`);
  }

  const seenWidgets = new Set<string>();
  const seenStacks = new Set<string>();
  const items: LayoutItem[] = [];

  for (const [index, raw] of input.items.entries()) {
    const position = `Item ${index + 1}`;
    if (!isObject(raw)) return fail("invalid_item", `${position} is not a widget or a stack.`);
    if (!isSize(raw.size)) return fail("invalid_size", `${position} has no valid size.`);
    const size = raw.size;

    const accept = (id: unknown): LayoutValidation | WidgetId => {
      if (!isWidgetId(id)) return fail("unknown_widget", `${position} names a widget that does not exist.`);
      if (!hasCapability(subject, dashboardWidgetCatalog[id].requires)) {
        return fail("widget_not_allowed", `The ${id} widget is not available to this account.`, 403);
      }
      if (!fits(id, size)) return fail("unsupported_size", `The ${id} widget does not come in ${size}.`);
      if (seenWidgets.has(id)) return fail("duplicate_widget", `The ${id} widget appears more than once.`);
      seenWidgets.add(id);
      return id;
    };

    if (raw.kind === "widget") {
      const accepted = accept(raw.widget);
      if (typeof accepted !== "string") return accepted;
      items.push({ kind: "widget", widget: accepted, size });
      continue;
    }

    if (raw.kind === "stack") {
      if (typeof raw.id !== "string" || !STACK_ID.test(raw.id) || seenStacks.has(raw.id)) {
        return fail("invalid_stack", `${position} is a stack without a valid, unique id.`);
      }
      seenStacks.add(raw.id);
      if (!Array.isArray(raw.widgets) || raw.widgets.length < MIN_STACK_WIDGETS || raw.widgets.length > MAX_STACK_WIDGETS) {
        return fail("invalid_stack", `A stack holds ${MIN_STACK_WIDGETS} to ${MAX_STACK_WIDGETS} widgets.`);
      }
      if (typeof raw.smart !== "boolean") return fail("invalid_stack", "A stack's smart ordering is either on or off.");
      const widgets: WidgetId[] = [];
      for (const id of raw.widgets) {
        const accepted = accept(id);
        if (typeof accepted !== "string") return accepted;
        widgets.push(accepted);
      }
      items.push({ kind: "stack", id: raw.id, size, widgets, smart: raw.smart });
      continue;
    }

    return fail("invalid_item", `${position} is not a widget or a stack.`);
  }

  return { ok: true, layout: { version: LAYOUT_VERSION, items } };
}

/**
 * A stored layout as the account may see it today. Anything unknown, no longer
 * permitted or no longer the right size is dropped; a stack left with one widget
 * becomes that widget. Returns null when the stored value is not a layout at all,
 * which the client treats as the default Home.
 */
export function sanitizeStoredLayout(stored: unknown, subject: LayoutSubject): DashboardLayout | null {
  if (!isObject(stored) || stored.version !== LAYOUT_VERSION || !Array.isArray(stored.items)) return null;

  const seen = new Set<string>();
  const usable = (id: unknown, size: WidgetSize): id is WidgetId =>
    isWidgetId(id) && !seen.has(id) && hasCapability(subject, dashboardWidgetCatalog[id].requires) && fits(id, size);

  const items: LayoutItem[] = [];
  for (const raw of stored.items.slice(0, MAX_LAYOUT_ITEMS)) {
    if (!isObject(raw) || !isSize(raw.size)) continue;
    const size = raw.size;

    if (raw.kind === "widget") {
      if (usable(raw.widget, size)) {
        seen.add(raw.widget);
        items.push({ kind: "widget", widget: raw.widget, size });
      }
      continue;
    }

    if (raw.kind === "stack" && typeof raw.id === "string" && STACK_ID.test(raw.id) && Array.isArray(raw.widgets)) {
      const widgets: WidgetId[] = [];
      for (const id of raw.widgets) {
        if (widgets.length < MAX_STACK_WIDGETS && usable(id, size)) {
          seen.add(id);
          widgets.push(id);
        }
      }
      if (widgets.length >= MIN_STACK_WIDGETS) {
        items.push({ kind: "stack", id: raw.id, size, widgets, smart: raw.smart === true });
      } else if (widgets.length === 1) {
        items.push({ kind: "widget", widget: widgets[0]!, size });
      }
    }
  }

  return { version: LAYOUT_VERSION, items };
}
