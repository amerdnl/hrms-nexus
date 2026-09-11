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
  /** Secondary line, e.g. a percentage or "of 128 employees". */
  hint?: string;
  /**
   * Puts the icon beside the label instead of opposite it, which reads better
   * in a narrow tile and is what the references show on the dashboard.
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

export default function StatCard({
  label,
  value,
  icon: Icon,
  tone = "neutral",
  hint,
  iconPlacement = "trailing",
  footer,
  to,
  isLoading = false,
  className,
}: StatCardProps) {
  const iconTile = Icon && (
    <span
      className={cn(
        "grid h-9 w-9 shrink-0 place-items-center rounded-lg",
        toneStyles[tone],
      )}
      aria-hidden="true"
    >
      <Icon size={18} />
    </span>
  );

  const content = (
    <>
      <div
        className={cn(
          "flex items-start gap-3",
          iconPlacement === "leading" ? "justify-start" : "justify-between",
        )}
      >
        {iconPlacement === "leading" && iconTile}
        <p className="min-w-0 text-sm font-medium text-fg-muted">{label}</p>
        {iconPlacement === "trailing" && iconTile}
      </div>

      <p className="mt-3 text-2xl font-bold tracking-tight text-fg sm:text-3xl">
        {/* An em dash rather than a spinner: these sit in grids of 4-5 cards,
            and spinners in every tile read as an error state. */}
        {isLoading ? <span className="text-fg-subtle">&mdash;</span> : value}
      </p>

      {hint && !isLoading && (
        <p className="mt-1 text-xs text-fg-subtle">{hint}</p>
      )}

      {footer && !isLoading && <div className="mt-3">{footer}</div>}
    </>
  );

  const shared = cn(
    // p-4 below sm, where the dashboard sets these two-up on a phone.
    "block rounded-card border border-line bg-surface p-4 shadow-card sm:p-5",
    className,
  );

  if (to) {
    return (
      <Link
        to={to}
        className={cn(
          shared,
          "transition-colors hover:border-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        )}
      >
        {content}
      </Link>
    );
  }

  return <div className={shared}>{content}</div>;
}
