import { ChevronRight } from "lucide-react";
import { Fragment } from "react";
import { Link } from "react-router-dom";
import { cn } from "../../utils/cn";

export interface Crumb {
  label: string;
  /** Omitted on the final crumb, which is the current page. */
  to?: string;
}

/**
 * The trail shown in the app header.
 *
 * The last crumb is deliberately not a link and carries aria-current="page":
 * a link to where you already are is a dead control, and the references show
 * it as plain text too. The separators are aria-hidden so the trail reads as
 * "Employees, Nur Aisyah, Edit" rather than interleaved chevrons.
 */
export default function Breadcrumbs({
  items,
  className,
}: {
  items: Crumb[];
  className?: string;
}) {
  if (items.length === 0) return null;

  return (
    <nav aria-label="Breadcrumb" className={cn("min-w-0", className)}>
      <ol className="flex min-w-0 items-center gap-1.5 text-sm">
        {items.map((crumb, index) => {
          const isLast = index === items.length - 1;

          return (
            <Fragment key={`${crumb.label}-${index}`}>
              <li className="min-w-0">
                {crumb.to && !isLast ? (
                  <Link
                    to={crumb.to}
                    className="block truncate rounded text-fg-muted transition-colors hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                  >
                    {crumb.label}
                  </Link>
                ) : (
                  <span
                    aria-current={isLast ? "page" : undefined}
                    className={cn(
                      "block truncate",
                      isLast ? "font-medium text-fg" : "text-fg-muted",
                    )}
                  >
                    {crumb.label}
                  </span>
                )}
              </li>

              {!isLast && (
                <li aria-hidden="true" className="shrink-0 text-fg-subtle">
                  <ChevronRight size={14} />
                </li>
              )}
            </Fragment>
          );
        })}
      </ol>
    </nav>
  );
}
