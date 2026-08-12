import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  THEME_STORAGE_KEY,
  ThemeContext,
  type ResolvedTheme,
  type ThemeContextValue,
  type ThemePreference,
} from "./ThemeContext";

const DARK_MEDIA_QUERY = "(prefers-color-scheme: dark)";

/**
 * Reads the saved preference, tolerating both a missing value (first visit)
 * and a corrupt one (hand-edited storage). Access is wrapped because Safari
 * private mode throws on localStorage rather than returning null.
 */
function readStoredPreference(): ThemePreference {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);

    if (stored === "light" || stored === "dark" || stored === "system") {
      return stored;
    }
  } catch {
    // Storage unavailable - fall through to the system default.
  }

  return "system";
}

function getSystemTheme(): ResolvedTheme {
  return window.matchMedia(DARK_MEDIA_QUERY).matches ? "dark" : "light";
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] =
    useState<ThemePreference>(readStoredPreference);
  const [systemTheme, setSystemTheme] = useState<ResolvedTheme>(getSystemTheme);

  const resolvedTheme: ResolvedTheme =
    preference === "system" ? systemTheme : preference;

  // Track the OS setting continuously. Because `resolvedTheme` only consults
  // `systemTheme` while the preference is "system", an OS change while the
  // user has an explicit preference is recorded but correctly ignored.
  useEffect(() => {
    const mediaQuery = window.matchMedia(DARK_MEDIA_QUERY);

    const handleChange = (event: MediaQueryListEvent) => {
      setSystemTheme(event.matches ? "dark" : "light");
    };

    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, []);

  // Apply the resolved theme to <html>.
  //
  // The inline colorScheme assignment is not redundant with the
  // `html.dark { color-scheme: dark }` rule in index.css: the anti-FOUC script
  // in index.html sets colorScheme as an inline style, and an inline style
  // outranks a stylesheet rule. Without updating it here, native date pickers
  // and scrollbars would stay stuck on whatever the page loaded with.
  useEffect(() => {
    const root = document.documentElement;

    // Passing the boolean explicitly makes this idempotent, so React 19
    // StrictMode's double-invoke is harmless.
    root.classList.toggle("dark", resolvedTheme === "dark");
    root.style.colorScheme = resolvedTheme;
  }, [resolvedTheme]);

  // Persisted here rather than in an effect on `preference`: an effect would
  // fire on mount and overwrite a first-time visitor's "system" with a
  // concrete value, permanently detaching them from their OS setting.
  const setPreference = useCallback((next: ThemePreference) => {
    setPreferenceState(next);

    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // Storage unavailable - the theme still applies for this session.
    }
  }, []);

  const toggleTheme = useCallback(() => {
    setPreference(resolvedTheme === "dark" ? "light" : "dark");
  }, [resolvedTheme, setPreference]);

  const value = useMemo<ThemeContextValue>(
    () => ({ preference, resolvedTheme, setPreference, toggleTheme }),
    [preference, resolvedTheme, setPreference, toggleTheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
