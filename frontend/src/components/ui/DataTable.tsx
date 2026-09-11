import type { ReactNode } from "react";
import { cn } from "../../utils/cn";
import Skeleton from "./Skeleton";

interface DataTableProps {
  /** Header cells. Length drives the loading/empty row colSpan. */
  headers: ReactNode[];
  children: ReactNode;
  isLoading?: boolean;
  isEmpty?: boolean;
  loadingLabel?: string;
  /** Rendered inside a full-width row when isEmpty. Usually an <EmptyState>. */
  emptyState?: ReactNode;
  /** Forces horizontal scroll rather than cramping columns, e.g. "min-w-200". */
  minWidthClass?: string;
  /** Screen-reader description of the table's contents. */
  caption?: string;
  /**
   * The same records rendered as cards, shown below `md` INSTEAD of the table.
   *
   * Supplied as already-rendered nodes rather than a render prop over a row
   * list, because a row and a card are genuinely different documents: a card
   * promotes two or three fields and drops the rest, which no automatic
   * transform of <td>s can decide. The caller maps its data twice, and the
   * duplication is the point - it is where that editorial choice lives.
   *
   * Omit it and the table keeps its previous behaviour exactly: one scroll
   * region at every width. That is deliberate, so the tables not yet converted
   * are untouched.
   */
  mobileCards?: ReactNode;
  /** How many placeholder rows to draw while loading. */
  skeletonRows?: number;
  /**
   * Drops the table's own card shell - border, radius, shadow - for a table
   * that already sits inside a card. Without it the two borders stack into a
   * card within a card.
   */
  plain?: boolean;
  className?: string;
}

/**
 * Widths cycle so placeholder rows read as text of varying length rather than
 * a grid of identical bars, which looks like a rendering fault.
 */
const SKELETON_WIDTHS = ["w-3/4", "w-1/2", "w-2/3", "w-5/12", "w-3/5"];

/**
 * A table *container*, not a data grid: it owns the card shell, the horizontal
 * scroll region, the header row and the loading/empty states. Rows stay in the
 * page because the tables in this app have very different cell content
 * (avatar stacks, action groups, truncated notes).
 */
export default function DataTable({
  headers,
  children,
  isLoading = false,
  isEmpty = false,
  loadingLabel = "Loading...",
  emptyState,
  minWidthClass = "min-w-full",
  caption,
  mobileCards,
  skeletonRows = 6,
  plain = false,
  className,
}: DataTableProps) {
  // Coerced once. `mobileCards` is a ReactNode, so a bare `mobileCards &&`
  // would both widen the class-name type and render a literal 0 for a caller
  // that passed an empty count.
  const hasCards = Boolean(mobileCards);

  const fallback = emptyState ?? (
    <p className="px-5 py-10 text-center text-sm text-fg-muted">
      No records found.
    </p>
  );

  return (
    <div
      className={cn(
        "overflow-hidden",
        !plain && "rounded-card border border-line bg-surface shadow-card",
        className,
      )}
    >
      {hasCards && (
        <div className="md:hidden">
          {isLoading ? (
            <div aria-busy="true">
              <p className="sr-only" aria-live="polite">
                {loadingLabel}
              </p>
              <ul className="divide-y divide-line" aria-hidden="true">
                {Array.from({ length: skeletonRows }, (_, index) => (
                  <li key={index} className="flex items-center gap-3 px-4 py-4">
                    <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
                    <div className="min-w-0 flex-1 space-y-2">
                      <Skeleton className={cn("h-3.5", SKELETON_WIDTHS[index % 5])} />
                      <Skeleton className="h-3 w-1/3" />
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ) : isEmpty ? (
            fallback
          ) : (
            // A list, not a stack of divs: these are the same records the
            // table states in <tr>s, so the count is worth announcing.
            <ul className="divide-y divide-line">{mobileCards}</ul>
          )}
        </div>
      )}

      {/* Focusable so the horizontal scroll is reachable by keyboard: a
          pointer user can drag a wide table sideways, and without a tab stop
          nobody else can. Labelled from `caption` so the stop is not a
          nameless box.
          When cards are supplied this is display:none below md, which takes
          the tab stop and the whole table out with it - so a phone user never
          reaches a scroll region they cannot see. */}
      <div
        className={cn(
          "overflow-x-auto focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring",
          hasCards && "hidden md:block",
        )}
        tabIndex={0}
        role="group"
        aria-label={caption}
      >
        <table className={cn("w-full text-left text-sm", minWidthClass)}>
          {caption && <caption className="sr-only">{caption}</caption>}

          <thead className="border-b border-line bg-surface-muted">
            <tr>
              {headers.map((header, index) => (
                <th
                  // Headers are a static, ordered list per table, so the index
                  // is a stable key here.
                  key={index}
                  scope="col"
                  className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-fg-muted"
                >
                  {header}
                </th>
              ))}
            </tr>
          </thead>

          <tbody className="divide-y divide-line">
            {isLoading ? (
              <>
                {/* Placeholder rows keep the table's shape, so nothing jumps
                    when the data lands. They are aria-hidden; the single live
                    message in the first row is what a screen reader hears,
                    so a filter change is announced once rather than per cell. */}
                {Array.from({ length: skeletonRows }, (_, row) => (
                  <tr key={row} aria-hidden={row > 0 || undefined}>
                    {headers.map((_, column) => (
                      <td key={column} className="px-5 py-4">
                        {row === 0 && column === 0 && (
                          <span className="sr-only" aria-live="polite">
                            {loadingLabel}
                          </span>
                        )}
                        <Skeleton
                          className={cn(
                            "h-3.5",
                            SKELETON_WIDTHS[(row + column) % SKELETON_WIDTHS.length],
                          )}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </>
            ) : isEmpty ? (
              <tr>
                <td colSpan={headers.length} className="p-0">
                  {fallback}
                </td>
              </tr>
            ) : (
              children
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
