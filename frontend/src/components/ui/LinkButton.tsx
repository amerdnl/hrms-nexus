import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Link, type LinkProps } from "react-router-dom";
import {
  buttonClass,
  type ButtonSize,
  type ButtonVariant,
} from "./buttonStyles";

interface LinkButtonProps extends Omit<LinkProps, "className"> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: LucideIcon;
  fullWidth?: boolean;
  /** Anchors have no disabled state, so this is emulated - see below. */
  disabled?: boolean;
  className?: string;
  children?: ReactNode;
}

export default function LinkButton({
  variant = "primary",
  size = "md",
  icon: Icon,
  fullWidth = false,
  disabled = false,
  className,
  children,
  to,
  onClick,
  ...rest
}: LinkButtonProps) {
  return (
    <Link
      {...rest}
      // A disabled anchor is not a real state. Removing it from the tab order
      // and marking aria-disabled is the accessible equivalent; the click
      // handler blocks navigation for pointer and keyboard alike.
      to={disabled ? "#" : to}
      className={buttonClass(variant, size, fullWidth, className)}
      aria-disabled={disabled || undefined}
      tabIndex={disabled ? -1 : undefined}
      onClick={(event) => {
        if (disabled) {
          event.preventDefault();
          return;
        }

        onClick?.(event);
      }}
    >
      {Icon && <Icon size={size === "sm" ? 14 : 16} aria-hidden="true" />}
      {children}
    </Link>
  );
}
