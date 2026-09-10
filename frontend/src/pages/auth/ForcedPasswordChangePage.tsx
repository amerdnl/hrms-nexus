import { KeyRound, LogOut, ShieldAlert } from "lucide-react";
import { useState, type FormEvent } from "react";
import { getApiErrorMessage } from "../../api/axios";
import { changePasswordRequest } from "../../api/profile";
import Alert from "../../components/ui/Alert";
import FormField from "../../components/ui/FormField";
import PasswordInput from "../../components/ui/PasswordInput";
import PrimaryButton from "../../components/ui/PrimaryButton";
import SecondaryButton from "../../components/ui/SecondaryButton";
import { useAuth } from "../../context/useAuth";

const initialForm = {
  currentPassword: "",
  newPassword: "",
  confirmPassword: "",
};

/**
 * The only screen an account holding a temporary password can reach.
 *
 * It is a full page rather than a modal because there is nothing behind it to
 * return to: routing sends every other path here while the flag is set. Signing
 * out stays available, so nobody is trapped.
 *
 * The temporary password is never displayed. It is typed into the "current
 * password" field like any other, and the field is a password input, so it is
 * not on screen even as the user enters it.
 */
export default function ForcedPasswordChangePage() {
  const { user, logout, refreshUser } = useAuth();
  const [form, setForm] = useState(initialForm);
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const update = (field: keyof typeof form) => (value: string) =>
    setForm((previous) => ({ ...previous, [field]: value }));

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");

    if (form.newPassword !== form.confirmPassword) {
      setError("The new password and its confirmation do not match.");
      return;
    }
    if (form.newPassword.length < 8) {
      setError("The new password must be at least 8 characters long.");
      return;
    }
    if (form.newPassword === form.currentPassword) {
      setError("The new password must be different from the temporary one.");
      return;
    }

    setIsSaving(true);
    try {
      await changePasswordRequest(form);
      // The server has cleared the flag. Re-reading the session is what releases
      // the routing lock, so this must happen before anything navigates: the
      // client never decides on its own that the change succeeded.
      await refreshUser();
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, "The password could not be changed."));
      setForm(initialForm);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="grid min-h-screen place-items-center bg-canvas px-4 py-10">
      <div className="w-full max-w-md space-y-6">
        <div className="space-y-2 text-center">
          <span className="inline-flex size-12 items-center justify-center rounded-full bg-warning-soft text-warning-fg">
            <ShieldAlert className="size-6" aria-hidden="true" />
          </span>
          <h1 className="text-xl font-semibold text-fg">Choose a new password</h1>
          <p className="text-sm text-fg-muted">
            Your account is still using a temporary password that was issued to you.
            Replace it before continuing.
          </p>
          {user && <p className="text-xs text-fg-subtle">Signed in as {user.email}</p>}
        </div>

        <form
          onSubmit={handleSubmit}
          className="space-y-4 rounded-xl border border-line bg-surface p-6 shadow-sm"
        >
          {error && <Alert tone="danger">{error}</Alert>}

          <FormField id="forced-current-password" label="Temporary password">
            <PasswordInput
              id="forced-current-password"
              autoComplete="current-password"
              value={form.currentPassword}
              onChange={(event) => update("currentPassword")(event.target.value)}
              required
            />
          </FormField>

          <FormField
            id="forced-new-password"
            label="New password"
            hint="At least 8 characters."
          >
            <PasswordInput
              id="forced-new-password"
              autoComplete="new-password"
              value={form.newPassword}
              onChange={(event) => update("newPassword")(event.target.value)}
              required
            />
          </FormField>

          <FormField id="forced-confirm-password" label="Confirm new password">
            <PasswordInput
              id="forced-confirm-password"
              autoComplete="new-password"
              value={form.confirmPassword}
              onChange={(event) => update("confirmPassword")(event.target.value)}
              required
            />
          </FormField>

          <div className="flex flex-col gap-3 sm:flex-row">
            <PrimaryButton type="submit" icon={KeyRound} isLoading={isSaving} className="sm:flex-1">
              Set new password
            </PrimaryButton>

            {/* Always available: a forced change must not be a trap. */}
            <SecondaryButton type="button" icon={LogOut} onClick={() => void logout()}>
              Sign out
            </SecondaryButton>
          </div>
        </form>

        <p className="text-center text-xs text-fg-subtle">
          Until this is done, the rest of the application is unavailable to this account.
        </p>
      </div>
    </div>
  );
}
