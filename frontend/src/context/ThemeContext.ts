import { createContext } from "react";

/**
 * Mirrors AUTH_TOKEN_KEY ("hr_nexus_token") in src/api/axios.ts.
 *
 * NOTE: this literal is duplicated in index.html's anti-FOUC script, which has
 * to run before any module loads and therefore cannot import from here.
 * Keep the two in sync.
 */
export const THEME_STORAGE_KEY = "hr_nexus_theme";

/** What the user has chosen. "system" means "follow the OS". */
export type ThemePreference = "light" | "dark" | "system";

/** What is actually applied to the document once "system" is resolved. */
export type ResolvedTheme = "light" | "dark";

export interface ThemeContextValue {
  preference: ThemePreference;
  resolvedTheme: ResolvedTheme;
  setPreference: (preference: ThemePreference) => void;
  /** Flips light <-> dark and commits it as an explicit preference. */
  toggleTheme: () => void;
}

export const ThemeContext = createContext<ThemeContextValue | undefined>(
  undefined,
);
