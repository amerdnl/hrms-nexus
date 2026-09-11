import { ChevronDown, SlidersHorizontal } from "lucide-react";
import { useId, useState, type ReactNode } from "react";
import { cn } from "../../utils/cn";
import Button from "./Button";

interface FilterPanelProps {
  children: ReactNode;
  columns?: 2 | 3 | 4;
  /**
   * Omit for live filtering. Supplied when filters are committed explicitly,
   * which the admin attendance page needs so an unbounded query does not fire
   * on every keystroke.
   */
  onApply?: () => void;
  onClear?: () => void;
  isBusy?: boolean;
  /** Count of filters currently in effect, surfaced as a badge. */
  activeCount?: number;
  title?: string;
  className?: string;
}

const columnStyles: Record<2 | 3 | 4, string> = {
  2: "sm:grid-cols-2",
  3: "sm:grid-cols-2 lg:grid-cols-3",
  4: "sm:grid-cols-2 lg:grid-cols-4",
};

export default function FilterPanel({
  children,
  columns = 3,
  onApply,
  onClear,
  isBusy = false,
  activeCount = 0,
  title = "Filters",
  className,
}: FilterPanelProps) {
  const bodyId = useId();
  // Collapsed by default below md. Irrelevant from md up, where the body is
  // always shown and the toggle is not rendered.
  const [isOpen, setIsOpen] = useState(false);

  const heading = (
    <>
      <SlidersHorizontal size={16} className="shrink-0 text-primary" aria-hidden="true" />
      <span className="text-sm font-semibold text-fg">{title}</span>
      {activeCount > 0 && (
        <span className="rounded-full bg-primary-soft px-2 py-0.5 text-xs font-semibold text-primary">
          {activeCount} active
        </span>
      )}
    </>
  );

  return (
    <section
      aria-label={title}
      className={cn(
        "rounded-card border border-line bg-surface p-5 shadow-card",
        className,
      )}
    >
      {/*
        Below md the fields are behind a disclosure. Five stacked fields filled
        a whole phone screen before a single record appeared, which put the
        thing the page is FOR below the fold on every visit. From md up there is
        room, so the panel is always open and the toggle is not rendered.
      */}
      {/* The button sits INSIDE the heading, not the other way round: a
          button only accepts phrasing content, and this is also the shape the
          ARIA disclosure pattern uses, so the heading stays in the outline. */}
      <h2 className="md:hidden">
        <button
          type="button"
          onClick={() => setIsOpen((open) => !open)}
          aria-expanded={isOpen}
          aria-controls={bodyId}
          className="-m-2 flex w-[calc(100%+1rem)] items-center gap-2 rounded-lg p-2 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          {heading}
          <ChevronDown
            size={18}
            aria-hidden="true"
            className={cn(
              "ml-auto shrink-0 text-fg-muted transition-transform",
              isOpen && "rotate-180",
            )}
          />
        </button>
      </h2>

      <h2 className="mb-4 hidden items-center gap-2 md:flex">{heading}</h2>

      <div
        id={bodyId}
        className={cn("mt-4 md:mt-0 md:block", isOpen ? "block" : "hidden")}
      >
        <div className={cn("grid gap-4", columnStyles[columns])}>{children}</div>

        {(onApply || onClear) && (
          <div className="mt-4 flex flex-wrap justify-end gap-2">
            {onClear && (
              <Button variant="ghost" size="sm" onClick={onClear} disabled={isBusy}>
                Clear
              </Button>
            )}
            {onApply && (
              <Button size="sm" onClick={onApply} isLoading={isBusy}>
                Apply filters
              </Button>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
