import type { LucideIcon } from "lucide-react";
import { Link } from "react-router-dom";
import type { ActionItem } from "../../types/workplace";
import { cn } from "../../utils/cn";
import { formatDate } from "../../utils/datetime";
import EmptyState from "../ui/EmptyState";
import StatusBadge from "../ui/StatusBadge";
import { actionIcons } from "./workplaceIcons";

/** "Today", "Tomorrow", or the date - relative to the company's today, not the browser's. */
function whenLabel(date: string | null, today: string): string | null {
  if (!date) return null;
  if (date === today) return "Today";
  const tomorrow = new Date(`${today}T00:00:00Z`);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  if (date === tomorrow.toISOString().slice(0, 10)) return "Tomorrow";
  return formatDate(date);
}

export default function ActionList({ items, today, emptyTitle, emptyDescription, emptyIcon }: {
  items: ActionItem[];
  today: string;
  emptyTitle: string;
  emptyDescription?: string;
  emptyIcon: LucideIcon;
}) {
  if (items.length === 0) {
    return <EmptyState icon={emptyIcon} title={emptyTitle} description={emptyDescription} className="py-8" />;
  }
  return (
    <ul className="-mx-2 divide-y divide-line">
      {items.map((item) => {
        const Icon = actionIcons[item.kind];
        const when = whenLabel(item.date, today);
        return (
          <li key={item.id}>
            <Link
              to={item.link}
              className="flex items-start gap-3 rounded-lg px-2 py-3 transition-colors hover:bg-surface-muted focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
            >
              <span
                className={cn(
                  "mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full",
                  item.important ? "bg-warning-soft text-warning-fg" : "bg-surface-muted text-fg-muted",
                )}
              >
                <Icon size={16} aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-fg [overflow-wrap:anywhere]">{item.title}</span>
                {item.detail && <span className="mt-0.5 block text-xs text-fg-muted [overflow-wrap:anywhere]">{item.detail}</span>}
              </span>
              <span className="flex shrink-0 flex-col items-end gap-1">
                {item.important && <StatusBadge label="Important" tone="warning" />}
                {when && <span className="text-xs font-medium text-fg-subtle">{when}</span>}
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
