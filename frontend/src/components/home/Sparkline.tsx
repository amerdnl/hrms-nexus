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
  const min = Math.min(...values);
  const step = width / (values.length - 1);
  const top = 6;
  const bottom = height - 6;
  // A flat series draws along the middle rather than pinned to an edge.
  const y = (value: number) => (max === min ? (top + bottom) / 2 : bottom - ((value - min) / (max - min)) * (bottom - top));
  const points = values.map((value, index) => [index * step, y(value)] as const);

  // Catmull-Rom through every point, clamped to the drawing box: a curve that
  // reads as a trend rather than a staircase, and never overshoots the figure.
  const clamp = (value: number) => Math.min(bottom, Math.max(top, value));
  let line = `M${points[0][0]},${points[0][1]}`;
  for (let index = 0; index < points.length - 1; index += 1) {
    const p0 = points[index - 1] ?? points[index];
    const p1 = points[index];
    const p2 = points[index + 1];
    const p3 = points[index + 2] ?? p2;
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, clamp(p1[1] + (p2[1] - p0[1]) / 6)];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, clamp(p2[1] - (p3[1] - p1[1]) / 6)];
    line += ` C${c1[0]},${c1[1]} ${c2[0]},${c2[1]} ${p2[0]},${p2[1]}`;
  }
  const area = `${line} L${width},${height} L0,${height} Z`;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={`${id}-fill`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.22" />
          <stop offset="100%" stopColor="var(--primary)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${id}-fill)`} />
      <path d={line} fill="none" stroke="var(--primary)" strokeOpacity="0.45" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
