import { RotateCw, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "../../utils/cn";
import Button from "./Button";

interface ErrorStateProps {
  title?: string;
  description?: ReactNode;
  /** Wired to a retry when the caller has one; omitted when it cannot retry. */
  onRetry?: () => void;
  retryLabel?: string;
  className?: string;
}

/**
 * The counterpart to EmptyState for "this failed" rather than "there is
 * nothing here". The two are visually parallel on purpose, so a failed
 * section does not read as an empty one.
 *
 * role="alert" because this replaces content the user was waiting for.
 */
export default function ErrorState({
  title = "Something went wrong",
  description,
  onRetry,
  retryLabel = "Try again",
  className,
}: ErrorStateProps) {
  return (
    <div
      role="alert"
      className={cn(
        "flex flex-col items-center justify-center px-6 py-12 text-center",
        className,
      )}
    >
      <span
        className="mb-3 grid h-12 w-12 place-items-center rounded-full bg-danger-soft text-danger-fg"
        aria-hidden="true"
      >
        <TriangleAlert size={22} />
      </span>

      <p className="text-sm font-semibold text-fg">{title}</p>

      {description && (
        <p className="mt-1 max-w-sm text-sm text-fg-muted">{description}</p>
      )}

      {onRetry && (
        <Button variant="secondary" icon={RotateCw} onClick={onRetry} className="mt-4">
          {retryLabel}
        </Button>
      )}
    </div>
  );
}
