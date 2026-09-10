import { useEffect, useState } from "react";
import { cn } from "../../utils/cn";
import { getInitials } from "../../utils/name";

export type AvatarSize = "sm" | "md" | "lg" | "xl";

const sizeStyles: Record<AvatarSize, string> = {
  sm: "h-8 w-8 text-xs",
  md: "h-10 w-10 text-sm",
  lg: "h-12 w-12 text-base",
  xl: "h-20 w-20 text-xl",
};

interface AvatarProps {
  name: string;
  /** Already resolved to an absolute URL by resolveProfileImageUrl. */
  src?: string | null;
  size?: AvatarSize;
  className?: string;
}

export default function Avatar({
  name,
  src,
  size = "md",
  className,
}: AvatarProps) {
  const [hasFailed, setHasFailed] = useState(false);

  // A new src deserves a fresh attempt; without this a single failure would
  // stick to the component for the rest of its life.
  useEffect(() => setHasFailed(false), [src]);

  const shared = cn("shrink-0 rounded-full object-cover", sizeStyles[size], className);

  if (src && !hasFailed) {
    return (
      // alt="" throughout: an avatar always sits beside the person's name as
      // real text, so naming it would read the name out twice.
      <img src={src} alt="" className={shared} onError={() => setHasFailed(true)} />
    );
  }

  return (
    <span
      aria-hidden="true"
      className={cn(
        shared,
        "grid place-items-center bg-primary font-bold text-primary-fg",
      )}
    >
      {getInitials(name)}
    </span>
  );
}
