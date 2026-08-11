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
  className,
}: DataTableProps) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-card border border-line bg-surface shadow-card",
        className,
      )}
    >
      {/* Focusable so the horizontal scroll is reachable by keyboard: a
          pointer user can drag a wide table sideways, and without a tab stop
          nobody else can. Labelled from `caption` so the stop is not a
          nameless box. */}
      <div
        className="overflow-x-auto focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
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
                  {emptyState ?? (
                    <p className="px-5 py-10 text-center text-sm text-fg-muted">
                      No records found.
                    </p>
                  )}
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
