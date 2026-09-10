import { cn } from "../../utils/cn";

/**
 * One control surface shared by text, select, textarea and password inputs so
 * they line up when placed side by side in a grid.
 *
 * `bg-surface text-fg` is not decorative: native date/time/select controls
 * inherit the page's colour-scheme for their popup but NOT for the field
 * itself, so an unstyled input renders white-on-white in dark mode.
 */
const base = cn(
  "w-full rounded-lg border px-3 py-2.5 text-sm",
  // 44px on touch, per WCAG 2.5.5. Unchanged with a mouse, where the
  // current density is deliberate.
  "pointer-coarse:min-h-11",
  "bg-surface text-fg placeholder:text-fg-subtle",
  "transition-colors",
  // Deliberately NO `outline-none` here. In Tailwind v4 it sets
  // --tw-outline-style: none on the element, and `outline-2` resolves its
  // style from that same variable - so pairing them silently removes the
  // focus ring. The UA default outline only paints on :focus-visible, where
  // these rules override its colour and width anyway.
  "focus:border-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
  "disabled:cursor-not-allowed disabled:bg-surface-muted disabled:opacity-60",
);

export function fieldClass(invalid = false, className?: string): string {
  return cn(
    base,
    // Border carries the error, but never alone - FormField also renders the
    // message as text and sets aria-invalid.
    invalid ? "border-danger" : "border-line-strong",
    className,
  );
}

/**
 * Builds the aria-describedby value for a field, matching the ids FormField
 * renders. Callers pass the result to the input so hint and error text are
 * announced with the control.
 */
export function fieldDescribedBy(
  id: string,
  options: { hint?: boolean; error?: boolean } = {},
): string | undefined {
  const ids = [
    options.hint ? `${id}-hint` : null,
    options.error ? `${id}-error` : null,
  ].filter(Boolean);

  return ids.length > 0 ? ids.join(" ") : undefined;
}
