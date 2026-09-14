import { Link } from "react-router-dom";

/**
 * The HR Nexus network mark - five people joined through one centre - drawn
 * as an inline SVG rather than the PNG the sign-in screen uses, so it stays
 * crisp at header size and takes its colour from the theme: deep teal on the
 * light canvas, soft aqua on navy.
 */
export function BrandGlyph({ className }: { className?: string }) {
  const nodes = [
    [16, 5.2],
    [26.9, 13.1],
    [22.7, 25.9],
    [9.3, 25.9],
    [5.1, 13.1],
  ];
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true" focusable="false">
      <g className="fill-[#0e4a44] stroke-[#0e4a44] dark:fill-[#7fd3bf] dark:stroke-[#7fd3bf]">
        {nodes.map(([x, y]) => (
          <line key={`l${x}`} x1="16" y1="16.4" x2={x} y2={y} strokeWidth="2.6" strokeLinecap="round" />
        ))}
        <circle cx="16" cy="16.4" r="4.1" className="fill-canvas" strokeWidth="2.6" />
        {nodes.map(([x, y]) => (
          <circle key={`c${x}`} cx={x} cy={y} r="3.3" stroke="none" />
        ))}
      </g>
    </svg>
  );
}

/** The header identity: mark and letterspaced wordmark, one link home. */
export default function BrandMark({ homePath }: { homePath: string }) {
  return (
    <Link
      to={homePath}
      aria-label="HR Nexus home"
      className="flex shrink-0 items-center gap-3 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring lg:gap-4"
    >
      <BrandGlyph className="size-8 shrink-0" />
      <span className="whitespace-nowrap text-[0.9375rem] font-semibold tracking-[0.28em] text-fg lg:text-[1.0625rem]">
        HR NEXUS
      </span>
    </Link>
  );
}
