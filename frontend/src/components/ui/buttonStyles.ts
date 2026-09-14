import { cn } from "../../utils/cn";

export type ButtonVariant =
  | "primary"
  | "secondary"
  | "danger"
  | "ghost"
  | "danger-ghost"
  | "inverse";
export type ButtonSize = "sm" | "md";

/**
 * Shared by Button and LinkButton so an anchor and a button that look alike
 * cannot drift apart.
 *
 * Focus uses `outline` rather than `ring`: outline is drawn outside the box
 * and needs no offset colour, so the ring stays visible on any surface
 * (card, canvas, header) without per-context tuning.
 */
const base = cn(
  "inline-flex items-center justify-center gap-2 rounded-xl font-semibold",
  "transition-colors",
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
  "disabled:cursor-not-allowed disabled:opacity-60",
  // Mirrors :disabled for LinkButton, which cannot be natively disabled.
  "aria-disabled:cursor-not-allowed aria-disabled:opacity-60",
);

const variants: Record<ButtonVariant, string> = {
  primary: "bg-primary text-primary-fg hover:bg-primary-hover",
  // --control-border, not --line-strong: on a white card this button's fill
  // matches its background, so the border is the only thing that says it is a
  // control rather than text.
  secondary:
    "border border-control-border bg-surface text-fg-muted hover:bg-surface-muted hover:text-fg",
  danger:
    "bg-danger-solid text-danger-solid-fg hover:bg-danger-solid-hover",
  ghost: "text-fg-muted hover:bg-surface-muted hover:text-fg",
  // Low-emphasis destructive. Added because ProfilePage had to drop the
  // primitive entirely for "Remove photo": overriding ghost's text colour
  // would be a class conflict cn() cannot resolve without tailwind-merge,
  // so the honest fix is a variant rather than a bespoke button.
  "danger-ghost": "text-danger-fg hover:bg-danger-soft",
  // For a control sitting on photography, which is dark in both themes (the
  // Home editorial card). Fixed colours on purpose, like the image itself:
  // navy on white measures 17.35:1.
  inverse: "bg-white text-[#0b1b2e] shadow-card hover:bg-white/90",
};

/**
 * `pointer-coarse` rather than a breakpoint: the thing that decides whether a
 * target is big enough is the input device, not the viewport width. A phone in
 * landscape is still a finger, and a small window on a laptop is still a mouse.
 *
 * md reaches the 44px of WCAG 2.5.5 on touch. sm reaches 36px rather than 44:
 * it is the size used inside dense table rows, where 44px per control would
 * push the row past a phone screen, and 36 is comfortably clear of the 24px
 * that 2.5.8 requires at AA.
 */
const sizes: Record<ButtonSize, string> = {
  sm: "px-3 py-1.5 text-xs pointer-coarse:min-h-9",
  md: "px-4 py-2.5 text-sm pointer-coarse:min-h-11",
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
