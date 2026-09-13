import axios from "axios";
import { Building2, CircleCheck, Clock3, MapPin, TriangleAlert } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { getApiErrorMessage } from "../../api/axios";
import {
  getCompanySettings,
  saveCompanySettings,
  type CompanySettings,
} from "../../api/companySettingsApi";
import ConfirmationModal from "../../components/common/ConfirmationModal";
import Alert from "../../components/ui/Alert";
import Button from "../../components/ui/Button";
import ErrorState from "../../components/ui/ErrorState";
import FormField from "../../components/ui/FormField";
import PageHeader from "../../components/ui/PageHeader";
import SectionCard from "../../components/ui/SectionCard";
import Skeleton, { SkeletonText } from "../../components/ui/Skeleton";
import TextArea from "../../components/ui/TextArea";
import TextInput from "../../components/ui/TextInput";
import HolidaysCard from "../../components/settings/HolidaysCard";
import { cn } from "../../utils/cn";

const textFields = [
  "company_name",
  "registration_number",
  "address",
  "email",
  "phone",
  "timezone",
  "work_start_time",
  "work_end_time",
  "grace_period_minutes",
  "office_latitude",
  "office_longitude",
  "attendance_radius_meters",
] as const;

type Field = typeof textFields[number];
type Draft = Record<Field, string> & { working_days: number[] };

const weekdays = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

const timezones = [
  "UTC",
  ...(typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : []),
];

function draftOf(settings: CompanySettings): Draft {
  return {
    ...(Object.fromEntries(
      textFields.map((field) => [field, String(settings[field] ?? "")]),
    ) as Record<Field, string>),
    working_days: [...settings.working_days],
  };
}

const numeric = (value: string) => (value.trim() === "" ? null : Number(value));

