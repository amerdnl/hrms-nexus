import type { InputHTMLAttributes } from "react";
import { fieldClass } from "./fieldStyles";

export interface TextInputProps
  extends InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
}

export default function TextInput({
  invalid = false,
  className,
  ...rest
}: TextInputProps) {
  return (
    <input
      className={fieldClass(invalid, className)}
      aria-invalid={invalid || undefined}
      {...rest}
    />
  );
}
