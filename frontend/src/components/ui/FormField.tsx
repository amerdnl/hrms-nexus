import type { ReactNode } from "react";
import { cn } from "../../utils/cn";

interface FormFieldProps {
  /**
   * Must match the id on the control inside. Kept explicit rather than
   * injected via cloneElement so the wiring stays greppable.
   */
  id: string;
  label: string;
  required?: boolean;
  hint?: string;
  error?: string;
  className?: string;
  children: ReactNode;
}

export default function FormField({
  id,
  label,
  required = false,
  hint,
  error,
  className,
  children,
}: FormFieldProps) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label
        htmlFor={id}
        className="text-sm font-medium text-fg-muted"
      >
        {label}
        {required && (
          <>
            {/* The asterisk is decorative; the real signal is the word
                "required", which only assistive tech reads. */}
            <span aria-hidden="true" className="ml-0.5 text-danger">
              *
            </span>
            <span className="sr-only"> (required)</span>
          </>
        )}
      </label>

      {children}

      {hint && !error && (
        <p id={`${id}-hint`} className="text-xs text-fg-subtle">
          {hint}
        </p>
      )}

      {error && (
        // role="alert" so a validation message that appears after submit is
        // announced rather than silently rendered.
        <p
          id={`${id}-error`}
          role="alert"
          className="text-xs font-medium text-danger-fg"
        >
          {error}
        </p>
      )}
    </div>
  );
}
