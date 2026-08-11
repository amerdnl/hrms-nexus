import { Camera, KeyRound, Save, Trash2, UserRound } from "lucide-react";
import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import {
  deleteProfileImageRequest,
  getProfileRequest,
  uploadProfileImageRequest,
  updateProfileRequest,
  type ProfileUpdates,
} from "../../api/profile";
import { getApiErrorMessage, resolveProfileImageUrl } from "../../api/axios";
import { useAuth } from "../../context/useAuth";
import type { CurrentUser } from "../../types/auth";
import ChangePasswordModal from "./ChangePasswordPage";
import ConfirmationModal from "../../components/common/ConfirmationModal";

const emptyForm: ProfileUpdates = {
  phone: "",
  address: "",
  emergency_contact_name: "",
  emergency_contact_phone: "",
};

const supportedImageTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const maxProfileImageSize = 2 * 1024 * 1024;

function displayDate(value: string | null | undefined) {
  if (!value) return "Not provided";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(
    new Date(value),
  );
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
    return <p className="text-sm text-slate-600">Loading profile…</p>;
  }

  if (!profile?.employee) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-amber-800">
        {error || "No employee profile is connected to this account."}
      </div>
    );
  }

  const employee = profile.employee;
  const profileImageUrl = resolveProfileImageUrl(employee.profileImage);
  const readOnlyFields = [
    ["Employee number", employee.employeeNumber],
    ["Full name", employee.fullName],
    ["Email", profile.email],
    ["Date of birth", displayDate(employee.dateOfBirth)],
    ["Gender", employee.gender || "Not provided"],
    ["Job title", employee.jobTitle || "Not assigned"],
    ["Department", employee.department?.name || "Not assigned"],
    ["Employment date", displayDate(employee.employmentDate)],
    ["Employment status", employee.employmentStatus],
  ];

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">My profile</h1>
        <p className="mt-1 text-sm text-slate-500">Review your employment details and update your contact information.</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
        <aside className="h-fit rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
          {profileImageUrl && !imageFailed ? (
            <img
              className="mx-auto h-28 w-28 rounded-full object-cover ring-4 ring-blue-50"
              src={profileImageUrl}
              alt={`${employee.fullName}'s profile`}
              onError={() => setImageFailed(true)}
            />
          ) : (
            <div className="mx-auto grid h-28 w-28 place-items-center rounded-full bg-blue-100 text-3xl font-bold text-blue-700">
              {initials(employee.fullName)}
            </div>
          )}
          <h2 className="mt-4 text-lg font-bold text-slate-900">{employee.fullName}</h2>
          <p className="text-sm text-slate-500">{employee.jobTitle || "Employee"}</p>
          <span className="mt-4 inline-flex rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold capitalize text-emerald-700">
            {employee.employmentStatus}
          </span>
          <input
            ref={fileInputRef}
            className="hidden"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={(event) => void handlePhotoSelected(event)}
          />
          <div className="mt-5 flex flex-col items-center gap-2">
            <button
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploadingPhoto || isRemovingPhoto}
            >
              {isUploadingPhoto ? "Uploading..." : "Change Photo"}
            </button>
            {employee.profileImage && (
              <button
                className="flex items-center gap-1.5 px-2 py-1 text-sm font-semibold text-red-600 hover:text-red-700 disabled:opacity-60"
                type="button"
                onClick={() => setIsRemovePhotoModalOpen(true)}
                disabled={isUploadingPhoto || isRemovingPhoto}
              >
                <Trash2 size={15} /> Remove Photo
              </button>
            )}
          </div>
          {photoError && (
            <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-left text-xs text-red-700" role="alert">
              {photoError}
            </p>
          )}
          {photoSuccess && (
            <p className="mt-4 rounded-lg bg-emerald-50 px-3 py-2 text-left text-xs text-emerald-700" role="status">
              {photoSuccess}
            </p>
          )}
        </aside>

        <div className="space-y-6">
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center gap-2 border-b border-slate-100 pb-4">
              <UserRound className="text-blue-700" size={20} />
              <h2 className="font-bold text-slate-900">Employment information</h2>
            </div>
            <dl className="mt-5 grid gap-5 sm:grid-cols-2">
              {readOnlyFields.map(([label, value]) => (
                <div key={label}>
                  <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</dt>
                  <dd className="mt-1 text-sm font-medium text-slate-800">{value}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-5 rounded-lg bg-slate-50 px-4 py-3 text-xs text-slate-500">
              Employment details are read-only. Contact HR if a correction is needed.
            </p>
          </section>

          <form onSubmit={handleSubmit}>
            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-center gap-2 border-b border-slate-100 pb-4">
                <Camera className="text-blue-700" size={20} />
                <h2 className="font-bold text-slate-900">Contact information</h2>
              </div>
              <div className="mt-5 grid gap-5 sm:grid-cols-2">
                {([
                  ["Phone", "phone"],
                  ["Emergency contact name", "emergency_contact_name"],
                  ["Emergency contact phone", "emergency_contact_phone"],
                ] as const).map(([label, field]) => (
                  <label className="text-sm font-semibold text-slate-700" key={field}>
                    {label}
                    <input
                      className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2.5 font-normal outline-none focus:border-blue-600 focus:ring-4 focus:ring-blue-100"
                      value={form[field]}
                      onChange={(event) => updateField(field, event.target.value)}
                    />
                  </label>
                ))}
                <label className="text-sm font-semibold text-slate-700 sm:col-span-2">
                  Address
                  <textarea
                    className="mt-2 min-h-24 w-full resize-y rounded-lg border border-slate-300 px-3 py-2.5 font-normal outline-none focus:border-blue-600 focus:ring-4 focus:ring-blue-100"
                    value={form.address}
                    onChange={(event) => updateField("address", event.target.value)}
                  />
                </label>
              </div>

              {error && <p className="mt-5 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
              {success && <p className="mt-5 rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{success}</p>}

              <div className="mt-6 flex justify-end">
                <button className="flex items-center gap-2 rounded-lg bg-blue-700 px-5 py-2.5 font-semibold text-white hover:bg-blue-800 disabled:opacity-60" type="submit" disabled={isSaving}>
                  <Save size={18} /> {isSaving ? "Saving…" : "Save changes"}
                </button>
              </div>
            </section>
          </form>

          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="border-b border-slate-100 pb-4">
              <div className="flex items-center gap-2">
                <KeyRound className="text-blue-700" size={20} />
                <h2 className="font-bold text-slate-900">Account &amp; Security</h2>
              </div>
              <p className="mt-1 text-sm text-slate-500">
                Manage your password and account security.
              </p>
            </div>
            <div className="mt-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">Password</h3>
                <p className="mt-1 text-sm text-slate-500">
                  Keep your account secure by using a strong password.
                </p>
              </div>
              <button
                className="shrink-0 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
                type="button"
                onClick={() => setIsPasswordModalOpen(true)}
              >
                Change Password
              </button>
            </div>
          </section>
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
        confirmLabel="Remove Photo"
        processingLabel="Removing..."
        icon={<Trash2 size={21} />}
        onCancel={() => setIsRemovePhotoModalOpen(false)}
        onConfirm={() => void handleRemovePhoto()}
      />
    </div>
  );
}
