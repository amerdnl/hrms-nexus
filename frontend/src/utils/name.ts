/**
 * Initials for a display name: first letter of the first two words.
 *
 * Lives in utils rather than beside Avatar so that component file exports only
 * components (fast refresh), and so the header, tables and avatar all
 * agree on what "AH" means.
 */
export function getInitials(name: string): string {
  return (
    name
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0])
      .join("")
      .toUpperCase() || "?"
  );
}
