import { ArrowLeft, ArrowRight, LayoutGrid, Search } from "lucide-react";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../../context/useAuth";
import { useMediaQuery } from "../../hooks/useMediaQuery";
import {
  featuredFor,
  filterSections,
  isDestinationActive,
  navigationSectionsFor,
  type NavigationItem,
  type NavigationSection,
} from "../../routes/navigation";
import { cn } from "../../utils/cn";
import Sheet from "../ui/Sheet";

const TILE = "[data-launcher-tile]";

/**
 * Moves focus between tiles with the arrow keys, by what is visually next to
 * the current tile rather than by list index, so "down" means the tile
 * underneath however the grid has wrapped. Returns whether the key was handled.
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

function Tile({ item, pathname, compact = false }: { item: NavigationItem; pathname: string; compact?: boolean }) {
  const active = isDestinationActive(item, pathname);
  return (
    <Link
      to={item.to}
      data-launcher-tile=""
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex h-full flex-col items-center justify-center rounded-xl px-1 text-center transition-colors",
        compact ? "gap-1.5 py-2" : "gap-2 py-3",
        "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring",
        active ? "bg-primary-soft/70" : "hover:bg-surface-muted",
      )}
    >
      <span className={cn("grid place-items-center rounded-[0.875rem] bg-primary-soft text-primary", compact ? "size-11" : "size-12")} aria-hidden="true">
        <item.icon size={22} strokeWidth={2.2} />
      </span>
      <span className={cn("text-[0.8125rem] leading-tight [overflow-wrap:anywhere]", active ? "font-semibold text-primary" : "font-medium text-fg")}>
        {item.label}
      </span>
    </Link>
  );
}

/**
 * The launcher's content, shared by the desktop panel and the phone sheet.
 *
 * It opens on the reference's six shortcuts, divided by hairlines. Typing
 * filters every destination the session may open; "View all pages" shows the
 * complete grouped directory. Nothing is left out of the directory to make
 * the shortcuts tidy - the shortcuts are only the first view of it.
 */
function LauncherContent({
  sections,
  featured,
  pathname,
  inputRef,
}: {
  sections: NavigationSection[];
  featured: NavigationItem[];
  pathname: string;
  inputRef: React.RefObject<HTMLInputElement | null>;
}) {
  const [query, setQuery] = useState("");
  const [showAll, setShowAll] = useState(false);
  const gridRef = useRef<HTMLDivElement>(null);
  const idBase = useId();
  const term = query.trim();
  const shown = filterSections(sections, query);
  const count = shown.reduce((total, section) => total + section.items.length, 0);
  const grouped = term.length > 0 || showAll;

  const onInputKey = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      gridRef.current?.querySelector<HTMLElement>(TILE)?.focus();
    }
  };
  const onGridKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if (gridRef.current && moveFocus(gridRef.current, event.key, () => inputRef.current?.focus())) event.preventDefault();
  };

  return (
    <div>
      <label className="relative block">
        <span className="sr-only">Search pages</span>
        <Search size={17} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-fg-subtle" aria-hidden="true" />
        <input
          ref={inputRef}
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={onInputKey}
          placeholder="Search pages…"
          autoComplete="off"
          className="h-11 w-full rounded-2xl border border-transparent bg-surface-muted pl-10 pr-3 text-sm text-fg placeholder:text-fg-subtle focus:border-primary/40 focus:outline-none"
        />
      </label>
      <p className="sr-only" role="status" aria-live="polite">
        {term ? `${count} ${count === 1 ? "page" : "pages"}` : ""}
      </p>

      <div ref={gridRef} onKeyDown={onGridKey} className="mt-3">
        {!grouped && (
          <ul className="grid grid-cols-3">
            {featured.map((item, index) => (
              <li
                key={item.to}
                className={cn(
                  "relative p-1",
                  // Hairlines between tiles, inset from the ends, as in the reference.
                  index % 3 !== 2 && "after:absolute after:bottom-4 after:right-0 after:top-4 after:w-px after:bg-line",
                  index < 3 && "before:absolute before:bottom-0 before:left-3 before:right-3 before:h-px before:bg-line",
                )}
              >
                <Tile item={item} pathname={pathname} />
              </li>
            ))}
          </ul>
        )}

        {grouped && (
          <div className="max-h-[min(58vh,30rem)] space-y-3 overflow-y-auto pb-6 pr-0.5 [mask-image:linear-gradient(to_bottom,black_calc(100%-2.5rem),transparent)]">
            {shown.length === 0 && (
              <p className="py-8 text-center text-sm text-fg-muted">No page matches “{term}”.</p>
            )}
            {shown.map((section) => (
              <section key={section.id} aria-labelledby={`${idBase}-${section.id}`}>
                <h3 id={`${idBase}-${section.id}`} className="px-1 text-[0.6875rem] font-semibold uppercase tracking-[0.1em] text-fg-subtle">
                  {section.label}
                </h3>
                <ul className="mt-1 grid grid-cols-3">
                  {section.items.map((item) => (
                    <li key={item.to} className="p-0.5">
                      <Tile item={item} pathname={pathname} compact />
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </div>

      {!term && (
        <div className="mt-2 flex justify-center border-t border-line pt-2">
          <button
            type="button"
            onClick={() => setShowAll((value) => !value)}
            className="inline-flex min-h-10 items-center gap-2 rounded-lg px-3 text-[0.8125rem] font-medium text-fg-muted transition-colors hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            {showAll ? (
              <>
                <ArrowLeft size={15} aria-hidden="true" />
                Back to shortcuts
              </>
            ) : (
              <>
                View all pages
                <ArrowRight size={15} aria-hidden="true" />
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * The App Launcher: the complete, permission-aware directory of modules,
 * opened from the header. A panel under the header from md up, a bottom sheet
 * on a phone. Built from the navigation registry, so nothing appears that the
 * route would refuse - and the route and the server still check.
 */
export default function AppLauncher() {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const isWide = useMediaQuery("(min-width: 48rem)");
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const panelId = useId();

  // Following a destination closes the launcher.
  useEffect(() => setIsOpen(false), [pathname]);

  // Panel only: focus in on open; Escape, an outside pointer or focus leaving
  // the panel closes it. The sheet gets all of this from Modal.
  useEffect(() => {
    if (!isOpen || !isWide) return;
    inputRef.current?.focus();
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
  const featured = featuredFor(user);

  return (
    // No positioning context here: the panel anchors to the header row, so it
    // aligns with the header's right edge as in the reference.
    <div>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        aria-label="Apps"
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        aria-controls={isOpen && isWide ? panelId : undefined}
        className={cn(
          "grid size-10 place-items-center rounded-2xl text-fg transition-colors md:size-11",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
          isOpen ? "bg-line" : "hover:bg-surface-muted",
        )}
      >
        <LayoutGrid size={20} strokeWidth={2.2} aria-hidden="true" />
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
          className="absolute right-(--gutter) top-[calc(100%-0.5rem)] z-50 w-[22rem] rounded-[1.25rem] border border-line bg-elevated p-4 shadow-panel"
        >
          <LauncherContent sections={sections} featured={featured} pathname={pathname} inputRef={inputRef} />
        </div>
      )}

      {!isWide && (
        <Sheet
          isOpen={isOpen}
          onClose={() => setIsOpen(false)}
          title="Apps"
          description={user.role === "admin" ? "Every area of HR Nexus you can open." : "Everything you can open."}
        >
          <LauncherContent sections={sections} featured={featured} pathname={pathname} inputRef={inputRef} />
        </Sheet>
      )}
    </div>
  );
}
