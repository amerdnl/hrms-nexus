import { Eye, EyeOff, KeyRound, X } from "lucide-react";
import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type RefObject,
} from "react";
import { getApiErrorMessage } from "../../api/axios";
import { changePasswordRequest } from "../../api/profile";

type PasswordField = "currentPassword" | "newPassword" | "confirmPassword";

const initialForm = {
  currentPassword: "",
  newPassword: "",
  confirmPassword: "",
};

function PasswordInput({
  label,
  field,
  value,
  visible,
  inputRef,
  onChange,
  onToggle,
}: {
  label: string;
  field: PasswordField;
  value: string;
  visible: boolean;
  inputRef?: RefObject<HTMLInputElement | null>;
  onChange: (field: PasswordField, value: string) => void;
  onToggle: (field: PasswordField) => void;
}) {
  return (
    <label className="block text-sm font-semibold text-slate-700">
      {label}
      <span className="relative mt-2 block">
        <input
          ref={inputRef}
          className="w-full rounded-lg border border-slate-300 px-4 py-3 pr-12 font-normal outline-none focus:border-blue-600 focus:ring-4 focus:ring-blue-100"
          type={visible ? "text" : "password"}
          autoComplete={field === "currentPassword" ? "current-password" : "new-password"}
          value={value}
          onChange={(event) => onChange(field, event.target.value)}
          required
        />
        <button
          className="absolute inset-y-0 right-0 grid w-12 place-items-center text-slate-500 hover:text-slate-800"
          type="button"
          onClick={() => onToggle(field)}
          aria-label={visible ? `Hide ${label}` : `Show ${label}`}
        >
          {visible ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      </span>
    </label>
  );
}

export default function ChangePasswordModal({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const currentPasswordRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState(initialForm);
  const [visible, setVisible] = useState<Record<PasswordField, boolean>>({
    currentPassword: false,
    newPassword: false,
    confirmPassword: false,
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const clearSensitiveState = () => {
    setForm(initialForm);
    setVisible({
      currentPassword: false,
      newPassword: false,
      confirmPassword: false,
    });
    setError("");
    setSuccess("");
  };

  const closeModal = () => {
    if (isSubmitting) return;
    clearSensitiveState();
    onClose();
  };

  useEffect(() => {
    if (!isOpen) return;

    currentPasswordRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !isSubmitting) {
        clearSensitiveState();
        onClose();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, isSubmitting, onClose]);

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
      setVisible({
        currentPassword: false,
        newPassword: false,
        confirmPassword: false,
      });
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, "Unable to change your password."));
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/50 px-4 py-6">
      <section
        className="max-h-full w-full max-w-[480px] overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="change-password-dialog-title"
        aria-describedby="change-password-dialog-description"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="mb-4 grid h-11 w-11 place-items-center rounded-xl bg-blue-100 text-blue-700">
              <KeyRound size={22} />
            </div>
            <h2
              id="change-password-dialog-title"
              className="text-xl font-bold text-slate-900"
            >
              Change Password
            </h2>
            <p
              id="change-password-dialog-description"
              className="mt-1 text-sm text-slate-500"
            >
              Enter your current password and choose a new password.
            </p>
          </div>
          <button
            className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50"
            type="button"
            onClick={closeModal}
            disabled={isSubmitting}
            aria-label="Close change password dialog"
          >
            <X size={20} />
          </button>
        </div>

        <form className="mt-6" onSubmit={handleSubmit}>
          <div className="space-y-5">
            {([
              ["Current Password", "currentPassword"],
              ["New Password", "newPassword"],
              ["Confirm New Password", "confirmPassword"],
            ] as const).map(([label, field]) => (
              <PasswordInput
                key={field}
                label={label}
                field={field}
                value={form[field]}
                visible={visible[field]}
                inputRef={field === "currentPassword" ? currentPasswordRef : undefined}
                onChange={(changedField, value) =>
                  setForm((current) => ({ ...current, [changedField]: value }))
                }
                onToggle={(changedField) =>
                  setVisible((current) => ({
                    ...current,
                    [changedField]: !current[changedField],
                  }))
                }
              />
            ))}
          </div>

          {error && (
            <p className="mt-5 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
              {error}
            </p>
          )}
          {success && (
            <p className="mt-5 rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-700" role="status">
              {success}
            </p>
          )}

          <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <button
              className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
              type="button"
              onClick={closeModal}
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              className="rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
              type="submit"
              disabled={isSubmitting}
            >
              {isSubmitting ? "Updating..." : "Update Password"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
