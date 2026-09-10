import type { ReactNode } from "react";
import { cn } from "../../utils/cn";

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
  className?: string;
}

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
        "overflow-hidden rounded-card border border-line bg-surface shadow-card",
        className,
      )}
    >
      {hasCards && (
        <div className="md:hidden">
          {isLoading ? (
            <p
              className="px-5 py-10 text-center text-sm text-fg-muted"
              aria-live="polite"
            >
              {loadingLabel}
            </p>
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
              <tr>
                <td
                  colSpan={headers.length}
                  className="px-5 py-10 text-center text-sm text-fg-muted"
                >
                  {/* aria-live so a filter change that swaps rows is announced
                      rather than silently replacing the table. */}
                  <span aria-live="polite">{loadingLabel}</span>
                </td>
              </tr>
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
