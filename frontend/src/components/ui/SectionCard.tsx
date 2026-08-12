import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "../../utils/cn";

interface SectionCardProps {
  title?: string;
  description?: string;
  icon?: LucideIcon;
  actions?: ReactNode;
  /**
   * Set false when the card holds a full-bleed child such as a table, so the
   * child can manage its own edges.
   */
  padded?: boolean;
  className?: string;
  bodyClassName?: string;
  children: ReactNode;
}

export default function SectionCard({
  title,
  description,
  icon: Icon,
  actions,
  padded = true,
  className,
  bodyClassName,
  children,
}: SectionCardProps) {
  const hasHeader = Boolean(title || actions);

  return (
    <section
      className={cn(
        "rounded-card border border-line bg-surface shadow-card",
        className,
      )}
    >
      {hasHeader && (
        <div
          className={cn(
            "flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-4",
            !padded && "px-5",
          )}
        >
          <div className="min-w-0">
            {title && (
              <h2 className="flex items-center gap-2 text-base font-semibold text-fg">
                {Icon && (
                  <Icon size={18} className="text-primary" aria-hidden="true" />
                )}
                {title}
              </h2>
            )}
            {description && (
              <p className="mt-1 text-sm text-fg-muted">{description}</p>
            )}
          </div>

          {actions && (
            <div className="flex shrink-0 items-center gap-2">{actions}</div>
          )}
        </div>
      )}

      <div className={cn(padded && "p-5", bodyClassName)}>{children}</div>
    </section>
  );
}
