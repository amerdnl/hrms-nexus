import { cn } from "../../utils/cn";
import type { StatusTone } from "../../utils/status";

interface ProgressBarProps {
  value: number;
  max?: number;
  tone?: StatusTone;
  /**
   * Accessible name. Required, because a bar with no name is an unlabelled
   * control; pass the same wording the visible figure beside it uses.
   */
  label: string;
  /**
   * Set when the numeric figure is ALREADY rendered as text next to the bar,
   * which is the usual case here (leave balances, headcount breakdowns). The
   * bar then becomes decoration and is hidden from assistive tech rather than
   * announcing the same number twice.
   */
  isDecorative?: boolean;
  size?: "sm" | "md";
  className?: string;
}

const toneStyles: Record<StatusTone, string> = {
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
  info: "bg-info",
  primary: "bg-primary",
  neutral: "bg-fg-subtle",
};

export default function ProgressBar({
  value,
  max = 100,
  tone = "primary",
  label,
  isDecorative = false,
  size = "md",
  className,
}: ProgressBarProps) {
  // Clamped so a value beyond the maximum cannot overflow the track, which
  // happens with carried-forward leave.
  const safeMax = max > 0 ? max : 1;
  const percent = Math.max(0, Math.min(100, (value / safeMax) * 100));

  return (
    <div
      className={cn(
        "w-full overflow-hidden rounded-full bg-surface-muted",
        size === "sm" ? "h-1.5" : "h-2",
        className,
      )}
      {...(isDecorative
        ? { "aria-hidden": true }
        : {
            role: "progressbar",
            "aria-label": label,
            "aria-valuenow": Math.round(value),
            "aria-valuemin": 0,
            "aria-valuemax": Math.round(safeMax),
          })}
    >
      <div
        className={cn("h-full rounded-full transition-[width]", toneStyles[tone])}
        style={{ width: `${percent}%` }}
      />
    </div>
  );
}
