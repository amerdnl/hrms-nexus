import type { ReactNode, SelectHTMLAttributes } from "react";
import { fieldClass } from "./fieldStyles";

export interface SelectInputProps
  extends SelectHTMLAttributes<HTMLSelectElement> {
  invalid?: boolean;
  children: ReactNode;
}

export default function SelectInput({
  invalid = false,
  className,
  children,
  ...rest
}: SelectInputProps) {
  return (
    <select
      // pr-9 leaves room for the native chevron; appearance is left alone so
      // the control keeps its platform affordance and colour-scheme handling.
      className={fieldClass(invalid, `pr-9 ${className ?? ""}`.trim())}
      aria-invalid={invalid || undefined}
      {...rest}
    >
      {children}
    </select>
  );
}