export default function CompanySettingsPage() {
  const [saved, setSaved] = useState<CompanySettings | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [reload, setReload] = useState(0);
  const [confirmReload, setConfirmReload] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [conflict, setConflict] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  const dirty = saved && draft
    ? JSON.stringify(draft) !== JSON.stringify(draftOf(saved))
    : false;

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");

    void getCompanySettings(controller.signal)
      .then((settings) => {
        if (controller.signal.aborted) return;
        setSaved(settings);
        setDraft(draftOf(settings));
        setConflict(false);
        setErrors({});
        setSuccess("");
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) {
          setError(getApiErrorMessage(cause, "Unable to load company settings."));
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [reload]);

  useEffect(() => {
    if (Object.keys(errors).length) {
      formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
    }
  }, [errors]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  function change(field: Field, value: string) {
    setDraft((current) => (current ? { ...current, [field]: value } : current));
    setSuccess("");
  }

  function reloadSettings() {
    if (dirty) setConfirmReload(true);
    else setReload((value) => value + 1);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!draft || !saved || saving || conflict) return;

    const invalidNumbers = [
      ...(formRef.current?.querySelectorAll<HTMLInputElement>('input[type="number"]') ?? []),
    ].filter((element) => element.validity.badInput);

    if (invalidNumbers.length) {
      setErrors(
        Object.fromEntries(invalidNumbers.map((element) => [element.id, "Enter a valid number."])),
      );
      setError("Check the highlighted settings fields.");
      setSuccess("");
      return;
    }

    setSaving(true);
    setErrors({});
    setError("");
    setSuccess("");

    try {
      const result = await saveCompanySettings({
        ...draft,
        revision: saved.revision,
        grace_period_minutes: numeric(draft.grace_period_minutes) as number,
        office_latitude: numeric(draft.office_latitude),
        office_longitude: numeric(draft.office_longitude),
        attendance_radius_meters: numeric(draft.attendance_radius_meters) as number,
      });
      setSaved(result);
      setDraft(draftOf(result));
      setSuccess("Company settings saved.");
    } catch (cause) {
      setError(getApiErrorMessage(cause, "Unable to save settings. Your edits are still here."));
      if (axios.isAxiosError<{ errors?: Record<string, string> }>(cause)) {
        setErrors(cause.response?.data.errors ?? {});
        if (cause.response?.status === 409) setConflict(true);
      }
    } finally {
      setSaving(false);
    }
  }

  function input(
    field: Field,
    label: string,
    options: {
      type?: string;
      required?: boolean;
      maxLength?: number;
      min?: number;
      max?: number;
      step?: string;
      hint?: string;
      list?: string;
    } = {},
  ) {
    const { hint, ...props } = options;
    return (
      <FormField id={field} label={label} required={props.required} error={errors[field]} hint={hint}>
        <TextInput
          id={field}
          value={draft?.[field] ?? ""}
          onChange={(event) => change(field, event.target.value)}
          invalid={Boolean(errors[field])}
          aria-describedby={errors[field] ? `${field}-error` : hint ? `${field}-hint` : undefined}
          {...props}
        />
      </FormField>
    );
  }

  const locationSet = draft ? draft.office_latitude !== "" && draft.office_longitude !== "" : false;

  return (
    <section className="mx-auto max-w-4xl space-y-6">
      <PageHeader
        title="Company settings"
        description="Your company profile, working week and the office point used to verify attendance."
      />

      {error && (
        <Alert tone="danger">
          {error}
          {errors._form && <p>{errors._form}</p>}
        </Alert>
      )}
      {success && <Alert tone="success" onDismiss={() => setSuccess("")}>{success}</Alert>}

      {loading && !draft && (
        <div className="space-y-6" aria-busy="true">
          <p role="status" className="sr-only">Loading company settings</p>
          {[5, 4, 3].map((lines) => (
            <SectionCard key={lines}>
              <Skeleton className="h-5 w-40" />
              <SkeletonText lines={lines} className="mt-5" />
            </SectionCard>
          ))}
        </div>
      )}

      {!loading && !draft && (
        <SectionCard>
          <ErrorState
            title="Company settings could not be loaded"
            description="Nothing has been changed. Try loading them again."
            onRetry={reloadSettings}
            retryLabel="Retry loading settings"
          />
        </SectionCard>
      )}

      {draft && saved && (
        <>
          {!saved.company_name && (
            <Alert tone="info" title="Set up your company">
              Review the UTC timezone and default Monday–Friday working hours before
              saving. Add your company name to finish setup.
            </Alert>
          )}

          <form
            ref={formRef}
            onSubmit={(event) => void submit(event)}
            noValidate
            aria-busy={saving || loading}
          >
            <fieldset disabled={saving || loading} className="min-w-0 space-y-6">
              <legend className="sr-only">Company settings</legend>

              <SectionCard
                title="Company profile"
                description="How the company is identified across HR Nexus."
                icon={Building2}
              >
                <div className="grid gap-5 sm:grid-cols-2">
                  {input("company_name", "Company name", { required: true, maxLength: 200 })}
                  {input("registration_number", "Registration number", { maxLength: 100 })}
                  {input("email", "Company email", { type: "email", maxLength: 254 })}
                  {input("phone", "Company phone", { type: "tel", maxLength: 50 })}
                  <FormField id="address" label="Company address" error={errors.address} className="sm:col-span-2">
                    <TextArea
                      id="address"
                      value={draft.address}
                      onChange={(event) => change("address", event.target.value)}
                      maxLength={2000}
                      invalid={Boolean(errors.address)}
                      aria-describedby={errors.address ? "address-error" : undefined}
                      rows={3}
                    />
                  </FormField>
                </div>
              </SectionCard>

              <SectionCard
                title="Working week"
                description="Your working days and hours, in the company's own timezone."
                icon={Clock3}
              >
                <div className="space-y-6">
                  {input("timezone", "Company timezone", {
                    required: true,
                    list: "company-timezones",
                    maxLength: 100,
                    hint: "Choose the timezone for your office working hours. UTC is the initial default.",
                  })}
                  <datalist id="company-timezones">
                    {timezones.map((zone) => <option key={zone} value={zone} />)}
                  </datalist>

                  <fieldset aria-describedby={errors.working_days ? "working_days-error" : undefined}>
                    <legend className="mb-2 text-sm font-medium text-fg-muted">
                      Working days <span className="sr-only">(required)</span>
                      <span aria-hidden="true" className="ml-0.5 text-danger">*</span>
                    </legend>
                    {/* Real checkboxes inside toggle chips: the chip is the
                        label, so the whole chip is the hit area, and the
                        checkbox keeps its native semantics and keyboard
                        behaviour. has-checked restyles the chip without any
                        extra state. */}
                    <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
                      {weekdays.map((day, index) => (
                        <label
                          key={day}
                          className={cn(
                            "flex cursor-pointer flex-col items-center gap-1.5 rounded-xl border px-2 py-3 text-sm font-medium transition-colors",
                            "border-line text-fg-muted hover:border-control-border",
                            "has-checked:border-primary has-checked:bg-primary-soft has-checked:text-primary",
                            "has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-ring",
                          )}
                        >
                          <input
                            type="checkbox"
                            checked={draft.working_days.includes(index + 1)}
                            aria-invalid={Boolean(errors.working_days) || undefined}
                            onChange={(event) => {
                              const days = event.target.checked
                                ? [...draft.working_days, index + 1]
                                : draft.working_days.filter((value) => value !== index + 1);
                              setDraft({ ...draft, working_days: days.sort((a, b) => a - b) });
                              setSuccess("");
                            }}
                            className="h-4 w-4 accent-primary focus-visible:outline-none"
                          />
                          <span aria-hidden="true">{day.slice(0, 3)}</span>
                          <span className="sr-only">{day}</span>
                        </label>
                      ))}
                    </div>
                    {errors.working_days && (
                      <p id="working_days-error" role="alert" className="mt-2 text-xs text-danger-fg">
                        {errors.working_days}
                      </p>
                    )}
                  </fieldset>

                  <div className="grid gap-5 sm:grid-cols-3">
                    {input("work_start_time", "Work start time", { type: "time", required: true, step: "60" })}
                    {input("work_end_time", "Work end time", { type: "time", required: true, step: "60" })}
                    {input("grace_period_minutes", "Grace period (minutes)", {
                      type: "number", required: true, min: 0, max: 1439, step: "1",
                    })}
                  </div>
                  <p className="text-xs text-fg-subtle">
                    An end time earlier than the start time means the shift finishes the
                    next day. Grace must be shorter than the working period.
                  </p>
                </div>
              </SectionCard>

              <SectionCard
                title="Attendance location"
                description="The office point and radius used to verify a check-in."
                icon={MapPin}
              >
                {/* States whether location-verified check-in can work at all,
                    in words. There is no map here on purpose: the product has
                    no map provider, and a pin drawn from these two numbers
                    would add a dependency to say what the sentence says. */}
                <div
                  className={cn(
                    "mb-5 flex items-start gap-3 rounded-xl p-4 text-sm",
                    locationSet ? "bg-success-soft text-success-fg" : "bg-warning-soft text-warning-fg",
                  )}
                  role="status"
                >
                  {locationSet ? (
                    <CircleCheck size={18} className="mt-0.5 shrink-0" aria-hidden="true" />
                  ) : (
                    <TriangleAlert size={18} className="mt-0.5 shrink-0" aria-hidden="true" />
                  )}
                  <p>
                    {locationSet
                      ? `Employees must be within ${draft.attendance_radius_meters || "?"} m of ${draft.office_latitude}, ${draft.office_longitude} to verify a check-in.`
                      : "Office location is not set. Location-verified check-in needs both coordinates."}
                  </p>
                </div>

                <div className="grid gap-5 sm:grid-cols-3">
                  {input("office_latitude", "Office latitude", {
                    type: "number", min: -90, max: 90, step: "any",
                    hint: "Enter -90 to 90. Supply both coordinates or leave both empty.",
                  })}
                  {input("office_longitude", "Office longitude", {
                    type: "number", min: -180, max: 180, step: "any", hint: "Enter -180 to 180.",
                  })}
                  {input("attendance_radius_meters", "Radius (metres)", {
                    type: "number", required: true, min: 1, max: 10000, step: "1",
                    hint: "1 to 10000 metres.",
                  })}
                </div>
              </SectionCard>

              {/* Sticky, so Save is always within reach on a long form. Sits
                  above the fixed bottom navigation on phones (bottom-16) and
                  at the viewport edge from md up, where there is none. */}
              <div className="sticky bottom-16 z-20 -mx-1 rounded-card border border-line bg-surface/95 p-3 shadow-raised backdrop-blur md:bottom-4">
                <div className="flex flex-wrap items-center justify-end gap-3">
                  <p className="mr-auto flex items-center gap-2 text-sm" aria-live="polite">
                    {conflict ? (
                      <span className="text-danger-fg">
                        Settings were changed elsewhere. Reload them to continue.
                      </span>
                    ) : dirty ? (
                      <>
                        <span className="h-2 w-2 rounded-full bg-warning" aria-hidden="true" />
                        <span className="text-fg-muted">Unsaved changes</span>
                      </>
                    ) : (
                      <span className="text-fg-subtle">All changes saved</span>
                    )}
                  </p>
                  <Button variant="secondary" onClick={reloadSettings}>
                    Reload
                  </Button>
                  <Button
                    type="submit"
                    isLoading={saving}
                    loadingLabel="Saving…"
                    disabled={Boolean(conflict) || (!dirty && Boolean(saved.company_name))}
                  >
                    Save settings
                  </Button>
                </div>
              </div>
            </fieldset>
          </form>

          {/* Saved on their own, row by row: not part of the settings form's revision. */}
          <HolidaysCard />
        </>
      )}

      <ConfirmationModal
        isOpen={confirmReload}
        isProcessing={false}
        title="Reload settings?"
        description="Reloading will replace your unsaved edits with the latest saved settings."
        confirmLabel="Reload settings"
        processingLabel="Reloading…"
        tone="primary"
        onCancel={() => setConfirmReload(false)}
        onConfirm={() => {
          setConfirmReload(false);
          setReload((value) => value + 1);
        }}
      />
    </section>
  );
}
