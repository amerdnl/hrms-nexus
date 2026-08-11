import type { LucideIcon } from "lucide-react";
import { useId } from "react";
import { cn } from "../../utils/cn";
import type { StatusTone } from "../../utils/status";

export interface DonutSegment {
  key: string;
  label: string;
  value: number;
  tone: StatusTone;
  /** Second, non-colour cue in the legend. Usually from a *StatusMeta helper. */
  icon?: LucideIcon;
}

interface DonutChartProps {
  segments: DonutSegment[];
  /** Screen-reader name for the whole figure. */
  title: string;
  /** Small text under the total in the middle of the ring. */
  centerCaption?: string;
  size?: number;
  thickness?: number;
  className?: string;
}

/**
 * Colour policy lives here rather than in consumers so every chart in the app
 * agrees. These are the runtime tokens, not hex, so the ring recolours on a
 * theme switch with no JavaScript involved.
 */
const toneVars: Record<StatusTone, string> = {
  success: "var(--success)",
  warning: "var(--warning)",
  danger: "var(--danger)",
  info: "var(--info)",
  primary: "var(--primary)",
  neutral: "var(--fg-subtle)",
};

/**
 * A donut built from one <circle> per segment using stroke-dasharray, with no
 * charting dependency.
 *
 * The ring is decoration: the legend below it carries label, count and
 * percentage as real text, and each row adds an icon, so the chart is fully
 * readable without perceiving colour at all.
 */
export default function DonutChart({
  segments,
  title,
  centerCaption,
  size = 168,
  thickness = 22,
  className,
}: DonutChartProps) {
  const id = useId();
  const titleId = `${id}-title`;
  const descriptionId = `${id}-desc`;

  const total = segments.reduce((sum, segment) => sum + segment.value, 0);

  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;
  const center = size / 2;

  const toPercent = (value: number) =>
    total > 0 ? Math.round((value / total) * 100) : 0;

  // Running offset walks each arc around the ring. Zero-valued segments are
  // skipped so they cannot emit a hairline at their start angle.
  let consumed = 0;
  const arcs = segments
    .filter((segment) => segment.value > 0)
    .map((segment) => {
      const dash = (segment.value / total) * circumference;
      const arc = {
        key: segment.key,
        dash,
        offset: consumed,
        color: toneVars[segment.tone],
      };

      consumed += dash;
      return arc;
    });

  const description =
    total > 0
      ? segments
          .map(
            (segment) =>
              `${segment.label}: ${segment.value} (${toPercent(segment.value)}%)`,
          )
          .join(", ")
      : "No records to chart.";

  return (
    <div
      className={cn(
        "flex flex-col items-center gap-6 sm:flex-row sm:items-center",
        className,
      )}
    >
      <div
        className="relative shrink-0"
        style={{ width: size, height: size }}
      >
        <svg
          viewBox={`0 0 ${size} ${size}`}
          width={size}
          height={size}
          role="img"
          aria-labelledby={`${titleId} ${descriptionId}`}
        >
          <title id={titleId}>{title}</title>
          <desc id={descriptionId}>{description}</desc>

          {/* -90deg so the first segment starts at 12 o'clock rather than 3. */}
          <g transform={`rotate(-90 ${center} ${center})`}>
            {/* Track. Also what makes a zero dataset render a ring instead of
                an empty box. */}
            <circle
              cx={center}
              cy={center}
              r={radius}
              fill="none"
              stroke="var(--line)"
              strokeWidth={thickness}
            />

            {arcs.map((arc) => (
              <circle
                key={arc.key}
                cx={center}
                cy={center}
                r={radius}
                fill="none"
                stroke={arc.color}
                strokeWidth={thickness}
                strokeDasharray={`${arc.dash} ${circumference - arc.dash}`}
                strokeDashoffset={-arc.offset}
              />
            ))}
          </g>
        </svg>

        <div
          className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center"
          aria-hidden="true"
        >
          <span className="text-3xl font-bold tracking-tight text-fg">
            {total}
          </span>
          {centerCaption && (
            <span className="mt-0.5 text-xs text-fg-subtle">
              {centerCaption}
            </span>
          )}
        </div>
      </div>

      <ul className="w-full min-w-0 flex-1 space-y-2.5">
        {segments.map((segment) => {
          const Icon = segment.icon;

          return (
            <li
              key={segment.key}
              className="flex items-center gap-2.5 text-sm"
            >
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: toneVars[segment.tone] }}
                aria-hidden="true"
              />

              {Icon && (
                <Icon
                  size={14}
                  className="shrink-0 text-fg-subtle"
                  aria-hidden="true"
                />
              )}

              <span className="min-w-0 flex-1 truncate text-fg-muted">
                {segment.label}
              </span>

              <span className="shrink-0 font-semibold text-fg">
                {segment.value}
              </span>

              <span className="w-10 shrink-0 text-right text-xs tabular-nums text-fg-subtle">
                {toPercent(segment.value)}%
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
