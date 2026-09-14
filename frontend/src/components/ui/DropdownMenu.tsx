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
  /** Right-aligned adornment, e.g. a tick on the selected option. */
  trailing?: ReactNode;
  /**
   * Marks the item as one of a set of mutually exclusive choices. Switches the
   * role to menuitemradio and exposes aria-checked, which is what tells a
   * screen reader "3 of 3, selected" rather than reading a plain command.
   */
  checked?: boolean;
  /**
   * Consecutive items sharing a group render inside one labelled
   * role="group" with a visible heading and a rule above it - how the account
   * menu keeps its three theme choices apart from Sign out.
   */
  group?: string;
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

/** Consecutive items that share a `group`, in order. Items without one form their own runs. */
function groupItems(items: MenuItem[]): Array<{ group?: string; items: MenuItem[] }> {
  const runs: Array<{ group?: string; items: MenuItem[] }> = [];
  for (const item of items) {
    const last = runs[runs.length - 1];
    if (last && last.group === item.group) last.items.push(item);
    else runs.push({ group: item.group, items: [item] });
  }
  return runs;
}

const MENU_WIDTH = 224;
/** Gap between the trigger and the menu, and the minimum margin to any edge. */
const GAP = 6;
const EDGE = 8;
/**
 * Used only for the very first layout pass, before the menu has been measured.
 * Any value works: place() re-runs with the real height in the same commit.
 */
const ESTIMATED_MENU_HEIGHT = 160;
/**
 * Both roles, because an item is a menuitemradio when it is checkable and a
 * plain menuitem otherwise. Matching only the latter silently broke arrow-key
 * navigation in every checkable menu - the theme picker, whose items are all
 * radios, had no working arrow keys at all.
 */
const ITEM_SELECTOR = "[role='menuitem'],[role='menuitemradio']";

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

    const viewportHeight = window.innerHeight;
    const menuHeight = menuRef.current?.offsetHeight ?? ESTIMATED_MENU_HEIGHT;

    /*
     * Flip above the trigger when there is no room below it.
     *
     * This is not a nicety. A trigger sitting at the bottom of a full-height
     * column - a control at the foot of a screen is exactly that - has
     * only a few pixels beneath it, and because the menu is `fixed` the page
     * cannot be scrolled to reveal what hangs off the bottom. Opening downward
     * there put all but the first few pixels of the menu out of reach.
     */
    const roomBelow = viewportHeight - rect.bottom - GAP;
    const roomAbove = rect.top - GAP;
    const openUpward = roomBelow < menuHeight && roomAbove > roomBelow;

    const top = openUpward ? rect.top - GAP - menuHeight : rect.bottom + GAP;
    const left = align === "end" ? rect.right - MENU_WIDTH : rect.left;

    setPosition({
      // Final clamp, so a menu taller than the viewport is pinned to the top
      // edge and stays partly reachable rather than being centred out of view.
      top: Math.max(EDGE, Math.min(top, viewportHeight - menuHeight - EDGE)),
      // Kept inside the viewport, which matters most at 375px where an
      // end-aligned menu would otherwise hang off the left edge.
      left: Math.max(EDGE, Math.min(left, window.innerWidth - MENU_WIDTH - EDGE)),
    });
  }, [align]);

  useLayoutEffect(() => {
    if (!isOpen) return;

    // Twice on purpose. The first call positions the menu so it can be laid
    // out and measured; the second re-runs with menuRef's real offsetHeight,
    // which is what the upward flip depends on. Both happen before paint, so
    // nothing is visible in the interim position.
    place();
    place();
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
      ?.querySelectorAll<HTMLButtonElement>(ITEM_SELECTOR)
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
            {groupItems(enabled).map((run, runIndex) => (
              <div
                key={`${run.group ?? "items"}-${runIndex}`}
                role={run.group ? "group" : undefined}
                aria-label={run.group}
                className={cn(runIndex > 0 && "mt-1 border-t border-line pt-1")}
              >
                {run.group && (
                  // The group's name is already its aria-label, so the visible
                  // heading is hidden from assistive tech rather than read twice.
                  <p aria-hidden="true" className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-fg-subtle">
                    {run.group}
                  </p>
                )}
                {run.items.map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    role={item.checked === undefined ? "menuitem" : "menuitemradio"}
                    aria-checked={item.checked}
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
                    <span className="flex-1 truncate">{item.label}</span>
                    {item.trailing}
                  </button>
                ))}
              </div>
            ))}
          </div>,
          document.body,
        )}
    </>
  );
}
