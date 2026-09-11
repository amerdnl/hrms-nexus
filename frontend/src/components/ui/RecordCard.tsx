import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { cn } from "../../utils/cn";

interface RecordCardProps {
  /** Usually an Avatar or a tinted icon tile. */
  leading?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  /** Short label/value pairs shown under the title. */
  meta?: Array<{ label: string; value: ReactNode }>;
  /** Usually a StatusBadge. */
  badge?: ReactNode;
  /** Turns the whole card into a navigation target and shows a chevron. */
  to?: string;
  /** Row actions, e.g. a DropdownMenu. Rendered outside the link target. */
  actions?: ReactNode;
  className?: string;
}

/**
 * One record as a card, for the sub-md half of DataTable.
 *
 * The card and the table row are the same data taking different shapes, so
 * this deliberately holds fewer fields than a row: a title, a subtitle, a
 * badge and at most a few meta pairs. A card that reproduces every column is
 * just a narrow table.
 *
 * `to` and `actions` do not nest. An anchor wrapping a button is invalid and
 * makes the button unreachable by keyboard, so the link covers the card via a
 * stretched overlay and the actions sit above it in the stacking order.
 */
export default function RecordCard({
  leading,
  title,
  subtitle,
  meta,
  badge,
  to,
  actions,
  className,
}: RecordCardProps) {
  return (
    <li className={cn("relative flex items-start gap-3 px-4 py-4", className)}>
      {leading && <div className="shrink-0">{leading}</div>}

      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            {/* Wrapped, never truncated, like the meta below: a phone is where
                the table's full column width is not available, so clipping
                here is exactly where a long name or title would be lost. */}
            <p className="text-sm font-semibold text-fg [overflow-wrap:anywhere]">
              {to ? (
                <Link
                  to={to}
                  // The overlay is what makes the whole card tappable while
                  // keeping ONE link in the accessibility tree and the tab
                  // order, named by the title text.
                  className="after:absolute after:inset-0 after:content-[''] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                >
                  {title}
                </Link>
              ) : (
                title
              )}
            </p>

            {subtitle && (
              <p className="mt-0.5 text-xs text-fg-subtle [overflow-wrap:anywhere]">{subtitle}</p>
            )}
          </div>

          {badge && <div className="shrink-0">{badge}</div>}
        </div>

        {meta && meta.length > 0 && (
          <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1">
            {meta.map((entry) => (
              <div key={entry.label} className="min-w-0">
                <dt className="truncate text-[11px] uppercase tracking-wide text-fg-subtle">
                  {entry.label}
                </dt>
                <dd className="text-xs font-medium text-fg-muted [overflow-wrap:anywhere]">
                  {entry.value}
                </dd>
              </div>
            ))}
          </dl>
        )}
      </div>

      {/* z-10 lifts these above the stretched link overlay; without it the
          overlay swallows every tap meant for a menu. */}
      {actions ? (
        <div className="relative z-10 shrink-0">{actions}</div>
      ) : (
        to && (
          <ChevronRight
            size={18}
            className="mt-0.5 shrink-0 text-fg-subtle"
            aria-hidden="true"
          />
        )
      )}
    </li>
  );
}
