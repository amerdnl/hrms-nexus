import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { cn } from "../../utils/cn";

export interface MenuItem {
  key: string;
  label: string;
  icon?: ReactNode;
  onSelect: () => void;
  /** Renders in the destructive tone. Does not imply a confirmation step. */
  tone?: "default" | "danger";
  disabled?: boolean;
}

interface DropdownMenuProps {
  /** The control that opens the menu. Cloned with no props; wrapped instead. */
  trigger: ReactNode;
  items: MenuItem[];
  /** Accessible name for the trigger, e.g. "Row actions for Nur Aisyah". */
  label: string;
  align?: "start" | "end";
  className?: string;
}

const MENU_WIDTH = 224;

/**
 * A menu button following the ARIA menu-button pattern.
 *
 * Positioned `fixed` from the trigger's measured rect and portalled to the
 * body, NOT absolutely inside a relative wrapper. That is the whole reason
 * this exists as a primitive: the row menus these are built for live inside
 * DataTable, whose card sets `overflow-hidden` and whose scroll region sets
 * `overflow-x-auto`. An absolutely positioned menu is clipped by both.
 */
export default function DropdownMenu({
  trigger,
  items,
  label,
  align = "end",
  className,
}: DropdownMenuProps) {
  const id = useId();
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [position, setPosition] = useState({ top: 0, left: 0 });

  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const enabled = items.filter((item) => !item.disabled);

  const place = useCallback(() => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;

    const left =
      align === "end" ? rect.right - MENU_WIDTH : rect.left;

    setPosition({
      top: rect.bottom + 6,
      // Kept inside the viewport, which matters most at 375px where an
      // end-aligned menu would otherwise hang off the left edge.
      left: Math.max(8, Math.min(left, window.innerWidth - MENU_WIDTH - 8)),
    });
  }, [align]);

  useLayoutEffect(() => {
    if (isOpen) place();
  }, [isOpen, place]);

  // Reposition rather than close: closing on scroll would dismiss the menu
  // the moment a table scrolled under it. Capture phase so scrolls inside
  // the table's own overflow container are seen too.
  useEffect(() => {
    if (!isOpen) return;

    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [isOpen, place]);

  const close = useCallback((returnFocus = true) => {
    setIsOpen(false);
    if (returnFocus) triggerRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!isOpen) return;

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (
        !menuRef.current?.contains(target) &&
        !triggerRef.current?.contains(target)
      ) {
        // No focus return: the pointer has already moved the user elsewhere.
        close(false);
      }
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
        return;
      }
      if (event.key === "Tab") {
        // A menu is not a tab stop sequence; Tab dismisses it.
        close(false);
        return;
      }
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        setActiveIndex((current) => {
          const step = event.key === "ArrowDown" ? 1 : -1;
          return (current + step + enabled.length) % enabled.length;
        });
      }
      if (event.key === "Home") {
        event.preventDefault();
        setActiveIndex(0);
      }
      if (event.key === "End") {
        event.preventDefault();
        setActiveIndex(enabled.length - 1);
      }
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [isOpen, close, enabled.length]);

  // Focus follows the roving active index, which is what makes the arrow keys
  // actually move a screen reader's cursor rather than only a highlight.
  useEffect(() => {
    if (!isOpen) return;
    menuRef.current
      ?.querySelectorAll<HTMLButtonElement>("[role='menuitem']")
      ?.[activeIndex]?.focus();
  }, [isOpen, activeIndex]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-controls={isOpen ? id : undefined}
        onClick={() => {
          setActiveIndex(0);
          setIsOpen((current) => !current);
        }}
        className={cn(
          "inline-flex items-center justify-center rounded-lg text-fg-muted transition-colors",
          "hover:bg-surface-muted hover:text-fg",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
          className,
        )}
      >
        {trigger}
      </button>

      {isOpen &&
        createPortal(
          <div
            ref={menuRef}
            id={id}
            role="menu"
            aria-label={label}
            style={{ top: position.top, left: position.left, width: MENU_WIDTH }}
            className="fixed z-[80] overflow-hidden rounded-xl border border-line bg-elevated py-1 shadow-panel"
          >
            {enabled.map((item) => (
              <button
                key={item.key}
                type="button"
                role="menuitem"
                tabIndex={-1}
                onClick={() => {
                  close();
                  item.onSelect();
                }}
                className={cn(
                  "flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-sm transition-colors",
                  "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring",
                  item.tone === "danger"
                    ? "text-danger-fg hover:bg-danger-soft"
                    : "text-fg hover:bg-surface-muted",
                )}
              >
                {item.icon}
                {item.label}
              </button>
            ))}
          </div>,
          document.body,
        )}
    </>
  );
}
