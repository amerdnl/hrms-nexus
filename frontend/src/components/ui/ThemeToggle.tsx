import { Moon, Sun } from "lucide-react";
import { useTheme } from "../../context/useTheme";

interface ThemeToggleProps {
  /** Colour/hover classes, so the toggle can sit on any surface. */
  className?: string;
  /** Icon-only square button instead of icon + label. */
  compact?: boolean;
}

export default function ThemeToggle({
  className = "text-fg-muted hover:bg-surface-muted hover:text-fg",
  compact = false,
}: ThemeToggleProps) {
  const { resolvedTheme, toggleTheme } = useTheme();

  const isDark = resolvedTheme === "dark";
  const Icon = isDark ? Sun : Moon;
  const label = isDark ? "Switch to light theme" : "Switch to dark theme";

  const layout = compact
    ? "grid h-10 w-10 place-items-center"
    : "flex w-full items-center justify-center gap-2 px-4 py-2.5";

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className={`${layout} rounded-lg text-sm font-semibold transition ${className}`}
      aria-label={label}
      title={label}
    >
      <Icon size={18} aria-hidden="true" />
      {!compact && <span>{isDark ? "Light mode" : "Dark mode"}</span>}
    </button>
  );
}
