import type { Tint } from "../../routes/navigation";

/**
 * The pale tile and its glyph colour for each tint token. Both come from
 * index.css, so a tile follows the theme and every pair is already measured.
 */
export const tintStyles: Record<Tint, string> = {
  teal: "bg-tint-teal text-tint-teal-fg",
  blue: "bg-tint-blue text-tint-blue-fg",
  violet: "bg-tint-violet text-tint-violet-fg",
  green: "bg-tint-green text-tint-green-fg",
  amber: "bg-tint-amber text-tint-amber-fg",
  rose: "bg-tint-rose text-tint-rose-fg",
  sky: "bg-tint-sky text-tint-sky-fg",
  slate: "bg-tint-slate text-tint-slate-fg",
};
