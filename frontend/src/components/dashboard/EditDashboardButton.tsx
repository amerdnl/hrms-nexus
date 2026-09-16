import { LayoutDashboard } from "lucide-react";

/**
 * Home's entry to personalization, beside the primary action. The same height
 * as the split action so the greeting keeps its line; icon-only on a phone, where
 * the two would otherwise wrap.
 */
export default function EditDashboardButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Edit dashboard"
      className="ml-3 inline-flex h-11 items-center gap-2 rounded-full border border-control-border bg-surface/85 px-3.5 text-sm font-medium text-fg-muted shadow-card backdrop-blur transition-colors hover:bg-surface hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring motion-reduce:transition-none sm:px-4"
    >
      <LayoutDashboard size={16} aria-hidden="true" />
      <span className="max-sm:sr-only">Edit dashboard</span>
    </button>
  );
}
