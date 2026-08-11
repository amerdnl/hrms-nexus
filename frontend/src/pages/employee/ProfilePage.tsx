import { Camera, IdCard, KeyRound, Phone, Save, Trash2 } from "lucide-react";
import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react";
import { getApiErrorMessage, resolveProfileImageUrl } from "../../api/axios";
import {
  deleteProfileImageRequest,
  getProfileRequest,
  uploadProfileImageRequest,
  updateProfileRequest,
  type ProfileUpdates,
} from "../../api/profile";
import ConfirmationModal from "../../components/common/ConfirmationModal";
import Alert from "../../components/ui/Alert";
import FormField from "../../components/ui/FormField";
import PageHeader from "../../components/ui/PageHeader";
import PrimaryButton from "../../components/ui/PrimaryButton";
import SectionCard from "../../components/ui/SectionCard";
import StatusBadge from "../../components/ui/StatusBadge";
import TextArea from "../../components/ui/TextArea";
import TextInput from "../../components/ui/TextInput";
import { useAuth } from "../../context/useAuth";
import type { CurrentUser } from "../../types/auth";
import { formatDate } from "../../utils/datetime";
import { employmentStatusMeta } from "../../utils/status";
import ChangePasswordModal from "./ChangePasswordPage";

const emptyForm: ProfileUpdates = {
  phone: "",
  address: "",
  emergency_contact_name: "",
  emergency_contact_phone: "",
};

const supportedImageTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const maxProfileImageSize = 2 * 1024 * 1024;

const contactFields = [
  ["Phone", "phone"],
  ["Emergency contact name", "emergency_contact_name"],
  ["Emergency contact phone", "emergency_contact_phone"],
] as const;

/**
 * dateOfBirth and employmentDate are Postgres DATE columns, so they go through
 * the timezone-safe formatter rather than `new Date(value)`, which would land
 * on UTC midnight and render the previous day for any viewer west of UTC.
 */
function displayDate(value: string | null | undefined) {
  return value ? formatDate(value) : "Not provided";
}

