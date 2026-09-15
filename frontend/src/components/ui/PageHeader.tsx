import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { useBreadcrumbs } from "../../hooks/useBreadcrumbs";
import type { NavigationArea } from "../../routes/navigation";
import { cn } from "../../utils/cn";
import AreaNav from "../layout/AreaNav";
import Breadcrumbs from "./Breadcrumbs";

interface PageHeaderProps {
  title: string;
  description?: string;
  /**
   * Back link above the title, shown BELOW md only.
   *
   * From md up the trail above the title carries a crumb that goes to exactly
   * this destination, so rendering both stacks two controls that do the same
   * thing one row apart. Below md there is no trail, so this is the only way
   * back and has to stay.
   */
  backTo?: string;
  backLabel?: string;
  actions?: ReactNode;
  /** Shows the area's own pages as tabs under the title - see AreaNav. */
  area?: NavigationArea;
  className?: string;
}

/**
 * A page's title block, with the breadcrumb trail above it from md up.
 *
 * The trail lives here rather than in the shell so it sits inside the page's
 * own content width: pages are as narrow as a form or as wide as a table, and
 * a trail pinned to the shell's edge would not line up with either.
 */
export default function PageHeader({
  title,
  description,
  backTo,
  backLabel = "Back",
  actions,
  area,
  className,
}: PageHeaderProps) {
  const crumbs = useBreadcrumbs();

  return (
    <header className={cn("mb-6", className)}>
      {crumbs.length > 1 && <Breadcrumbs items={crumbs} className="mb-3 hidden md:block" />}

      {backTo && (
        <Link
          to={backTo}
          className="mb-2 inline-flex min-h-6 items-center gap-1.5 rounded text-sm font-medium text-fg-muted transition-colors hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring md:hidden"
        >
          <ArrowLeft size={16} aria-hidden="true" />
          {backLabel}
        </Link>
      )}

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight text-fg sm:text-[1.75rem] sm:leading-9">{title}</h1>
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

      {area && <AreaNav area={area} />}
    </header>
  );
}
