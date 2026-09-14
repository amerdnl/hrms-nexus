import { Grip, Search } from "lucide-react";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../../context/useAuth";
import { useMediaQuery } from "../../hooks/useMediaQuery";
import {
  filterSections,
  isDestinationActive,
  navigationSectionsFor,
  type NavigationSection,
} from "../../routes/navigation";
import { cn } from "../../utils/cn";
import Sheet from "../ui/Sheet";
import { tintStyles } from "../ui/tint";

const TILE = "[data-launcher-tile]";

/**
 * Moves focus between tiles with the arrow keys, by what is visually next to
 * the current tile rather than by list index - the grid reflows from four
 * columns to three, and "down" has to mean the tile underneath at either.
 * Returns whether the key was handled.
 */
function moveFocus(container: HTMLElement, key: string, onTop: () => void): boolean {
  const tiles = [...container.querySelectorAll<HTMLElement>(TILE)];
  const current = document.activeElement as HTMLElement | null;
  const index = current ? tiles.indexOf(current) : -1;
  if (index === -1 || tiles.length === 0) return false;

  let next = index;
  if (key === "ArrowRight") next = Math.min(tiles.length - 1, index + 1);
  else if (key === "ArrowLeft") next = Math.max(0, index - 1);
  else if (key === "Home") next = 0;
  else if (key === "End") next = tiles.length - 1;
  else if (key === "ArrowDown" || key === "ArrowUp") {
    const here = tiles[index].getBoundingClientRect();
    const centre = here.left + here.width / 2;
    const rows = tiles
      .map((tile, position) => ({ position, rect: tile.getBoundingClientRect() }))
      .filter(({ rect }) => (key === "ArrowDown" ? rect.top > here.top + 4 : rect.top < here.top - 4));
    if (rows.length === 0) {
      if (key === "ArrowUp") onTop();
      return true;
    }
    const rowTop = key === "ArrowDown"
      ? Math.min(...rows.map(({ rect }) => rect.top))
      : Math.max(...rows.map(({ rect }) => rect.top));
    const row = rows.filter(({ rect }) => Math.abs(rect.top - rowTop) < 4);
    next = row.reduce((best, candidate) =>
      Math.abs(candidate.rect.left + candidate.rect.width / 2 - centre) <
      Math.abs(best.rect.left + best.rect.width / 2 - centre) ? candidate : best,
    ).position;
  } else {
    return false;
  }

  tiles[next].focus();
  return true;
}

/**
 * The launcher's content: a filter and every destination the session may
 * open, grouped. Shared by the desktop popover and the phone sheet so the two
 * can never list different things.
 */
function LauncherContent({ sections, pathname }: { sections: NavigationSection[]; pathname: string }) {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const idBase = useId();
  const shown = filterSections(sections, query);
  const count = shown.reduce((total, section) => total + section.items.length, 0);

  const onInputKey = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      gridRef.current?.querySelector<HTMLElement>(TILE)?.focus();
    }
  };

  const onGridKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!gridRef.current) return;
    if (moveFocus(gridRef.current, event.key, () => inputRef.current?.focus())) event.preventDefault();
  };

  return (
    <div>
      <label className="relative block">
        <span className="sr-only">Find an app</span>
        <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-fg-subtle" aria-hidden="true" />
        <input
          ref={inputRef}
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={onInputKey}
          placeholder="Find an app"
          autoComplete="off"
          className="h-11 w-full rounded-xl border border-control-border bg-surface pl-10 pr-3 text-sm text-fg placeholder:text-fg-subtle focus:border-primary focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-ring"
        />
      </label>
      <p className="sr-only" role="status" aria-live="polite">
        {query.trim() ? `${count} ${count === 1 ? "app" : "apps"}` : ""}
      </p>

      <div ref={gridRef} onKeyDown={onGridKey} className="mt-4 space-y-5">
        {shown.length === 0 && (
          <p className="py-8 text-center text-sm text-fg-muted">No app matches “{query.trim()}”.</p>
        )}
        {shown.map((section) => (
          <section key={section.id} aria-labelledby={`${idBase}-${section.id}`}>
            <h3 id={`${idBase}-${section.id}`} className="px-1 text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-fg-subtle">
              {section.label}
            </h3>
            <ul className="mt-2 grid grid-cols-3 gap-1 sm:grid-cols-4">
              {section.items.map((item) => {
                const active = isDestinationActive(item, pathname);
                return (
                  <li key={item.to}>
                    <Link
                      to={item.to}
                      data-launcher-tile=""
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "flex min-h-24 flex-col items-center justify-center gap-2 rounded-xl px-1.5 py-3 text-center transition-colors",
                        "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring",
                        active ? "bg-primary-soft" : "hover:bg-surface-muted",
                      )}
                    >
                      <span className={cn("grid size-11 place-items-center rounded-xl", tintStyles[item.tint])} aria-hidden="true">
                        <item.icon size={20} />
                      </span>
                      <span className={cn("text-xs leading-tight [overflow-wrap:anywhere]", active ? "font-semibold text-primary" : "font-medium text-fg")}>
                        {item.label}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}

/**
 * The App Launcher: the complete, permission-aware directory of modules.
 *
 * The header's four destinations are the daily ones; everything a session may
 * open lives here, grouped. A popover under the header from md up, a bottom
 * sheet on a phone. Built from the same navigation registry as the header, so
 * nothing appears that the route would refuse - and the route and the server
 * still check.
 */
export default function AppLauncher() {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const isWide = useMediaQuery("(min-width: 48rem)");
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const panelId = useId();

  // Following a destination closes the launcher.
  useEffect(() => setIsOpen(false), [pathname]);

  // Popover only: focus in on open, Escape and outside pointer close it, and
  // focus leaving the panel closes it too (a non-modal panel must not strand
  // itself open behind the keyboard). The sheet gets all of this from Modal.
  useEffect(() => {
    if (!isOpen || !isWide) return;
    panelRef.current?.querySelector<HTMLInputElement>("input")?.focus();
    const onPointer = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!panelRef.current?.contains(target) && !triggerRef.current?.contains(target)) setIsOpen(false);
    };
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [isOpen, isWide]);

  if (!user) return null;
  const sections = navigationSectionsFor(user);

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        aria-label="Apps"
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        aria-controls={isOpen && isWide ? panelId : undefined}
        className={cn(
          "grid size-10 place-items-center rounded-xl text-fg transition-colors hover:bg-surface-muted",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
          isOpen && "bg-surface-muted",
        )}
      >
        <Grip size={22} strokeWidth={2.4} aria-hidden="true" />
      </button>

      {isWide && isOpen && (
        <div
          ref={panelRef}
          id={panelId}
          role="dialog"
          aria-label="Apps"
          onBlur={(event) => {
            const next = event.relatedTarget as Node | null;
            if (next && !panelRef.current?.contains(next) && !triggerRef.current?.contains(next)) setIsOpen(false);
          }}
          className="absolute right-0 top-12 z-50 w-[min(36rem,calc(100vw-2rem))] rounded-2xl border border-line bg-elevated p-4 shadow-panel"
        >
          <div className="max-h-[min(70vh,40rem)] overflow-y-auto p-1">
            <LauncherContent sections={sections} pathname={pathname} />
          </div>
        </div>
      )}

      {!isWide && (
        <Sheet
          isOpen={isOpen}
          onClose={() => setIsOpen(false)}
          title="Apps"
          description={user.role === "admin" ? "Every area of HR Nexus you can open." : "Everything you can open."}
        >
          <LauncherContent sections={sections} pathname={pathname} />
        </Sheet>
      )}
    </div>
  );
}
