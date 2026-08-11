import { LogOut } from "lucide-react";
import ConfirmationModal from "./ConfirmationModal";

interface LogoutConfirmationModalProps {
  isOpen: boolean;
  isLoggingOut: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export default function LogoutConfirmationModal({
  isOpen,
  isLoggingOut,
  onCancel,
  onConfirm,
}: LogoutConfirmationModalProps) {
  return (
    <ConfirmationModal
      isOpen={isOpen}
      isProcessing={isLoggingOut}
      title="Log out?"
      description="Are you sure you want to log out of HR Nexus?"
      confirmLabel="Log out"
      processingLabel="Logging out..."
      icon={<LogOut size={21} />}
      onCancel={onCancel}
      onConfirm={onConfirm}
    />
  );
}
