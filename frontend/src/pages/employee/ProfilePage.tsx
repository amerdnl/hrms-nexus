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
import AboutMeCard from "../../components/people/AboutMeCard";
import Alert from "../../components/ui/Alert";
import Avatar from "../../components/ui/Avatar";
import Button from "../../components/ui/Button";
import DescriptionList from "../../components/ui/DescriptionList";
import EmptyState from "../../components/ui/EmptyState";
import ErrorState from "../../components/ui/ErrorState";
import FormField from "../../components/ui/FormField";
import PageHeader from "../../components/ui/PageHeader";
import PrimaryButton from "../../components/ui/PrimaryButton";
import SectionCard from "../../components/ui/SectionCard";
import Skeleton, { SkeletonText } from "../../components/ui/Skeleton";
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

/**
 * dateOfBirth and employmentDate are Postgres DATE columns, so they go through
 * the timezone-safe formatter rather than `new Date(value)`, which would land
 * on UTC midnight and render the previous day for any viewer west of UTC.
 */
function displayDate(value: string | null | undefined) {
  return value ? formatDate(value) : "Not provided";
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
    return (
      <div className="mx-auto max-w-6xl space-y-6" aria-busy="true">
        <p className="sr-only" aria-live="polite">Loading your profile</p>
        <Skeleton className="h-8 w-48" />
        <div className="grid gap-6 lg:grid-cols-[300px_1fr]">
          <SectionCard>
            <Skeleton className="mx-auto h-28 w-28 rounded-full" />
            <Skeleton className="mx-auto mt-4 h-5 w-40" />
            <Skeleton className="mx-auto mt-2 h-4 w-28" />
          </SectionCard>
          <SectionCard><SkeletonText lines={8} /></SectionCard>
        </div>
      </div>
    );
  }

  if (!profile?.employee) {
    return (
      <div className="mx-auto max-w-3xl">
        <SectionCard>
          {error ? (
            <ErrorState
              title="Your profile could not be loaded"
              description={error}
              onRetry={() => window.location.reload()}
            />
          ) : (
            <EmptyState
              icon={IdCard}
              title="No employee profile is linked to this account"
              description="Ask your administrator to connect this sign-in to your employee record."
            />
          )}
        </SectionCard>
      </div>
    );
  }

  const employee = profile.employee;
  const profileImageUrl = resolveProfileImageUrl(employee.profileImage);
  const statusMeta = employmentStatusMeta(employee.employmentStatus);
  const isPhotoBusy = isUploadingPhoto || isRemovingPhoto;

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="My profile"
        description="Your employment details, your contact information and your sign-in."
      />

      <div className="grid items-start gap-6 lg:grid-cols-[300px_1fr]">
        <SectionCard bodyClassName="text-center">
          <div className="relative mx-auto w-fit">
            {/* Avatar is initials whenever the image is missing or fails, and
                keeps that decision in one place across the app. */}
            {profileImageUrl && !imageFailed ? (
              <img
                className="h-28 w-28 rounded-full object-cover ring-4 ring-primary-soft"
                src={profileImageUrl}
                alt={`${employee.fullName}'s profile`}
                onError={() => setImageFailed(true)}
              />
            ) : (
              <Avatar name={employee.fullName} size="2xl" className="ring-4 ring-primary-soft" />
            )}
          </div>

          <h2 className="mt-4 text-lg font-bold text-fg">{employee.fullName}</h2>
          <p className="mt-0.5 text-sm text-fg-muted">
            {employee.jobTitle || "Employee"}
            {employee.department?.name ? ` · ${employee.department.name}` : ""}
          </p>
          <p className="mt-0.5 text-xs text-fg-subtle">{employee.employeeNumber}</p>

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

          <div className="mt-6 flex flex-col items-center gap-1 border-t border-line pt-5">
            <Button
              variant="secondary"
              fullWidth
              icon={Camera}
              onClick={() => fileInputRef.current?.click()}
              disabled={isPhotoBusy}
              isLoading={isUploadingPhoto}
              loadingLabel="Uploading..."
            >
              Change photo
            </Button>
            <p className="mt-1 text-xs text-fg-subtle">JPG, PNG or WEBP, up to 2 MB.</p>

            {employee.profileImage && (
              <Button
                variant="danger-ghost"
                size="sm"
                icon={Trash2}
                onClick={() => setIsRemovePhotoModalOpen(true)}
                disabled={isPhotoBusy}
                className="mt-1"
              >
                Remove photo
              </Button>
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
          {/* Read-only. The profile API accepts only the four contact fields
              edited in the next card, so everything here is shown, not
              editable, and says who can correct it. */}
          <SectionCard
            title="Employment"
            description="Read-only. Contact HR if a correction is needed."
            icon={IdCard}
          >
            <DescriptionList
              items={[
                { label: "Employee number", value: employee.employeeNumber },
                { label: "Job title", value: employee.jobTitle || "Not assigned" },
                { label: "Department", value: employee.department?.name || "Not assigned" },
                { label: "Employment date", value: displayDate(employee.employmentDate) },
                { label: "Employment status", value: <StatusBadge {...statusMeta} /> },
              ]}
            />
            <div className="mt-5 border-t border-line pt-5">
              <h3 className="mb-4 text-sm font-semibold text-fg">Personal</h3>
              <DescriptionList
                items={[
                  { label: "Full name", value: employee.fullName },
                  { label: "Email", value: profile.email },
                  { label: "Date of birth", value: displayDate(employee.dateOfBirth) },
                  { label: "Gender", value: employee.gender || "Not provided" },
                ]}
              />
            </div>
          </SectionCard>

          {profile.employeeId !== null && <AboutMeCard employeeId={profile.employeeId} />}

          <form onSubmit={handleSubmit}>
            <SectionCard
              title="Contact information"
              description="The only details on this page you can change yourself."
              icon={Phone}
            >
              <div className="grid gap-5 sm:grid-cols-2">
                <FormField id="phone" label="Phone">
                  <TextInput
                    id="phone"
                    type="tel"
                    autoComplete="tel"
                    value={form.phone}
                    onChange={(event) => updateField("phone", event.target.value)}
                  />
                </FormField>

                <FormField id="address" label="Address" className="sm:col-span-2">
                  <TextArea
                    id="address"
                    rows={3}
                    className="min-h-24"
                    autoComplete="street-address"
                    value={form.address}
                    onChange={(event) => updateField("address", event.target.value)}
                  />
                </FormField>
              </div>

              {/* The two emergency fields as one group, because they describe
                  one person. There is no relationship field: the record does
                  not store one. */}
              <fieldset className="mt-6 rounded-xl border border-line p-4">
                <legend className="px-1 text-sm font-semibold text-fg">Emergency contact</legend>
                <div className="grid gap-5 sm:grid-cols-2">
                  <FormField id="emergency_contact_name" label="Name">
                    <TextInput
                      id="emergency_contact_name"
                      value={form.emergency_contact_name}
                      onChange={(event) => updateField("emergency_contact_name", event.target.value)}
                    />
                  </FormField>
                  <FormField id="emergency_contact_phone" label="Phone">
                    <TextInput
                      id="emergency_contact_phone"
                      type="tel"
                      value={form.emergency_contact_phone}
                      onChange={(event) => updateField("emergency_contact_phone", event.target.value)}
                    />
                  </FormField>
                </div>
              </fieldset>

              {error && (
                <Alert tone="danger" className="mt-5">
                  {error}
                </Alert>
              )}

              {success && (
                <Alert tone="success" className="mt-5" onDismiss={() => setSuccess("")}>
                  {success}
                </Alert>
              )}

              <div className="mt-6 flex justify-end border-t border-line pt-5">
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
            title="Sign-in and security"
            description="Your password protects your pay and personal records."
            icon={KeyRound}
          >
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <h3 className="text-sm font-semibold text-fg">Password</h3>
                <p className="mt-1 text-sm text-fg-muted">
                  Signed in as {profile.email}. Use at least 8 characters.
                </p>
              </div>

              <Button
                variant="secondary"
                className="shrink-0"
                icon={KeyRound}
                onClick={() => setIsPasswordModalOpen(true)}
              >
                Change password
              </Button>
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
