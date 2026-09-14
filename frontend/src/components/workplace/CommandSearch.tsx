import { Search } from "lucide-react";
import { lazy, Suspense, useEffect, useState } from "react";

/**
 * The palette itself (results, keyboard handling, the dialog) is its own chunk,
 * loaded the first time someone opens search or points at the trigger. The
 * header is on every page, so this keeps it out of every first load.
 */
const loadDialog = () => import("./CommandSearchDialog");
const CommandSearchDialog = lazy(loadDialog);

/** The header trigger: a search field on wide screens, an icon on phones, and ⌘K / Ctrl+K anywhere. */
export default function CommandSearch() {
  const [isOpen, setIsOpen] = useState(false);
  // Mounted from the first open on, so closing keeps the dialog's own exit and
  // focus return, and a second open needs no second download.
  const [isWanted, setIsWanted] = useState(false);
  const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setIsWanted(true);
        setIsOpen(true);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setIsWanted(true);
          setIsOpen(true);
        }}
        // Start the download as soon as someone heads for the trigger.
        onPointerEnter={() => void loadDialog()}
        onFocus={() => void loadDialog()}
        aria-label="Search"
        aria-keyshortcuts={isMac ? "Meta+K" : "Control+K"}
        // An icon below xl; from xl the reference's white search pill. The
        // pill is a button that opens the palette, not a text field, so the
        // placeholder wording is its visible label and the magnifier its cue.
        className="grid size-10 place-items-center rounded-xl text-fg transition-colors hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring xl:mr-3 xl:flex xl:h-10 xl:w-52 xl:items-center xl:justify-start xl:gap-2.5 xl:rounded-full xl:border xl:border-line xl:bg-surface xl:px-4 xl:text-fg-subtle xl:shadow-card xl:hover:bg-surface min-[90rem]:w-56"
      >
        <Search size={18} aria-hidden="true" />
        <span className="hidden text-sm xl:inline">Search anything…</span>
      </button>
      {isWanted && (
        <Suspense fallback={null}>
          <CommandSearchDialog isOpen={isOpen} onClose={() => setIsOpen(false)} />
        </Suspense>
      )}
    </>
  );
}
