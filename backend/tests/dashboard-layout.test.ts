import assert from "node:assert/strict";
import { test } from "node:test";
import {
  dashboardWidgetCatalog,
  hasCapability,
  MAX_LAYOUT_ITEMS,
  sanitizeStoredLayout,
  validateLayout,
  type LayoutSubject,
} from "../src/utils/dashboardLayout.js";

const employee: LayoutSubject = { role: "employee", isManager: false, employeeId: 10 };
const manager: LayoutSubject = { role: "employee", isManager: true, employeeId: 11 };
const admin: LayoutSubject = { role: "admin", isManager: false, employeeId: null };

const widget = (id: string, size = "medium") => ({ kind: "widget", widget: id, size });

test("every catalog widget has at least one size and a known capability", () => {
  for (const [id, entry] of Object.entries(dashboardWidgetCatalog)) {
    assert.ok(entry.sizes.length > 0, id);
    assert.ok(["any", "employee", "manager", "admin"].includes(entry.requires), id);
  }
});

test("capabilities follow the guards on the endpoints each widget reads", () => {
  assert.equal(hasCapability(employee, "any"), true);
  assert.equal(hasCapability(employee, "employee"), true);
  assert.equal(hasCapability(employee, "manager"), false);
  assert.equal(hasCapability(employee, "admin"), false);
  assert.equal(hasCapability(manager, "manager"), true);
  assert.equal(hasCapability(admin, "admin"), true);
  assert.equal(hasCapability(admin, "employee"), false, "HR's Home has no self-service widgets");
  assert.equal(hasCapability({ role: "employee", isManager: true, employeeId: null }, "manager"), false);
  assert.equal(hasCapability({ role: "auditor", isManager: false, employeeId: null }, "any"), false);
});

test("a valid layout is accepted and rebuilt from known fields only", () => {
  const result = validateLayout({
    version: 1,
    extra: "dropped",
    items: [
      { ...widget("my-attendance", "small"), colour: "red" },
      { kind: "stack", id: "stack-abc123", size: "medium", widgets: ["action-center", "my-tasks"], smart: true, note: "x" },
    ],
  }, employee);
  assert.equal(result.ok, true);
  assert.deepEqual(result.ok && result.layout, {
    version: 1,
    items: [
      { kind: "widget", widget: "my-attendance", size: "small" },
      { kind: "stack", id: "stack-abc123", size: "medium", widgets: ["action-center", "my-tasks"], smart: true },
    ],
  });
});

test("a widget the account may not use is refused with 403, whatever else is right", () => {
  const cases: Array<[LayoutSubject, string, string]> = [
    [employee, "headcount", "small"],
    [employee, "team-today", "medium"],
    [manager, "insights", "medium"],
    [admin, "my-attendance", "small"],
    [admin, "team-leave", "small"],
  ];
  for (const [subject, id, size] of cases) {
    const result = validateLayout({ version: 1, items: [widget(id, size)] }, subject);
    assert.equal(result.ok, false, id);
    assert.equal(!result.ok && result.status, 403, id);
    assert.equal(!result.ok && result.code, "widget_not_allowed", id);
  }
  // Inside a stack too.
  const stacked = validateLayout({
    version: 1,
    items: [{ kind: "stack", id: "stack-abcd", size: "medium", widgets: ["company-updates", "team-today"], smart: false }],
  }, employee);
  assert.equal(!stacked.ok && stacked.code, "widget_not_allowed");
});

test("malformed layouts are refused with a reason", () => {
  const refused: Array<[unknown, string]> = [
    [null, "invalid_layout"],
    [[], "invalid_layout"],
    [{ version: 2, items: [] }, "unsupported_version"],
    [{ version: 1 }, "invalid_layout"],
    [{ version: 1, items: [widget("not-a-widget")] }, "unknown_widget"],
    [{ version: 1, items: [widget("my-payslip", "large")] }, "unsupported_size"],
    [{ version: 1, items: [widget("today", "huge")] }, "invalid_size"],
    [{ version: 1, items: [widget("today"), widget("today")] }, "duplicate_widget"],
    [{ version: 1, items: [widget("today"), { kind: "stack", id: "stack-abcd", size: "medium", widgets: ["today", "my-tasks"], smart: false }] }, "duplicate_widget"],
    [{ version: 1, items: [{ kind: "stack", id: "stack-abcd", size: "medium", widgets: ["today"], smart: false }] }, "invalid_stack"],
    [{ version: 1, items: [{ kind: "stack", id: "Stack One", size: "medium", widgets: ["today", "my-tasks"], smart: false }] }, "invalid_stack"],
    [{ version: 1, items: [{ kind: "stack", id: "stack-abcd", size: "medium", widgets: ["today", "my-tasks"], smart: "yes" }] }, "invalid_stack"],
    [{ version: 1, items: [{ kind: "stack", id: "stack-abcd", size: "small", widgets: ["action-center", "my-tasks"], smart: false }] }, "unsupported_size"],
    [{ version: 1, items: [{ kind: "group", size: "small" }] }, "invalid_item"],
    [{ version: 1, items: Array.from({ length: MAX_LAYOUT_ITEMS + 1 }, () => widget("today")) }, "too_many_items"],
  ];
  for (const [input, code] of refused) {
    const result = validateLayout(input, employee);
    assert.equal(result.ok, false, JSON.stringify(input));
    assert.equal(!result.ok && result.code, code, JSON.stringify(input));
  }
});

test("an empty layout is a valid choice", () => {
  assert.deepEqual(validateLayout({ version: 1, items: [] }, employee), { ok: true, layout: { version: 1, items: [] } });
});

test("a stored layout is filtered to what the account may use today", () => {
  const stored = {
    version: 1,
    items: [
      widget("team-leave", "small"),
      { kind: "stack", id: "stack-team01", size: "medium", widgets: ["team-today", "company-updates"], smart: true },
      widget("not-a-widget"),
      widget("my-payslip", "large"),
      { kind: "stack", id: "stack-team02", size: "medium", widgets: ["team-reviews", "my-goals", "recognition"], smart: false },
    ],
  };
  // The same person after their last report moved elsewhere.
  assert.deepEqual(sanitizeStoredLayout(stored, employee), {
    version: 1,
    items: [
      { kind: "widget", widget: "company-updates", size: "medium" },
      { kind: "stack", id: "stack-team02", size: "medium", widgets: ["my-goals", "recognition"], smart: false },
    ],
  });
  assert.equal(sanitizeStoredLayout({ version: 3, items: [] }, employee), null);
  assert.equal(sanitizeStoredLayout("nonsense", employee), null);
});
