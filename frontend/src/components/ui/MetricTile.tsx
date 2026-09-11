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
    // @container: the figure is sized by the TILE's width, not the viewport's.
    // The same tile sits four to a row on a laptop, two to a row on a phone and
    // two to a half-card in reports, and a viewport breakpoint cannot know
    // which. Sizing by the viewport is how a six-figure amount spilled out of
    // its tile at 1024px while fitting at 1280.
    <div className={cn("@container rounded-xl bg-surface-muted p-4", className)}>
      {/* Icon above the label in a narrow tile, beside it in a wider one, so
          the icon never takes the width a label needs to be read. */}
      <div className="flex flex-col gap-2 @min-[10rem]:flex-row @min-[10rem]:items-start @min-[10rem]:gap-2.5">
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
        {/* Wraps to two lines rather than truncating: "Employees paid" cut to
            "Employe..." is a label that no longer says what it labels. */}
        <p className="min-w-0 text-xs font-medium leading-snug text-fg-muted line-clamp-2 @min-[10rem]:pt-1.5">
          {label}
        </p>
      </div>

      <p
        className={cn(
          "mt-3 font-bold tracking-tight text-fg tabular-nums",
          // Money is never truncated and never allowed to spill: at the very
          // worst a figure wraps, which is ugly but hides no digit.
          "[overflow-wrap:anywhere]",
          emphasis
            ? "text-lg @min-[11rem]:text-xl @min-[13rem]:text-2xl @min-[16rem]:text-3xl"
            : "text-lg @min-[11rem]:text-xl @min-[13rem]:text-2xl",
        )}
      >
        {value}
      </p>

      {hint && <p className="mt-1 text-xs text-fg-subtle">{hint}</p>}
      {footer && <div className="mt-3">{footer}</div>}
    </div>
  );
}
