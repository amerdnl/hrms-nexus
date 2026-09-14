import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { cn } from "../../utils/cn";
import type { StatusTone } from "../../utils/status";

interface StatCardProps {
  label: string;
  value: ReactNode;
  icon?: LucideIcon;
  tone?: StatusTone;
  /** Secondary line, e.g. "3 late" or "of 25 employees". Always a real fact. */
  hint?: string;
  /**
   * Accepted for existing callers. The icon now always leads, as the
   * reference's KPI row shows; the prop no longer changes the layout.
   */
  iconPlacement?: "trailing" | "leading";
  /** Rendered under the value, e.g. a ProgressBar. */
  footer?: ReactNode;
  /** Turns the whole card into a navigation target. */
  to?: string;
  isLoading?: boolean;
  className?: string;
}

const toneStyles: Record<StatusTone, string> = {
  success: "bg-success-soft text-success-fg",
  warning: "bg-warning-soft text-warning-fg",
  danger: "bg-danger-soft text-danger-fg",
  info: "bg-info-soft text-info-fg",
  primary: "bg-primary-soft text-primary",
  neutral: "bg-surface-muted text-fg-muted",
};

/**
 * A headline figure, in the language of the reference's KPI row: a soft icon
 * disc leading, the figure, and its label under it.
 *
 * Sized by its own width (@container), not the viewport's, because the same
 * card sits five across on a laptop and two across on a phone: in a narrow
 * card the disc shrinks and the label wraps rather than the figure being cut.
 */
export default function StatCard({
  label,
  value,
  icon: Icon,
  tone = "neutral",
  hint,
  footer,
  to,
  isLoading = false,
  className,
}: StatCardProps) {
  const content = (
    <div className="@container">
      <div className="flex items-center gap-3 @min-[14rem]:gap-4">
        {Icon && (
          <span
            className={cn(
              "grid size-10 shrink-0 place-items-center rounded-full @min-[14rem]:size-12",
              toneStyles[tone],
            )}
            aria-hidden="true"
          >
            <Icon className="size-[18px] @min-[14rem]:size-5" />
          </span>
        )}
        <div className="min-w-0">
          <p className="text-2xl font-semibold leading-tight tracking-tight text-fg tabular-nums">
            {/* An em dash rather than a spinner: these sit in rows of four or
                five, and spinners in every card read as an error state. */}
            {isLoading ? <span className="text-fg-subtle">&mdash;</span> : value}
          </p>
          <p className="mt-0.5 text-sm leading-snug text-fg-muted">{label}</p>
        </div>
      </div>

      {hint && !isLoading && (
        <p className="mt-2 text-xs text-fg-subtle">{hint}</p>
      )}

      {footer && !isLoading && <div className="mt-3">{footer}</div>}
    </div>
  );

  const shared = cn(
    "block rounded-card border border-line bg-surface p-4 shadow-card sm:p-5",
    className,
  );

  if (to) {
    return (
      <Link
        to={to}
        className={cn(
          shared,
          "transition-colors hover:border-line-strong hover:shadow-raised focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        )}
      >
        {content}
      </Link>
    );
  }

  return <div className={shared}>{content}</div>;
}
