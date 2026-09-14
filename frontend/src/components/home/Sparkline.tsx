import { useId } from "react";

/**
 * A soft area sparkline for a short series of real counts. Decorative next to
 * the figure it belongs to: the caller states the series in text, and this is
 * hidden from assistive tech.
 */
export default function Sparkline({ values, width = 116, height = 56 }: { values: number[]; width?: number; height?: number }) {
  const id = useId();
  if (values.length < 2) return null;
  const max = Math.max(1, ...values);
  const step = width / (values.length - 1);
  const points = values.map((value, index) => [index * step, height - 4 - (value / max) * (height - 12)] as const);
  // Smooth with midpoint quadratic curves, so a series of small integers reads as a trend, not a staircase.
  let line = `M${points[0][0]},${points[0][1]}`;
  for (let index = 1; index < points.length; index += 1) {
    const [x0, y0] = points[index - 1];
    const [x1, y1] = points[index];
    const mx = (x0 + x1) / 2;
    line += ` C${mx},${y0} ${mx},${y1} ${x1},${y1}`;
  }
  const area = `${line} L${width},${height} L0,${height} Z`;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={`${id}-fill`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.28" />
          <stop offset="100%" stopColor="var(--primary)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${id}-fill)`} />
      <path d={line} fill="none" stroke="var(--primary)" strokeOpacity="0.35" strokeWidth="1.5" />
    </svg>
  );
}
