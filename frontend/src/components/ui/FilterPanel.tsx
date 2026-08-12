import { SlidersHorizontal } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "../../utils/cn";
import Button from "./Button";

interface FilterPanelProps {
  children: ReactNode;
  columns?: 2 | 3 | 4;
  /**
   * Omit for live filtering. Supplied when filters are committed explicitly,
   * which the admin attendance page needs so an unbounded query does not fire
   * on every keystroke.
   */
  onApply?: () => void;
  onClear?: () => void;
  isBusy?: boolean;
  /** Count of filters currently in effect, surfaced as a badge. */
  activeCount?: number;
  title?: string;
  className?: string;
}

const columnStyles: Record<2 | 3 | 4, string> = {
  2: "sm:grid-cols-2",
  3: "sm:grid-cols-2 lg:grid-cols-3",
  4: "sm:grid-cols-2 lg:grid-cols-4",
};

export default function FilterPanel({
  children,
  columns = 3,
  onApply,
  onClear,
  isBusy = false,
  activeCount = 0,
  title = "Filters",
  className,
}: FilterPanelProps) {
  return (
    <section
      aria-label={title}
      className={cn(
        "rounded-card border border-line bg-surface p-5 shadow-card",
        className,
      )}
    >
      <div className="mb-4 flex items-center gap-2">
        <SlidersHorizontal size={16} className="text-primary" aria-hidden="true" />
        <h2 className="text-sm font-semibold text-fg">{title}</h2>

        {activeCount > 0 && (
          <span className="rounded-full bg-primary-soft px-2 py-0.5 text-xs font-semibold text-primary">
            {activeCount} active
          </span>
        )}
      </div>

      <div className={cn("grid gap-4", columnStyles[columns])}>{children}</div>

      {(onApply || onClear) && (
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          {onClear && (
            <Button variant="ghost" size="sm" onClick={onClear} disabled={isBusy}>
              Clear
            </Button>
          )}
          {onApply && (
            <Button size="sm" onClick={onApply} isLoading={isBusy}>
              Apply filters
            </Button>
          )}
        </div>
      )}
    </section>
  );
}
