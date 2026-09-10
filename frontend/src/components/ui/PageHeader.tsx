import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { cn } from "../../utils/cn";

interface PageHeaderProps {
  title: string;
  description?: string;
  /**
   * Back link above the title, shown BELOW md only.
   *
   * From md up the app header carries a breadcrumb trail whose second-to-last
   * crumb goes to exactly this destination, so rendering both stacks two
   * controls that do the same thing one row apart. Below md the header shows
   * the page's name instead of a trail, so this is the only way back and has
   * to stay.
   */
  backTo?: string;
  backLabel?: string;
  actions?: ReactNode;
  className?: string;
}

export default function PageHeader({
  title,
  description,
  backTo,
  backLabel = "Back",
  actions,
  className,
}: PageHeaderProps) {
  return (
    <header className={cn("mb-6", className)}>
      {backTo && (
        <Link
          to={backTo}
          className="mb-3 inline-flex items-center gap-1.5 rounded text-sm font-medium text-fg-muted transition-colors hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring md:hidden"
        >
          <ArrowLeft size={16} aria-hidden="true" />
          {backLabel}
        </Link>
      )}

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight text-fg">{title}</h1>
          {description && (
            <p className="mt-1 text-sm text-fg-muted">{description}</p>
          )}
        </div>

        {actions && (
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {actions}
          </div>
        )}
      </div>
    </header>
  );
}
