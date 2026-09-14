import { ArrowRight, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import type { Tint } from "../../routes/navigation";
import { cn } from "../../utils/cn";
import { tintStyles } from "../ui/tint";

interface KpiCardProps {
  icon: LucideIcon;
  tint: Tint;
  label: string;
  value: ReactNode;
  /** The line under the figure. Always a real fact about the same figure. */
  detail?: ReactNode;
  /** Makes the whole card a link to where the figure comes from. */
  to?: string;
  /** Shows the reference's trailing arrow on a linked card. */
  showArrow?: boolean;
  /** A small visual at the lower right, e.g. the joiners sparkline. */
  aside?: ReactNode;
  isLoading?: boolean;
  className?: string;
}

/**
 * One figure in Home's KPI row: a tinted icon tile, the label above the
 * figure, and a fact beneath it.
 *
 * Laid out by the card's own width (@container) rather than the viewport,
 * because the same card sits four across on a laptop and two across on a
 * phone. Three steps, chosen so the four cards of one row always land on the
 * same step:
 *   - under 9.5rem (two across on a phone): the tile stacks above the text;
 *   - from 9.5rem: tile beside the text, as the reference;
 *   - from 14rem: the reference's large tile, trailing arrow and sparkline.
 */
export default function KpiCard({
  icon: Icon,
  tint,
  label,
  value,
  detail,
  to,
  showArrow = false,
  aside,
  isLoading = false,
  className,
}: KpiCardProps) {
  const body = (
    <div className="@container h-full">
      <div className="relative flex h-full flex-col gap-3 @min-[9.5rem]:flex-row @min-[9.5rem]:items-start @min-[9.5rem]:gap-3.5 @min-[14rem]:gap-4">
        <span
          className={cn("grid size-10 shrink-0 place-items-center rounded-xl @min-[14rem]:size-[3.375rem] @min-[14rem]:rounded-[0.875rem]", tintStyles[tint])}
          aria-hidden="true"
        >
          <Icon className="size-[1.125rem] @min-[14rem]:size-[1.375rem]" />
        </span>
        <div className="relative min-w-0 flex-1">
          <p className="text-[0.8125rem] leading-5 text-fg-muted @min-[9.5rem]:truncate">{label}</p>
          <p className="mt-1 whitespace-nowrap text-[1.5rem] font-semibold leading-8 tracking-tight text-fg tabular-nums @min-[14rem]:text-[1.75rem]">
            {isLoading ? <span className="text-fg-subtle">&mdash;</span> : value}
          </p>
          {detail && !isLoading && <div className="mt-1.5 text-[0.8125rem] leading-5 text-fg-muted @min-[9.5rem]:truncate">{detail}</div>}
        </div>
        {aside && !isLoading && (
          <div className="pointer-events-none absolute -bottom-1 right-0 hidden @min-[15rem]:block">{aside}</div>
        )}
        {to && showArrow && (
          <ArrowRight size={18} className="hidden self-center text-fg-subtle @min-[14rem]:block" aria-hidden="true" />
        )}
      </div>
    </div>
  );

  const shell = cn(
    "block rounded-card border border-line bg-surface p-4 shadow-card sm:px-[1.375rem] sm:py-5",
    className,
  );

  if (to) {
    return (
      <Link
        to={to}
        className={cn(shell, "transition-shadow hover:shadow-raised focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring")}
      >
        {body}
      </Link>
    );
  }
  return <div className={shell}>{body}</div>;
}
