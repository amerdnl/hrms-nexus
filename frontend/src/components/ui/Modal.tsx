import { useEffect, useId, useRef, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { cn } from "../../utils/cn";

export type ModalTone = "primary" | "danger";
export type ModalSize = "sm" | "md" | "lg" | "xl";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  icon?: ReactNode;
  tone?: ModalTone;
  size?: ModalSize;
  /** Blocks Escape while an action is in flight, so a submit cannot be orphaned. */
  isDismissDisabled?: boolean;
  /** Receives focus on open. Defaults to the first focusable element. */
  initialFocusRef?: RefObject<HTMLElement | null>;
  footer?: ReactNode;
  children?: ReactNode;
}

const sizeStyles: Record<ModalSize, string> = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-2xl",
  xl: "max-w-4xl",
};

const toneStyles: Record<ModalTone, string> = {
  primary: "bg-primary-soft text-primary",
  danger: "bg-danger-soft text-danger-fg",
};

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "textarea:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(", ");

/**
 * Counts open modals rather than toggling a boolean, so closing one modal
 * while another is still open does not release the scroll lock early.
 */
let openModalCount = 0;

export default function Modal({
  isOpen,
  onClose,
  title,
  description,
  icon,
  tone = "primary",
  size = "md",
  isDismissDisabled = false,
  initialFocusRef,
  footer,
  children,
}: ModalProps) {
  // useId, not a hardcoded string: ProfilePage mounts two dialogs at once, and
  // duplicate ids would break aria-labelledby for both.
  const generatedId = useId();
  const titleId = `${generatedId}-title`;
  const descriptionId = `${generatedId}-description`;

  const dialogRef = useRef<HTMLDivElement>(null);

  // Escape handling. Kept as its own effect so it re-subscribes when
  // isDismissDisabled flips mid-flight.
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !isDismissDisabled) {
        onClose();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, isDismissDisabled, onClose]);

  // Focus management: move focus in on open, restore it on close.
  // `initialFocusRef` is listed as a dependency only because it is a stable
  // useRef object; the effect is really keyed on `isOpen`, so a re-render
  // mid-dialog cannot yank focus back to the top.
  useEffect(() => {
    if (!isOpen) return;

    const trigger = document.activeElement as HTMLElement | null;

    const target =
      initialFocusRef?.current ??
      dialogRef.current?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR) ??
      dialogRef.current;

    target?.focus();

    return () => {
      // Returning focus to whatever opened the dialog is what keeps keyboard
      // users from being dumped at the top of the document on close.
      if (trigger?.isConnected) {
        trigger.focus();
      }
    };
  }, [isOpen, initialFocusRef]);

  // Trap Tab inside the dialog.
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Tab" || !dialogRef.current) return;

      const focusable = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
      ).filter((element) => element.offsetParent !== null);

      if (focusable.length === 0) {
        event.preventDefault();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;

      if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  // Body scroll lock.
  useEffect(() => {
    if (!isOpen) return;

    openModalCount += 1;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      openModalCount -= 1;

      if (openModalCount === 0) {
        document.body.style.overflow = previousOverflow;
      }
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return createPortal(
    // Portalled to <body> so the overlay can never be clipped or re-stacked by
    // a transformed ancestor in the page tree.
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-backdrop px-4 py-6">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        className={cn(
          "max-h-full w-full overflow-y-auto rounded-2xl bg-elevated p-6 shadow-panel",
          sizeStyles[size],
        )}
      >
        {icon && (
          <div
            className={cn(
              "grid h-11 w-11 place-items-center rounded-full",
              toneStyles[tone],
            )}
            aria-hidden="true"
          >
            {icon}
          </div>
        )}

        <h2
          id={titleId}
          className={cn("text-xl font-bold text-fg", Boolean(icon) && "mt-4")}
        >
          {title}
        </h2>

        {description && (
          <p id={descriptionId} className="mt-2 text-sm text-fg-muted">
            {description}
          </p>
        )}

        {children}

        {footer && (
          <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
