import type {
  DashboardItem,
  DashboardLayout,
  StackPlacement,
  WidgetSize,
} from "../../types/dashboardLayout";
import { canUseWidget, widgetById, type DashboardSubject } from "./widgetCatalog";

/*
 * Pure layout operations. Every edit returns a new list, so the editor can
 * compare against where it started, undo by discarding, and never mutate what
 * the server sent.
 */

export const MAX_ITEMS = 16;
export const MAX_STACK_WIDGETS = 6;
const SIZE_ORDER: readonly WidgetSize[] = ["small", "medium", "large"];

const widget = (id: string, size: WidgetSize): DashboardItem => ({ kind: "widget", widget: id, size });

/**
 * Where editing starts for an account that has never customised Home: the
 * default Home's cards, as widgets. Not the default itself - an account with no
 * saved layout keeps the approved page, and Done without changes saves nothing.
 */
export function defaultLayoutFor(subject: DashboardSubject): DashboardLayout {
  if (subject.role === "admin") {
    return {
      version: 1,
      items: [
        widget("headcount", "small"), widget("on-leave-today", "small"), widget("late-today", "small"), widget("pending-leave", "small"),
        widget("today", "medium"), widget("my-tasks", "medium"),
        widget("whos-out", "medium"), widget("recent-activity", "medium"), widget("insights", "medium"),
      ],
    };
  }
  return {
    version: 1,
    items: [
      widget("my-attendance", "small"), widget("leave-balance", "small"), widget("action-center", "small"), widget("my-payslip", "small"),
      widget("today", "medium"), widget(subject.isManager ? "team-today" : "my-tasks", "medium"),
      widget("my-goals", "medium"), widget("company-updates", "medium"), widget(subject.isManager ? "team-leave" : "recognition", "medium"),
    ],
  };
}

/** The client's copy of the server's read filter, so an old or foreign layout never renders a widget this session cannot use. */
export function sanitizeLayout(layout: DashboardLayout, subject: DashboardSubject): DashboardLayout {
  const seen = new Set<string>();
  const usable = (id: string, size: WidgetSize) => {
    const meta = widgetById.get(id);
    return Boolean(meta && !seen.has(id) && canUseWidget(subject, meta) && meta.sizes.includes(size));
  };
  const items: DashboardItem[] = [];
  for (const item of layout.items.slice(0, MAX_ITEMS)) {
    if (item.kind === "widget") {
      if (usable(item.widget, item.size)) {
        seen.add(item.widget);
        items.push(item);
      }
      continue;
    }
    const widgets = item.widgets.filter((id) => {
      if (!usable(id, item.size)) return false;
      seen.add(id);
      return true;
    }).slice(0, MAX_STACK_WIDGETS);
    if (widgets.length >= 2) items.push({ ...item, widgets });
    else if (widgets.length === 1) items.push(widget(widgets[0]!, item.size));
  }
  return { version: 1, items };
}

export function itemKey(item: DashboardItem): string {
  return item.kind === "widget" ? item.widget : item.id;
}

export function widgetsIn(item: DashboardItem): string[] {
  return item.kind === "widget" ? [item.widget] : item.widgets;
}

export function placedWidgets(items: DashboardItem[]): Set<string> {
  return new Set(items.flatMap(widgetsIn));
}

/** Sizes every one of these widgets supports, smallest first. */
export function commonSizes(ids: string[]): WidgetSize[] {
  return SIZE_ORDER.filter((size) => ids.every((id) => widgetById.get(id)?.sizes.includes(size)));
}

export function itemTitle(item: DashboardItem): string {
  if (item.kind === "widget") return widgetById.get(item.widget)?.title ?? item.widget;
  return `Stack: ${item.widgets.map((id) => widgetById.get(id)?.title ?? id).join(", ")}`;
}

export function moveItem(items: DashboardItem[], from: number, to: number): DashboardItem[] {
  if (from === to || from < 0 || from >= items.length) return items;
  const next = [...items];
  const [moved] = next.splice(from, 1);
  next.splice(Math.max(0, Math.min(to, next.length)), 0, moved!);
  return next;
}

