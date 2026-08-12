import {
  CircleCheck,
  CircleX,
  Info,
  TriangleAlert,
  X,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "../../utils/cn";

export type AlertTone = "success" | "danger" | "warning" | "info";

interface AlertProps {
  tone: AlertTone;
  title?: string;
  children: ReactNode;
  onDismiss?: () => void;
  className?: string;
}

const toneStyles: Record<AlertTone, string> = {
  success: "border-success/30 bg-success-soft text-success-fg",
  danger: "border-danger/30 bg-danger-soft text-danger-fg",
  warning: "border-warning/30 bg-warning-soft text-warning-fg",
  info: "border-info/30 bg-info-soft text-info-fg",
};

const toneIcons: Record<AlertTone, LucideIcon> = {
  success: CircleCheck,
  danger: CircleX,
  warning: TriangleAlert,
  info: Info,
};

export default function Alert({
  tone,
  title,
  children,
  onDismiss,
  className,
}: AlertProps) {
  const Icon = toneIcons[tone];

  // Errors and warnings interrupt; confirmations and info do not. Using
  // role="alert" for everything would make routine success messages
  // preempt whatever a screen reader user is currently hearing.
  const isUrgent = tone === "danger" || tone === "warning";

  return (
    <div
      role={isUrgent ? "alert" : "status"}
      className={cn(
        "flex items-start gap-3 rounded-lg border px-4 py-3 text-sm",
        toneStyles[tone],
        className,
      )}
    >
      {/* The icon differentiates tone for anyone who cannot distinguish the
          background colours; the text carries the actual meaning. */}
      <Icon size={18} className="mt-0.5 shrink-0" aria-hidden="true" />

      <div className="min-w-0 flex-1">
        {title && <p className="font-semibold">{title}</p>}
        <div className={cn(title && "mt-0.5")}>{children}</div>
      </div>

      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          className="-mr-1 -mt-1 shrink-0 rounded p-1 opacity-70 transition-opacity hover:opacity-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          aria-label="Dismiss message"
        >
          <X size={16} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
