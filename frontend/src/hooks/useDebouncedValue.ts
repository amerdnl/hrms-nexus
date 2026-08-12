import { useEffect, useState } from "react";

/**
 * Returns `value` after it has stopped changing for `delayMs`.
 *
 * Intended for search inputs that currently drive a fetch on every keystroke
 * (Employee Management, Admin Leave), where each keystroke is a request
 * against an unpaginated endpoint.
 */
export function useDebouncedValue<T>(value: T, delayMs = 300): T {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timeout = setTimeout(() => setDebouncedValue(value), delayMs);

    // Clearing on every change is what makes this a debounce rather than a
    // throttle: only the final value in a burst survives to be committed.
    return () => clearTimeout(timeout);
  }, [value, delayMs]);

  return debouncedValue;
}
