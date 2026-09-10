import type { InputHTMLAttributes, Ref } from "react";
import { cn } from "../../utils/cn";

interface FileInputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  invalid?: boolean;
  /**
   * React 19 accepts ref as a plain prop. Needed because a file input cannot
   * be cleared through value, so callers reset it through the element.
   */
  ref?: Ref<HTMLInputElement>;
}

/**
 * A native file input with the button half styled to match Button's primary
 * variant.
 *
 * `file:text-primary-fg` rather than a literal white: the fill is a themed
 * token, and pinning the label white measured about 3.7:1 against the dark
 * theme's primary. The two move together now.
 *
 * Left as a real <input type="file"> rather than a hidden input behind a
 * styled button, because the native control is what gives keyboard users the
 * file picker and screen readers the "no file selected" state for free.
 */
export default function FileInput({
  invalid = false,
  className,
  ref,
  ...rest
}: FileInputProps) {
  return (
    <input
      ref={ref}
      type="file"
      aria-invalid={invalid || undefined}
      className={cn(
        "block w-full cursor-pointer rounded-lg border bg-surface px-3 py-2 text-sm text-fg",
        invalid ? "border-danger" : "border-control-border",
        "file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-1.5",
        "file:text-sm file:font-semibold file:text-primary-fg",
        "hover:file:bg-primary-hover",
        "disabled:cursor-not-allowed disabled:opacity-60",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        className,
      )}
      {...rest}
    />
  );
}
