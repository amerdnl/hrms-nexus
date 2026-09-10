import { cn } from "../../utils/cn";

/**
 * A single shimmering placeholder block.
 *
 * Deliberately NOT announced. A skeleton is a visual promise that content is
 * coming; the region that owns it is responsible for the accessible story via
 * aria-busy and a live message, so a screen reader hears "Loading employees"
 * once rather than a dozen anonymous boxes. SkeletonText below does the same
 * for multi-line placeholders.
 */
export default function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "animate-pulse rounded-md bg-surface-muted motion-reduce:animate-none",
        className,
      )}
    />
  );
}

/** Several lines of placeholder text, the last one short like real prose. */
export function SkeletonText({
  lines = 3,
  className,
}: {
  lines?: number;
  className?: string;
}) {
  return (
    <div className={cn("space-y-2", className)} aria-hidden="true">
      {Array.from({ length: lines }, (_, index) => (
        <Skeleton
          key={index}
          className={cn("h-3.5", index === lines - 1 ? "w-2/3" : "w-full")}
        />
      ))}
    </div>
  );
}
