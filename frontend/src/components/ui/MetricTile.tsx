import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "../../utils/cn";
import type { StatusTone } from "../../utils/status";

interface MetricTileProps {
  label: string;
  value: ReactNode;
  icon?: LucideIcon;
  tone?: StatusTone;
  /** Secondary line under the value, e.g. "18% of 60". */
  hint?: ReactNode;
  /** Rendered under the value, e.g. a ProgressBar. */
  footer?: ReactNode;
  /** Larger value for the one figure a panel is really about, e.g. net pay. */
  emphasis?: boolean;
  className?: string;
}

const toneStyles: Record<StatusTone, string> = {
  success: "bg-success-soft text-success-fg",
  warning: "bg-warning-soft text-warning-fg",
  danger: "bg-danger-soft text-danger-fg",
  info: "bg-info-soft text-info-fg",
  primary: "bg-primary-soft text-primary",
  neutral: "bg-surface text-fg-muted",
};

/**
 * A metric INSIDE a card, as opposed to StatCard, which IS a card.
 *
 * The distinction matters for hierarchy. A row of StatCards says "these are
 * the headline numbers of this page"; a panel of MetricTiles says "these are
 * the facts about the thing this card describes" - a payroll period's totals,
 * one day's attendance. Using StatCard for both is how every page ends up as
 * the same stat row over the same table.
 */
export default function MetricTile({
  label,
  value,
  icon: Icon,
  tone = "neutral",
  hint,
  footer,
  emphasis = false,
  className,
}: MetricTileProps) {
  return (
    <div className={cn("rounded-xl bg-surface-muted p-4", className)}>
      <div className="flex items-center gap-2.5">
        {Icon && (
          <span
            className={cn(
              "grid h-8 w-8 shrink-0 place-items-center rounded-lg",
              toneStyles[tone],
            )}
            aria-hidden="true"
          >
            <Icon size={16} />
          </span>
        )}
        <p className="min-w-0 truncate text-xs font-medium uppercase tracking-wide text-fg-muted">
          {label}
        </p>
      </div>

      <p
        className={cn(
          "mt-3 font-bold tracking-tight text-fg tabular-nums",
          // One step smaller below sm, where tiles run two to a row on a
          // phone and a six-figure amount has about 130px to fit in.
          emphasis ? "text-2xl sm:text-3xl" : "text-xl sm:text-2xl",
        )}
      >
        {value}
      </p>

      {hint && <p className="mt-1 text-xs text-fg-subtle">{hint}</p>}
      {footer && <div className="mt-3">{footer}</div>}
    </div>
  );
}
