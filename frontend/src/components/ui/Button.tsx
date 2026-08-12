import { LoaderCircle, type LucideIcon } from "lucide-react";
import type { ButtonHTMLAttributes, ReactNode, Ref } from "react";
import {
  buttonClass,
  type ButtonSize,
  type ButtonVariant,
} from "./buttonStyles";

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: LucideIcon;
  fullWidth?: boolean;
  /** Shows a spinner and blocks interaction. */
  isLoading?: boolean;
  /** Replaces the label while loading, e.g. "Saving...". */
  loadingLabel?: string;
  /** React 19 accepts ref as a plain prop; used to focus Cancel on dialog open. */
  ref?: Ref<HTMLButtonElement>;
  children?: ReactNode;
}

export default function Button({
  variant = "primary",
  size = "md",
  icon: Icon,
  fullWidth = false,
  isLoading = false,
  loadingLabel,
  disabled,
  className,
  children,
  // Defaulted because a <button> inside a <form> submits by default, and most
  // buttons in this app are actions rather than submits. Callers that want a
  // submit pass type="submit" explicitly.
  type = "button",
  ...rest
}: ButtonProps) {
  const isDisabled = disabled === true || isLoading;

  return (
    <button
      type={type}
      className={buttonClass(variant, size, fullWidth, className)}
      disabled={isDisabled}
      // Communicates the pending state to assistive tech, which `disabled`
      // alone does not.
      aria-busy={isLoading || undefined}
      {...rest}
    >
      {isLoading ? (
        <LoaderCircle
          size={size === "sm" ? 14 : 16}
          className="animate-spin"
          aria-hidden="true"
        />
      ) : (
        Icon && <Icon size={size === "sm" ? 14 : 16} aria-hidden="true" />
      )}
      {isLoading && loadingLabel ? loadingLabel : children}
    </button>
  );
}
