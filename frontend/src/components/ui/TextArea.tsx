import type { TextareaHTMLAttributes } from "react";
import { fieldClass } from "./fieldStyles";

export interface TextAreaProps
  extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean;
}

export default function TextArea({
  invalid = false,
  className,
  rows = 4,
  ...rest
}: TextAreaProps) {
  return (
    <textarea
      rows={rows}
      className={fieldClass(invalid, `resize-y ${className ?? ""}`.trim())}
      aria-invalid={invalid || undefined}
      {...rest}
    />
  );
}
