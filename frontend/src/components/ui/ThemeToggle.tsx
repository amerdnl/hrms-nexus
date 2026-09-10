import { Check, ChevronDown, Monitor, Moon, Sun, type LucideIcon } from "lucide-react";
import type { ThemePreference } from "../../context/ThemeContext";
import { useTheme } from "../../context/useTheme";
import { cn } from "../../utils/cn";
import DropdownMenu from "./DropdownMenu";

interface ThemeToggleProps {
  /** Colour/hover classes, so the control can sit on any surface. */
  className?: string;
  /** Icon-only square trigger instead of icon + label. */
  compact?: boolean;
}

const OPTIONS: Array<{
  value: ThemePreference;
  label: string;
  icon: LucideIcon;
}> = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
];

/**
 * Theme control.
 *
 * A menu rather than the two-state button this used to be. The provider has
 * always supported a third preference - "system", which follows the OS and
 * keeps following it - but the old toggle could only ever commit an explicit
 * light or dark. A user who touched it once could never get back to following
 * their OS. That was a capability the app already had and could not offer.
 */
export default function ThemeToggle({
  className = "text-fg-muted hover:bg-surface-muted hover:text-fg",
  compact = false,
}: ThemeToggleProps) {
  const { preference, resolvedTheme, setPreference } = useTheme();

  const active = OPTIONS.find((option) => option.value === preference) ?? OPTIONS[2];

  // The trigger shows what is currently APPLIED, so "System" still reads as a
  // sun or a moon rather than leaving the user to work out which way it fell.
  const TriggerIcon =
    preference === "system" ? (resolvedTheme === "dark" ? Moon : Sun) : active.icon;

  return (
    <DropdownMenu
      label={`Theme: ${active.label}. Change theme`}
      align={compact ? "end" : "start"}
      className={cn(
        "text-sm font-semibold",
        compact ? "h-10 w-10" : "w-full justify-between gap-2 px-4 py-2.5",
        className,
      )}
      trigger={
        compact ? (
          <TriggerIcon size={18} aria-hidden="true" />
        ) : (
          <>
            <span className="flex items-center gap-2">
              <TriggerIcon size={18} aria-hidden="true" />
              {active.label}
            </span>
            <ChevronDown size={15} aria-hidden="true" />
          </>
        )
      }
      items={OPTIONS.map((option) => ({
        key: option.value,
        label: option.label,
        icon: <option.icon size={16} aria-hidden="true" />,
        checked: preference === option.value,
        // A tick as well as aria-checked: the selected option must be
        // readable without relying on the focus ring happening to land there.
        trailing:
          preference === option.value ? (
            <Check size={15} className="text-primary" aria-hidden="true" />
          ) : undefined,
        onSelect: () => setPreference(option.value),
      }))}
    />
  );
}