export function resizeItem(items: DashboardItem[], index: number, size: WidgetSize): DashboardItem[] {
  const item = items[index];
  if (!item || !commonSizes(widgetsIn(item)).includes(size)) return items;
  return items.map((entry, position) => (position === index ? { ...entry, size } : entry));
}

export function removeItem(items: DashboardItem[], index: number): DashboardItem[] {
  return items.filter((_, position) => position !== index);
}

export function addWidget(items: DashboardItem[], id: string, size: WidgetSize): DashboardItem[] {
  if (items.length >= MAX_ITEMS || placedWidgets(items).has(id)) return items;
  return [...items, widget(id, size)];
}

export function newStackId(): string {
  const random = Math.random().toString(36).slice(2, 10).padEnd(8, "0");
  return `stack-${random}`;
}

/** Standalone widgets that could join the item at `index` without breaking its size. */
export function stackCandidates(items: DashboardItem[], index: number): string[] {
  const target = items[index];
  if (!target || (target.kind === "stack" && target.widgets.length >= MAX_STACK_WIDGETS)) return [];
  return items
    .filter((item, position): item is Extract<DashboardItem, { kind: "widget" }> => position !== index && item.kind === "widget")
    .map((item) => item.widget)
    .filter((id) => commonSizes([...widgetsIn(target), id]).length > 0);
}

/**
 * Moves the standalone widget `otherId` into the item at `index`, making a
 * stack if it was a single widget. The stack keeps the target's size when both
 * support it, and otherwise the nearest size they share.
 */
export function stackWith(items: DashboardItem[], index: number, otherId: string): DashboardItem[] {
  const target = items[index];
  const otherIndex = items.findIndex((item) => item.kind === "widget" && item.widget === otherId);
  if (!target || otherIndex < 0 || otherIndex === index) return items;
  const ids = [...widgetsIn(target), otherId];
  const shared = commonSizes(ids);
  if (shared.length === 0 || ids.length > MAX_STACK_WIDGETS) return items;
  const size = shared.includes(target.size) ? target.size : shared[shared.length - 1]!;
  const stack: StackPlacement = target.kind === "stack"
    ? { ...target, widgets: ids, size }
    : { kind: "stack", id: newStackId(), size, widgets: ids, smart: false };
  return items
    .map((item, position) => (position === index ? stack : item))
    .filter((_, position) => position !== otherIndex);
}

/** Replaces a stack with its widgets, in stack order, at the same place and size. */
export function unstack(items: DashboardItem[], index: number): DashboardItem[] {
  const stack = items[index];
  if (!stack || stack.kind !== "stack") return items;
  return [...items.slice(0, index), ...stack.widgets.map((id) => widget(id, stack.size)), ...items.slice(index + 1)];
}

/** Takes one widget out of a stack and places it right after the stack. */
export function removeFromStack(items: DashboardItem[], index: number, id: string): DashboardItem[] {
  const stack = items[index];
  if (!stack || stack.kind !== "stack" || !stack.widgets.includes(id)) return items;
  const remaining = stack.widgets.filter((entry) => entry !== id);
  const kept: DashboardItem = remaining.length >= 2 ? { ...stack, widgets: remaining } : widget(remaining[0]!, stack.size);
  return [...items.slice(0, index), kept, widget(id, stack.size), ...items.slice(index + 1)];
}

export function moveWithinStack(items: DashboardItem[], index: number, from: number, to: number): DashboardItem[] {
  const stack = items[index];
  if (!stack || stack.kind !== "stack" || to < 0 || to >= stack.widgets.length) return items;
  const widgets = [...stack.widgets];
  const [moved] = widgets.splice(from, 1);
  widgets.splice(to, 0, moved!);
  return items.map((item, position) => (position === index ? { ...stack, widgets } : item));
}

export function setStackSmart(items: DashboardItem[], index: number, smart: boolean): DashboardItem[] {
  return items.map((item, position) => (position === index && item.kind === "stack" ? { ...item, smart } : item));
}

export function layoutsEqual(a: DashboardLayout | null, b: DashboardLayout | null): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
