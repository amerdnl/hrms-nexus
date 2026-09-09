import { useRef } from "react";
import { cn } from "../../utils/cn";

export interface TabItem {
  id: string;
  label: string;
  /** Optional badge, e.g. a record count. */
  count?: number;
}

interface TabsProps {
  tabs: TabItem[];
  active: string;
  onChange: (id: string) => void;
  className?: string;
}

/**
 * Follows the ARIA tabs pattern with automatic activation.
 *
 * The consumer renders the panel and is responsible for the other half of the
 * relationship:
 *   <div role="tabpanel" id={`panel-${active}`} aria-labelledby={`tab-${active}`}>
 */
export default function Tabs({ tabs, active, onChange, className }: TabsProps) {
  const listRef = useRef<HTMLDivElement>(null);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const currentIndex = tabs.findIndex((tab) => tab.id === active);
    if (currentIndex === -1) return;

    let nextIndex: number | null = null;

    if (event.key === "ArrowRight") nextIndex = (currentIndex + 1) % tabs.length;
    if (event.key === "ArrowLeft")
      nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = tabs.length - 1;

    if (nextIndex === null) return;

    event.preventDefault();
    const nextTab = tabs[nextIndex];
    onChange(nextTab.id);
    // Move focus to match selection, so the roving tabindex stays coherent.
    listRef.current
      ?.querySelector<HTMLButtonElement>(`#tab-${CSS.escape(nextTab.id)}`)
      ?.focus();
  };

  return (
    <div
      ref={listRef}
      role="tablist"
      onKeyDown={handleKeyDown}
      /* Enough tabs on a narrow screen will exceed the viewport, so the strip
         scrolls itself rather than pushing the whole page sideways.
         shrink-0 on each button stops them being squeezed into unreadable
         slivers instead. */
      className={cn("flex gap-1 overflow-x-auto border-b border-line", className)}
    >
      {tabs.map((tab) => {
        const isActive = tab.id === active;

        return (
          <button
            key={tab.id}
            id={`tab-${tab.id}`}
            type="button"
            role="tab"
            aria-selected={isActive}
            aria-controls={`panel-${tab.id}`}
            // Roving tabindex: one stop for the whole tablist, arrows move within.
            tabIndex={isActive ? 0 : -1}
            onClick={() => onChange(tab.id)}
            className={cn(
              "-mb-px flex shrink-0 items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
              isActive
                ? "border-primary text-primary"
                : "border-transparent text-fg-muted hover:border-line-strong hover:text-fg",
            )}
          >
            {tab.label}
            {typeof tab.count === "number" && (
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-xs font-semibold",
                  isActive
                    ? "bg-primary-soft text-primary"
                    : "bg-surface-muted text-fg-muted",
                )}
              >
                {tab.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
