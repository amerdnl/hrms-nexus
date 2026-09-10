import type { InputHTMLAttributes, ReactNode } from "react";
import { useId } from "react";
import { cn } from "../../utils/cn";

interface CheckboxProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  label: ReactNode;
  /** Secondary line under the label, e.g. what the option actually does. */
  description?: ReactNode;
  className?: string;
}

/**
 * The five checkboxes in this app were hand-rolled and had drifted: three set
 * `text-primary`, which does nothing to a native checkbox, and one had no
 * focus ring at all. This is the one shape they now share.
 *
 * `accent-color` rather than a custom-drawn box, so the control keeps its
 * platform behaviour, its indeterminate rendering and its forced-colors
 * handling. min-h/w-5 gives a 20px box with the label extending the hit area
 * past the 24px AAA target for a pointer target within a sentence.
 */
export default function Checkbox({
  label,
  description,
  className,
  id,
  ...rest
}: CheckboxProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const descriptionId = description ? `${inputId}-description` : undefined;

  return (
    <div className={cn("flex items-start gap-3", className)}>
      <input
        id={inputId}
        type="checkbox"
        aria-describedby={descriptionId}
        className={cn(
          "mt-0.5 h-4 w-4 shrink-0 cursor-pointer rounded border-line-strong accent-primary",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
          "disabled:cursor-not-allowed disabled:opacity-60",
        )}
        {...rest}
      />

      <label htmlFor={inputId} className="cursor-pointer text-sm text-fg">
        {label}
        {description && (
          <span id={descriptionId} className="block text-xs text-fg-muted">
            {description}
          </span>
        )}
      </label>
    </div>
  );
}
