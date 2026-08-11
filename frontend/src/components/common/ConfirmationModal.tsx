import { useRef, type ReactNode } from "react";
import Button from "../ui/Button";
import Modal from "../ui/Modal";
import SecondaryButton from "../ui/SecondaryButton";

/**
 * Prop signature is unchanged from the pre-Modal implementation. All existing
 * consumers (LogoutConfirmationModal, ProfilePage's remove-photo dialog) keep
 * working without edits.
 */
interface ConfirmationModalProps {
  isOpen: boolean;
  isProcessing: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  processingLabel: string;
  icon?: ReactNode;
  onCancel: () => void;
  onConfirm: () => void;
}

export default function ConfirmationModal({
  isOpen,
  isProcessing,
  title,
  description,
  confirmLabel,
  processingLabel,
  icon,
  onCancel,
  onConfirm,
}: ConfirmationModalProps) {
  // Preserves the original behaviour of focusing Cancel rather than Confirm:
  // for a destructive dialog the safe action should be under the cursor.
  const cancelButtonRef = useRef<HTMLButtonElement>(null);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onCancel}
      title={title}
      description={description}
      icon={icon}
      tone="danger"
      size="md"
      // Matches the original guard: Escape was ignored while processing.
      isDismissDisabled={isProcessing}
      initialFocusRef={cancelButtonRef}
      footer={
        <>
          <SecondaryButton
            ref={cancelButtonRef}
            onClick={onCancel}
            disabled={isProcessing}
          >
            Cancel
          </SecondaryButton>
          <Button
            variant="danger"
            onClick={onConfirm}
            isLoading={isProcessing}
            loadingLabel={processingLabel}
          >
            {confirmLabel}
          </Button>
        </>
      }
    />
  );
}
