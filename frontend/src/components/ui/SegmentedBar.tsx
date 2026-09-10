import type { LucideIcon } from "lucide-react";
import { cn } from "../../utils/cn";
import type { StatusTone } from "../../utils/status";

export interface BarSegment {
  key: string;
  label: string;
  value: number;
  tone: StatusTone;
  /** Second, non-colour cue in the legend. Usually from a *StatusMeta helper. */
  icon?: LucideIcon;
}

interface SegmentedBarProps {
  segments: BarSegment[];
  /** Screen-reader name for the whole figure. */
  title: string;
  /** Word for what is being counted, e.g. "records". */
  unit?: string;
  className?: string;
}

/**
 * Colour policy matches DonutChart so a status reads the same in either.
 * These are runtime tokens, not hex, so the bar recolours on a theme switch
 * with no JavaScript.
 */
const toneVars: Record<StatusTone, string> = {
  success: "var(--success)",
  warning: "var(--warning)",
  danger: "var(--danger)",
  info: "var(--info)",
  primary: "var(--primary)",
  neutral: "var(--fg-subtle)",
};

const toneText: Record<StatusTone, string> = {
  success: "text-success-fg",
  warning: "text-warning-fg",
  danger: "text-danger-fg",
  info: "text-info-fg",
  primary: "text-primary",
  neutral: "text-fg-muted",
};

/**
 * One horizontal bar split by status, with a text legend beneath.
 *
 * A sibling of DonutChart rather than a replacement: a ring suits a square
 * card and a bar suits a wide one, and both are already in use. DonutChart
 * still serves the attendance page. Whether the two converge is a later
 * decision; they share the tone map above so they cannot disagree meanwhile.
 *
 * The bar itself is decoration. The legend carries label, count and
 * percentage as real text with an icon per row, so the figure is fully
 * readable without perceiving colour at all.
 */
export default function SegmentedBar({
  segments,
  title,
  unit = "records",
  className,
}: SegmentedBarProps) {
  const total = segments.reduce((sum, segment) => sum + segment.value, 0);

  return (
    <figure className={cn("m-0", className)}>
      <figcaption className="sr-only">{title}</figcaption>

      <div className="flex items-baseline justify-between gap-3">
        <p className="text-2xl font-bold tracking-tight text-fg">{total}</p>
        <p className="text-xs text-fg-subtle">{unit}</p>
      </div>

      <div
        className="mt-3 flex h-3 w-full overflow-hidden rounded-full bg-surface-muted"
        aria-hidden="true"
      >
        {total > 0 &&
          segments
            .filter((segment) => segment.value > 0)
            .map((segment) => (
              <div
                key={segment.key}
                style={{
                  width: `${(segment.value / total) * 100}%`,
                  backgroundColor: toneVars[segment.tone],
                }}
              />
            ))}
      </div>

      <ul className="mt-4 space-y-2">
        {segments.map((segment) => {
          const share = total > 0 ? Math.round((segment.value / total) * 100) : 0;
          const Icon = segment.icon;

          return (
            <li
              key={segment.key}
              className="flex items-center justify-between gap-3 text-sm"
            >
              <span className="flex min-w-0 items-center gap-2">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: toneVars[segment.tone] }}
                  aria-hidden="true"
                />
                {Icon && (
                  <Icon
                    size={14}
                    className={cn("shrink-0", toneText[segment.tone])}
                    aria-hidden="true"
                  />
                )}
                <span className="truncate text-fg-muted">{segment.label}</span>
              </span>

              <span className="shrink-0 tabular-nums">
                <span className="font-semibold text-fg">{segment.value}</span>{" "}
                <span className="text-xs text-fg-subtle">({share}%)</span>
              </span>
            </li>
          );
        })}
      </ul>
    </figure>
  );
}
