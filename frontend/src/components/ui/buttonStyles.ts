import { cn } from "../../utils/cn";

export type ButtonVariant =
  | "primary"
  | "secondary"
  | "danger"
  | "ghost"
  | "danger-ghost";
export type ButtonSize = "sm" | "md";

/**
 * Shared by Button and LinkButton so an anchor and a button that look alike
 * cannot drift apart.
 *
 * Focus uses `outline` rather than `ring`: outline is drawn outside the box
 * and needs no offset colour, so the ring stays visible on any surface
 * (card, canvas, sidebar) without per-context tuning.
 */
const base = cn(
  "inline-flex items-center justify-center gap-2 rounded-lg font-semibold",
  "transition-colors",
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
  "disabled:cursor-not-allowed disabled:opacity-60",
  // Mirrors :disabled for LinkButton, which cannot be natively disabled.
  "aria-disabled:cursor-not-allowed aria-disabled:opacity-60",
);

const variants: Record<ButtonVariant, string> = {
  primary: "bg-primary text-primary-fg hover:bg-primary-hover",
  secondary:
    "border border-line-strong bg-surface text-fg-muted hover:bg-surface-muted hover:text-fg",
  danger:
    "bg-danger-solid text-danger-solid-fg hover:bg-danger-solid-hover",
  ghost: "text-fg-muted hover:bg-surface-muted hover:text-fg",
  // Low-emphasis destructive. Added because ProfilePage had to drop the
  // primitive entirely for "Remove photo": overriding ghost's text colour
  // would be a class conflict cn() cannot resolve without tailwind-merge,
  // so the honest fix is a variant rather than a bespoke button.
  "danger-ghost": "text-danger-fg hover:bg-danger-soft",
};

const sizes: Record<ButtonSize, string> = {
  sm: "px-3 py-1.5 text-xs",
  md: "px-4 py-2.5 text-sm",
};

export function buttonClass(
  variant: ButtonVariant = "primary",
  size: ButtonSize = "md",
  fullWidth = false,
  className?: string,
): string {
  return cn(
    base,
    variants[variant],
    sizes[size],
    fullWidth && "w-full",
    className,
  );
}
