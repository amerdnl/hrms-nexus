import type { ReactNode } from "react";
import { cn } from "../../utils/cn";
import type { StatusTone } from "../../utils/status";
import ProgressBar from "./ProgressBar";

export interface BarListItem {
  key: string;
  label: ReactNode;
  /** Numeric magnitude, used only for the bar's length. */
  value: number;
  /** What is printed. Defaults to the value; pass formatted money here. */
  display?: ReactNode;
  /** Secondary line under the label, e.g. "10 active". */
  hint?: ReactNode;
  tone?: StatusTone;
}

interface BarListProps {
  items: BarListItem[];
  /** Screen-reader name for the list as a whole. */
  title: string;
  /** Length of a full bar. Defaults to the largest item, so the leader fills. */
  max?: number;
  className?: string;
}

/**
 * Ranked horizontal bars with the figure printed beside each one.
 *
 * The bars are decoration and aria-hidden; every figure is real text in the
 * list, so the chart is fully readable without seeing length or colour. Each
 * bar is scaled to the largest item by default rather than to a total, because
 * the question these answer is "which is biggest", not "what share".
 */
export default function BarList({ items, title, max, className }: BarListProps) {
  const scale = max ?? Math.max(0, ...items.map((item) => item.value));

  return (
    <ul aria-label={title} className={cn("space-y-4", className)}>
      {items.map((item) => (
        <li key={item.key}>
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0">
              <span className="block truncate font-medium text-fg">{item.label}</span>
              {item.hint && (
                <span className="block truncate text-xs text-fg-subtle">{item.hint}</span>
              )}
            </span>
            <span className="shrink-0 font-semibold tabular-nums text-fg">
              {item.display ?? item.value}
            </span>
          </div>
          <ProgressBar
            className="mt-2"
            size="sm"
            tone={item.tone ?? "primary"}
            value={item.value}
            max={scale > 0 ? scale : 1}
            label=""
            isDecorative
          />
        </li>
      ))}
    </ul>
  );
}
