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
  /** Accepted for existing callers; the icon always leads. */
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
 * A headline figure on an operational page (Team overview, a review cycle),
 * in the same language as Home's KPI row: a rounded tinted tile, the label
 * above the figure and a fact beneath - so a manager moving from Home to their
 * team reads one card design, not two.
 *
 * Sized by its own width (@container): in a card narrower than 14rem - two
 * across on a phone, or five across on a laptop - the tile stacks above the
 * text, so labels are never broken and every figure in a row lines up.
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
      <div className="flex flex-col gap-3 @min-[14rem]:flex-row @min-[14rem]:items-start @min-[14rem]:gap-3.5">
        {Icon && (
          <span className={cn("grid size-10 shrink-0 place-items-center rounded-xl", toneStyles[tone])} aria-hidden="true">
            <Icon size={18} strokeWidth={2.2} />
          </span>
        )}
        <div className="min-w-0">
          <p className="text-[0.8125rem] leading-5 text-fg-muted">{label}</p>
          <p className="mt-1 text-2xl font-semibold leading-8 tracking-tight text-fg tabular-nums">
            {/* An em dash rather than a spinner: these sit in rows of four or
                five, and spinners in every card read as an error state. */}
            {isLoading ? <span className="text-fg-subtle">&mdash;</span> : value}
          </p>
          {hint && !isLoading && <p className="mt-1 text-[0.8125rem] leading-5 text-fg-subtle">{hint}</p>}
        </div>
      </div>
      {footer && !isLoading && <div className="mt-3">{footer}</div>}
    </div>
  );

  const shared = cn("block rounded-card border border-line bg-surface p-4 shadow-card sm:p-5", className);

  if (to) {
    return (
      <Link
        to={to}
        className={cn(shared, "transition-shadow hover:shadow-raised focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring")}
      >
        {content}
      </Link>
    );
  }

  return <div className={shared}>{content}</div>;
}
