/**
 * Joins class name fragments, dropping falsy ones.
 *
 * Deliberately not clsx/tailwind-merge: every variant in this design system is
 * a closed set resolved through a lookup map, so there are no class conflicts
 * to merge. `className` on the primitives is append-only.
 */
export function cn(
  ...parts: Array<string | false | null | undefined>
): string {
  return parts.filter(Boolean).join(" ");
}
