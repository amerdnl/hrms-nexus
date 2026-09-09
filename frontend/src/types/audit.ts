export interface AuditEvent {
  id: string;
  occurred_at: string;
  actor_user_id: number | null;
  actor_label: string;
  actor_role: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  summary: string;
  changes: Record<string, unknown> | null;
  outcome: "success" | "failure";
}

export interface AuditPage {
  events: AuditEvent[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  actions: string[];
  entityTypes: string[];
}

/** "PAYROLL_STATE_CHANGED" reads as "Payroll state changed". */
export function readableAction(action: string): string {
  const words = action.toLowerCase().replaceAll("_", " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * Renders one field's before/after pair.
 *
 * A change set is arbitrary JSON, so this deliberately handles both shapes the
 * log produces: {field: {before, after}} for an edit, and {field: value} for a
 * creation where there was no previous value.
 */
export function describeChange(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "object" && value !== null && "after" in value) {
    const pair = value as { before?: unknown; after?: unknown };
    return `${formatScalar(pair.before)} → ${formatScalar(pair.after)}`;
  }
  return formatScalar(value);
}

function formatScalar(value: unknown): string {
  if (value === null || value === undefined) return "empty";
  if (typeof value === "boolean") return value ? "yes" : "no";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}
