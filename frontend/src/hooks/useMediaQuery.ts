import { useCallback, useSyncExternalStore } from "react";

/**
 * Whether a media query matches, kept current as the window changes.
 *
 * For choosing between two genuinely different components (a popover on a
 * wide screen, a bottom sheet on a phone) - not for styling, which CSS
 * breakpoints already do without rendering twice.
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const list = window.matchMedia(query);
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    [query],
  );
  return useSyncExternalStore(subscribe, () => window.matchMedia(query).matches, () => false);
}
