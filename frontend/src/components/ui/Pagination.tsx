import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "../../utils/cn";

interface PaginationProps {
  /** 1-based. */
  page: number;
  pageSize: number;
  totalItems: number;
  onPageChange: (page: number) => void;
  className?: string;
}

export default function Pagination({
  page,
  pageSize,
  totalItems,
  onPageChange,
  className,
}: PaginationProps) {
  const pageCount = Math.max(1, Math.ceil(totalItems / pageSize));

  // Nothing to paginate - render nothing rather than a dead control.
  if (totalItems === 0 || pageCount === 1) return null;

  const first = (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, totalItems);

  const buttonClass =
    "grid h-9 w-9 place-items-center rounded-lg border border-line-strong bg-surface text-fg-muted transition-colors hover:bg-surface-muted hover:text-fg disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

  return (
    <nav
      aria-label="Pagination"
      className={cn(
        "flex flex-wrap items-center justify-between gap-3 border-t border-line px-5 py-3",
        className,
      )}
    >
      {/* aria-live so the range is announced after a page change; the arrows
          have no visible text to convey where you landed. */}
      <p className="text-xs text-fg-muted" aria-live="polite">
        Showing <span className="font-semibold text-fg">{first}</span>&ndash;
        <span className="font-semibold text-fg">{last}</span> of{" "}
        <span className="font-semibold text-fg">{totalItems}</span>
      </p>

      <div className="flex items-center gap-2">
        <button
          type="button"
          className={buttonClass}
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          aria-label="Previous page"
        >
          <ChevronLeft size={17} aria-hidden="true" />
        </button>

        <span className="px-1 text-xs font-medium text-fg-muted">
          Page {page} of {pageCount}
        </span>

        <button
          type="button"
          className={buttonClass}
          onClick={() => onPageChange(page + 1)}
          disabled={page >= pageCount}
          aria-label="Next page"
        >
          <ChevronRight size={17} aria-hidden="true" />
        </button>
      </div>
    </nav>
  );
}
