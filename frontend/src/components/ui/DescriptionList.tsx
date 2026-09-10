import type { ReactNode } from "react";
import { cn } from "../../utils/cn";

export interface DescriptionEntry {
  label: string;
  value: ReactNode;
  /** Spans the full width, for long values such as an address. */
  wide?: boolean;
}

interface DescriptionListProps {
  items: DescriptionEntry[];
  columns?: 1 | 2 | 3;
  /**
   * What to render for a null/empty value. An em dash by default: it says
   * "recorded as nothing" rather than leaving a gap the reader has to
   * interpret as either empty or broken.
   */
  emptyValue?: ReactNode;
  className?: string;
}

const columnStyles: Record<1 | 2 | 3, string> = {
  1: "",
  2: "sm:grid-cols-2",
  3: "sm:grid-cols-2 lg:grid-cols-3",
};

/**
 * Label-and-value pairs.
 *
 * This markup was duplicated across five files with two independent local
 * `Detail` helpers that had already drifted in type scale. One shape now.
 *
 * A real <dl>/<dt>/<dd>, not a grid of divs: the association between a label
 * and its value is what a screen reader uses to read "Job title, Software
 * engineer" rather than two unrelated strings.
 */
export default function DescriptionList({
  items,
  columns = 2,
  emptyValue = "—",
  className,
}: DescriptionListProps) {
  return (
    <dl className={cn("grid gap-5", columnStyles[columns], className)}>
      {items.map((item) => {
        const isEmpty =
          item.value === null || item.value === undefined || item.value === "";

        return (
          <div key={item.label} className={cn(item.wide && "sm:col-span-full")}>
            <dt className="text-xs font-semibold uppercase tracking-wide text-fg-subtle">
              {item.label}
            </dt>
            <dd
              className={cn(
                "mt-1 text-sm font-medium",
                isEmpty ? "text-fg-subtle" : "text-fg",
              )}
            >
              {isEmpty ? emptyValue : item.value}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}
