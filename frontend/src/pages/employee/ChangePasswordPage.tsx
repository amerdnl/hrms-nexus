import { Eye, EyeOff, KeyRound } from "lucide-react";
import { useState, type FormEvent } from "react";
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
  onChange,
  onToggle,
}: {
  label: string;
  field: PasswordField;
  value: string;
  visible: boolean;
  onChange: (field: PasswordField, value: string) => void;
  onToggle: (field: PasswordField) => void;
}) {
  return (
    <label className="block text-sm font-semibold text-slate-700">
      {label}
      <span className="relative mt-2 block">
        <input
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

export default function ChangePasswordPage() {
  const [form, setForm] = useState(initialForm);
  const [visible, setVisible] = useState<Record<PasswordField, boolean>>({
    currentPassword: false,
    newPassword: false,
    confirmPassword: false,
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

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
      setError(getApiErrorMessage(requestError, "Unable to change your password."));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Change password</h1>
        <p className="mt-1 text-sm text-slate-500">Choose a unique password with at least eight characters.</p>
      </div>
      <form className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8" onSubmit={handleSubmit}>
        <div className="mb-6 grid h-12 w-12 place-items-center rounded-xl bg-blue-100 text-blue-700">
          <KeyRound size={24} />
        </div>
        <div className="space-y-5">
          {([
            ["Current password", "currentPassword"],
            ["New password", "newPassword"],
            ["Confirm new password", "confirmPassword"],
          ] as const).map(([label, field]) => (
            <PasswordInput
              key={field}
              label={label}
              field={field}
              value={form[field]}
              visible={visible[field]}
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

        {error && <p className="mt-5 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
        {success && <p className="mt-5 rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{success}</p>}

        <button className="mt-6 w-full rounded-lg bg-blue-700 px-4 py-3 font-semibold text-white hover:bg-blue-800 disabled:opacity-60" type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Updating password…" : "Update password"}
        </button>
      </form>
    </div>
  );
}
