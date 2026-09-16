import { ArrowRight, type LucideIcon } from "lucide-react";
import { useId, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { cn } from "../../../utils/cn";
import HomeEmptyState from "../../home/HomeEmptyState";

/**
 * The card shell for widgets that have no default-Home card to reuse, in the
 * same language as those cards: title, a quiet aside, content, and a footer
 * link to the page the figures come from.
 */
export default function WidgetShell({ title, aside, footer, children, className }: {
  title: string;
  aside?: ReactNode;
  footer?: { label: string; to: string };
  children: ReactNode;
  className?: string;
}) {
  const titleId = useId();
  return (
    <section aria-labelledby={titleId} className={cn("flex h-full flex-col rounded-card border border-line bg-surface p-5 shadow-card sm:px-6 sm:pb-5 sm:pt-[1.375rem]", className)}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 id={titleId} className="text-[1.0625rem] font-semibold text-fg">{title}</h2>
        {aside && <p className="shrink-0 text-[0.8125rem] text-fg-subtle">{aside}</p>}
      </div>
      <div className="mt-3 flex flex-1 flex-col">{children}</div>
      {footer && (
        <div className="mt-3 flex justify-end">
          <Link to={footer.to} className="inline-flex min-h-8 items-center gap-2 rounded-md text-[0.8125rem] font-medium text-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
            {footer.label}
            <ArrowRight size={14} aria-hidden="true" />
          </Link>
        </div>
      )}
    </section>
  );
}

/** Loading rows that keep the card's shape; announced once as busy. */
export function WidgetLoading({ rows = 3 }: { rows?: number }) {
  return (
    <div aria-busy="true" className="space-y-3 pt-1">
      <span className="sr-only">Loading</span>
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} aria-hidden="true" className="h-8 animate-pulse rounded bg-surface-muted motion-reduce:animate-none" />
      ))}
    </div>
  );
}

export function WidgetFailed({ what }: { what: string }) {
  return <p className="text-sm text-fg-muted">{what} could not be loaded.</p>;
}

export function WidgetEmpty({ icon, title, description }: { icon: LucideIcon; title: string; description: string }) {
  return <HomeEmptyState icon={icon} tint="green" title={title} description={description} />;
}
