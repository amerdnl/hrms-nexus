import type { LucideIcon } from "lucide-react";
import { cn } from "../../utils/cn";
import type { StatusTone } from "../../utils/status";

interface StatusBadgeProps {
  label: string;
  tone: StatusTone;
  /** Usually supplied from the *StatusMeta helpers in utils/status.ts. */
  icon?: LucideIcon;
  className?: string;
}

const toneStyles: Record<StatusTone, string> = {
  success: "bg-success-soft text-success-fg",
  warning: "bg-warning-soft text-warning-fg",
  danger: "bg-danger-soft text-danger-fg",
  info: "bg-info-soft text-info-fg",
  primary: "bg-primary-soft text-primary",
  neutral: "bg-surface-muted text-fg-muted",
};

export default function StatusBadge({
  label,
  tone,
  icon: Icon,
  className,
}: StatusBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold",
        toneStyles[tone],
        className,
      )}
    >
      {/* Colour is never the only signal: the label is always rendered as
          text, and the icon gives a second non-colour cue. */}
      {Icon && <Icon size={13} aria-hidden="true" />}
      {label}
    </span>
  );
}
