import { KeyRound } from "lucide-react";
import { useRef, useState, type FormEvent } from "react";
import { getApiErrorMessage } from "../../api/axios";
import { changePasswordRequest } from "../../api/profile";
import Alert from "../../components/ui/Alert";
import FormField from "../../components/ui/FormField";
import Modal from "../../components/ui/Modal";
import PasswordInput from "../../components/ui/PasswordInput";
import PrimaryButton from "../../components/ui/PrimaryButton";
import SecondaryButton from "../../components/ui/SecondaryButton";

type PasswordField = "currentPassword" | "newPassword" | "confirmPassword";

const initialForm = {
  currentPassword: "",
  newPassword: "",
  confirmPassword: "",
};

const passwordFields: Array<{
  field: PasswordField;
  label: string;
  autoComplete: string;
}> = [
  {
    field: "currentPassword",
    label: "Current password",
    autoComplete: "current-password",
  },
  { field: "newPassword", label: "New password", autoComplete: "new-password" },
  {
    field: "confirmPassword",
    label: "Confirm new password",
    autoComplete: "new-password",
  },
];

export default function ChangePasswordModal({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const currentPasswordRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState(initialForm);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  /**
   * Passwords must not survive a close. Visibility state no longer needs
   * clearing here: PasswordInput owns its own toggle, and Modal unmounts its
   * children when closed, so every field reopens masked.
   */
  const clearSensitiveState = () => {
    setForm(initialForm);
    setError("");
    setSuccess("");
  };

  const closeModal = () => {
    if (isSubmitting) return;
    clearSensitiveState();
    onClose();
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setSuccess("");

    if (!form.currentPassword || !form.newPassword || !form.confirmPassword) {
      setError("All password fields are required.");
      return;
    }
    if (form.newPassword.length < 8) {
      setError("The new password must be at least 8 characters long.");
      return;
    }
    if (form.newPassword !== form.confirmPassword) {
      setError("The new password and confirmation do not match.");
      return;
    }
    if (form.currentPassword === form.newPassword) {
      setError("The new password must be different from your current password.");
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await changePasswordRequest(form);
      setSuccess(result.message);
      setForm(initialForm);
    } catch (requestError) {
      setError(
        getApiErrorMessage(requestError, "Unable to change your password."),
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={closeModal}
      title="Change password"
      description="Enter your current password and choose a new password."
      icon={<KeyRound size={22} />}
      size="md"
      // Escape must not abandon a request that is already in flight.
      isDismissDisabled={isSubmitting}
      initialFocusRef={currentPasswordRef}
    >
      <form className="space-y-5" onSubmit={handleSubmit}>
        {passwordFields.map(({ field, label, autoComplete }) => (
          <FormField key={field} id={field} label={label} required>
            <PasswordInput
              id={field}
              ref={field === "currentPassword" ? currentPasswordRef : undefined}
              autoComplete={autoComplete}
              value={form[field]}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  [field]: event.target.value,
                }))
              }
              required
            />
          </FormField>
        ))}

        {error && <Alert tone="danger">{error}</Alert>}
        {success && <Alert tone="success">{success}</Alert>}

        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <SecondaryButton onClick={closeModal} disabled={isSubmitting}>
            Cancel
          </SecondaryButton>

          <PrimaryButton
            type="submit"
            isLoading={isSubmitting}
            loadingLabel="Updating..."
          >
            Update password
          </PrimaryButton>
        </div>
      </form>
    </Modal>
  );
}
