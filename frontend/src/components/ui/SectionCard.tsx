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

/**
 * The card, in the reference's language: white on the canvas, an edge you
 * barely see, a navy title with its icon, and no rule under the header.
 *
 * The rule only returns when the body is full-bleed (`padded={false}`): a
 * table or list running edge to edge needs a line to start from, where
 * padded content already has the space between it and the title.
 */
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
            "flex flex-wrap items-start justify-between gap-x-3 gap-y-2 px-5 pt-4 sm:px-6 sm:pt-5",
            padded ? "pb-1" : "border-b border-line pb-4",
          )}
        >
          <div className="min-w-0">
            {title && (
              <h2 className="flex items-center gap-2.5 text-[0.9375rem] font-semibold text-fg">
                {Icon && (
                  <Icon size={18} className="shrink-0 text-fg" aria-hidden="true" />
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

      <div
        className={cn(
          padded && (hasHeader ? "px-5 pb-5 pt-3 sm:px-6 sm:pb-6" : "p-5 sm:p-6"),
          bodyClassName,
        )}
      >
        {children}
      </div>
    </section>
  );
}