function initials(name: string | undefined) {
  return (name ?? "Employee")
    .split(" ")
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

export default function ProfilePage() {
  const { refreshUser } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [profile, setProfile] = useState<CurrentUser | null>(null);
  const [form, setForm] = useState<ProfileUpdates>(emptyForm);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  const [isRemovePhotoModalOpen, setIsRemovePhotoModalOpen] = useState(false);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [isRemovingPhoto, setIsRemovingPhoto] = useState(false);
  const [photoError, setPhotoError] = useState("");
  const [photoSuccess, setPhotoSuccess] = useState("");
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    const loadProfile = async () => {
      try {
        const user = await getProfileRequest();
        setProfile(user);
        setForm({
          phone: user.employee?.phone ?? "",
          address: user.employee?.address ?? "",
          emergency_contact_name: user.employee?.emergencyContactName ?? "",
          emergency_contact_phone: user.employee?.emergencyContactPhone ?? "",
        });
      } catch (requestError) {
        setError(getApiErrorMessage(requestError, "Unable to load your profile."));
      } finally {
        setIsLoading(false);
      }
    };

    void loadProfile();
  }, []);

  useEffect(() => {
    setImageFailed(false);
  }, [profile?.employee?.profileImage]);

  const updateField = (field: keyof ProfileUpdates, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setSuccess("");
    setIsSaving(true);

    try {
      const updatedUser = await updateProfileRequest(form);
      setProfile(updatedUser);
      await refreshUser();
      setSuccess("Your profile has been updated.");
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, "Unable to update your profile."));
    } finally {
      setIsSaving(false);
    }
  };

  const handlePhotoSelected = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    // Cleared before any early return so re-picking the same file still fires
    // a change event.
    event.target.value = "";
    if (!file) return;

    setPhotoError("");
    setPhotoSuccess("");

    if (!supportedImageTypes.has(file.type)) {
      setPhotoError("Only JPG, PNG and WEBP images are allowed.");
      return;
    }

    if (file.size > maxProfileImageSize) {
      setPhotoError("Profile image must be 2 MB or smaller.");
      return;
    }

    setIsUploadingPhoto(true);
    try {
      const updatedUser = await uploadProfileImageRequest(file);
      setProfile(updatedUser);
      await refreshUser();
      setPhotoSuccess("Profile photo updated successfully.");
    } catch (requestError) {
      setPhotoError(
        getApiErrorMessage(requestError, "Unable to upload your profile photo."),
      );
    } finally {
      setIsUploadingPhoto(false);
    }
  };

  const handleRemovePhoto = async () => {
    setIsRemovingPhoto(true);
    setPhotoError("");
    setPhotoSuccess("");

    try {
      const updatedUser = await deleteProfileImageRequest();
      setProfile(updatedUser);
      await refreshUser();
      setPhotoSuccess("Profile photo removed successfully.");
      setIsRemovePhotoModalOpen(false);
    } catch (requestError) {
      setPhotoError(
        getApiErrorMessage(requestError, "Unable to remove your profile photo."),
      );
      setIsRemovePhotoModalOpen(false);
    } finally {
      setIsRemovingPhoto(false);
    }
  };

  if (isLoading) {
    return <p className="text-sm text-fg-muted">Loading profile…</p>;
  }

  if (!profile?.employee) {
    return (
      <Alert tone="warning">
        {error || "No employee profile is connected to this account."}
      </Alert>
    );
  }

  const employee = profile.employee;
  const profileImageUrl = resolveProfileImageUrl(employee.profileImage);
  const statusMeta = employmentStatusMeta(employee.employmentStatus);
  const isPhotoBusy = isUploadingPhoto || isRemovingPhoto;

  const readOnlyFields: Array<[string, string]> = [
    ["Employee number", employee.employeeNumber],
    ["Full name", employee.fullName],
    ["Email", profile.email],
    ["Date of birth", displayDate(employee.dateOfBirth)],
    ["Gender", employee.gender || "Not provided"],
    ["Job title", employee.jobTitle || "Not assigned"],
    ["Department", employee.department?.name || "Not assigned"],
    ["Employment date", displayDate(employee.employmentDate)],
    ["Employment status", statusMeta.label],
  ];

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="My profile"
        description="Review your employment details and update your contact information."
      />

      <div className="grid gap-6 lg:grid-cols-[300px_1fr]">
        <SectionCard className="h-fit" bodyClassName="text-center">
          {profileImageUrl && !imageFailed ? (
            <img
              className="mx-auto h-28 w-28 rounded-full object-cover ring-4 ring-primary-soft"
              src={profileImageUrl}
              alt={`${employee.fullName}'s profile`}
              onError={() => setImageFailed(true)}
            />
          ) : (
            <div className="mx-auto grid h-28 w-28 place-items-center rounded-full bg-primary-soft text-3xl font-bold text-primary ring-4 ring-primary-soft">
              {initials(employee.fullName)}
            </div>
          )}

          <h2 className="mt-4 text-lg font-bold text-fg">{employee.fullName}</h2>
          <p className="mt-0.5 text-sm text-fg-muted">
            {employee.jobTitle || "Employee"}
          </p>

          <div className="mt-3 flex justify-center">
            <StatusBadge {...statusMeta} />
          </div>

          <input
            ref={fileInputRef}
            className="hidden"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={(event) => void handlePhotoSelected(event)}
          />

          <div className="mt-6 flex flex-col items-center gap-1">
            <PrimaryButton
              fullWidth
              icon={Camera}
              onClick={() => fileInputRef.current?.click()}
              disabled={isPhotoBusy}
              isLoading={isUploadingPhoto}
              loadingLabel="Uploading..."
            >
              Change photo
            </PrimaryButton>

            {employee.profileImage && (
              // Deliberately not the Button primitive: a low-emphasis
              // destructive action is not one of its four closed variants, and
              // overriding `ghost`'s text colour would be a class conflict that
              // cn() cannot resolve without tailwind-merge.
              <button
                type="button"
                onClick={() => setIsRemovePhotoModalOpen(true)}
                disabled={isPhotoBusy}
                className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold text-danger-fg transition-colors hover:bg-danger-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Trash2 size={15} aria-hidden="true" /> Remove photo
              </button>
            )}
          </div>

          {/* Photo messages stay in this card, separate from the contact-form
              channel below, so saving contact details never clears a photo
              error and vice versa. */}
          {photoError && (
            <Alert tone="danger" className="mt-4 text-left">
              {photoError}
            </Alert>
          )}

          {photoSuccess && (
            <Alert tone="success" className="mt-4 text-left">
              {photoSuccess}
            </Alert>
          )}
        </SectionCard>

        <div className="space-y-6">
          <SectionCard
            title="Employment information"
            description="Read-only. Contact HR if a correction is needed."
            icon={IdCard}
          >
            <dl className="grid gap-5 sm:grid-cols-2">
              {readOnlyFields.map(([label, value]) => (
                <div key={label}>
                  <dt className="text-xs font-semibold uppercase tracking-wide text-fg-subtle">
                    {label}
                  </dt>
                  <dd className="mt-1 text-sm font-medium text-fg">{value}</dd>
                </div>
              ))}
            </dl>
          </SectionCard>

          <form onSubmit={handleSubmit}>
            <SectionCard
              title="Contact information"
              description="The only details on this page you can change yourself."
              icon={Phone}
            >
              <div className="grid gap-5 sm:grid-cols-2">
                {contactFields.map(([label, field]) => (
                  <FormField key={field} id={field} label={label}>
                    <TextInput
                      id={field}
                      value={form[field]}
                      onChange={(event) =>
                        updateField(field, event.target.value)
                      }
                    />
                  </FormField>
                ))}

                <FormField
                  id="address"
                  label="Address"
                  className="sm:col-span-2"
                >
                  <TextArea
                    id="address"
                    rows={3}
                    className="min-h-24"
                    value={form.address}
                    onChange={(event) =>
                      updateField("address", event.target.value)
                    }
                  />
                </FormField>
              </div>

              {error && (
                <Alert tone="danger" className="mt-5">
                  {error}
                </Alert>
              )}

              {success && (
                <Alert tone="success" className="mt-5">
                  {success}
                </Alert>
              )}

              <div className="mt-6 flex justify-end">
                <PrimaryButton
                  type="submit"
                  icon={Save}
                  isLoading={isSaving}
                  loadingLabel="Saving…"
                >
                  Save changes
                </PrimaryButton>
              </div>
            </SectionCard>
          </form>

          <SectionCard
            title="Account & security"
            description="Manage your password and account security."
            icon={KeyRound}
          >
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <h3 className="text-sm font-semibold text-fg">Password</h3>
                <p className="mt-1 text-sm text-fg-muted">
                  Keep your account secure by using a strong password.
                </p>
              </div>

              <PrimaryButton
                className="shrink-0"
                icon={KeyRound}
                onClick={() => setIsPasswordModalOpen(true)}
              >
                Change password
              </PrimaryButton>
            </div>
          </SectionCard>
        </div>
      </div>

      <ChangePasswordModal
        isOpen={isPasswordModalOpen}
        onClose={() => setIsPasswordModalOpen(false)}
      />

      <ConfirmationModal
        isOpen={isRemovePhotoModalOpen}
        isProcessing={isRemovingPhoto}
        title="Remove profile photo?"
        description="Your profile will return to showing your initials."
        confirmLabel="Remove photo"
        processingLabel="Removing..."
        icon={<Trash2 size={21} />}
        onCancel={() => setIsRemovePhotoModalOpen(false)}
        onConfirm={() => void handleRemovePhoto()}
      />
    </div>
  );
}
