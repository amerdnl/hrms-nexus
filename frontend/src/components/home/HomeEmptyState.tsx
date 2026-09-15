import { ArrowRight, type LucideIcon } from "lucide-react";
import { Link } from "react-router-dom";
import type { Tint } from "../../routes/navigation";
import { cn } from "../../utils/cn";
import { tintStyles } from "../ui/tint";

/**
 * The shared empty state for Home cards: a tinted tile, a short title, one
 * sentence of real context and, where there is something useful to do, a real
 * link. Centred in whatever space the card has, so a card with nothing to list
 * still reads as finished rather than as a sentence stranded at the top.
 *
 * It never invents content: the description states a fact about the account
 * (or what will appear), and the link opens an existing page.
 */
export default function HomeEmptyState({ icon: Icon, tint = "slate", title, description, action, className }: {
  icon: LucideIcon;
  tint?: Tint;
  title: string;
  description?: string;
  action?: { label: string; to: string };
  className?: string;
}) {
  return (
    <div className={cn("flex flex-1 flex-col items-center justify-center px-2 py-4 text-center", className)}>
      <span className={cn("grid size-11 place-items-center rounded-[0.875rem]", tintStyles[tint])} aria-hidden="true">
        <Icon size={20} strokeWidth={2.2} />
      </span>
      <p className="mt-3 text-sm font-medium text-fg">{title}</p>
      {description && <p className="mt-1 max-w-[18rem] text-[0.8125rem] leading-5 text-fg-muted">{description}</p>}
      {action && (
        <Link
          to={action.to}
          className="mt-3 inline-flex min-h-8 items-center gap-1.5 rounded-md text-[0.8125rem] font-medium text-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          {action.label}
          <ArrowRight size={14} aria-hidden="true" />
        </Link>
      )}
    </div>
  );
}
