import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "../../utils/cn";

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  /** Usually a Button or LinkButton offering the obvious next step. */
  action?: ReactNode;
  className?: string;
}

export default function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center px-6 py-12 text-center",
        className,
      )}
    >
      {Icon && (
        <span
          className="mb-3 grid h-12 w-12 place-items-center rounded-full bg-surface-muted text-fg-subtle"
          aria-hidden="true"
        >
          <Icon size={22} />
        </span>
      )}

      <p className="text-sm font-semibold text-fg">{title}</p>

      {description && (
        <p className="mt-1 max-w-sm text-sm text-fg-muted">{description}</p>
      )}

      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
