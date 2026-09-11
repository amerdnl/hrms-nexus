import axios from "axios";
import { Building2, Clock3, MapPin } from "lucide-react";
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
import FormField from "../../components/ui/FormField";
import PageHeader from "../../components/ui/PageHeader";
import SectionCard from "../../components/ui/SectionCard";
import TextArea from "../../components/ui/TextArea";
import TextInput from "../../components/ui/TextInput";

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

  return <section className="mx-auto max-w-4xl space-y-6">
    <PageHeader title="Company settings" description="Manage your company profile, working hours and office location." />
    {error && <Alert tone="danger">{error}{errors._form && <p>{errors._form}</p>}</Alert>}
    {success && <Alert tone="success">{success}</Alert>}
    {loading && <p role="status" className="text-sm text-fg-muted">Loading company settings…</p>}
    {!loading && !draft && <Button variant="secondary" onClick={reloadSettings}>Retry loading settings</Button>}
    {draft && saved && <>
      {!saved.company_name && <Alert tone="info" title="Set up your company">
        Review the UTC timezone and default Monday–Friday working hours before saving. Add your company name to finish setup.
      </Alert>}
      <form ref={formRef} onSubmit={(event) => void submit(event)} noValidate className="space-y-6" aria-busy={saving || loading}>
        <fieldset disabled={saving || loading} className="min-w-0 space-y-6">
          <legend className="sr-only">Company settings</legend>
          <SectionCard title="Company" icon={Building2}>
            <div className="grid gap-5 sm:grid-cols-2">
              {input("company_name", "Company name", { required: true, maxLength: 200 })}
              {input("registration_number", "Registration number", { maxLength: 100 })}
              {input("email", "Company email", { type: "email", maxLength: 254 })}
              {input("phone", "Company phone", { type: "tel", maxLength: 50 })}
              <FormField id="address" label="Company address" error={errors.address} className="sm:col-span-2">
                <TextArea id="address" value={draft.address} onChange={(event) => change("address", event.target.value)} maxLength={2000}
                  invalid={Boolean(errors.address)} aria-describedby={errors.address ? "address-error" : undefined} rows={3} />
              </FormField>
            </div>
          </SectionCard>
          <SectionCard title="Working hours" icon={Clock3}>
            <div className="space-y-5">
              {input("timezone", "Company timezone", { required: true, list: "company-timezones", maxLength: 100,
                hint: "Choose the timezone for your office working hours. UTC is the initial default." })}
              <datalist id="company-timezones">{timezones.map((zone) => <option key={zone} value={zone} />)}</datalist>
              <fieldset aria-describedby={errors.working_days ? "working_days-error" : undefined}>
                <legend className="mb-2 text-sm font-medium text-fg-muted">Working days (required)</legend>
                <div className="flex flex-wrap gap-3">
                  {weekdays.map((day, index) => <label key={day} className="flex items-center gap-2 rounded-lg border border-line px-3 py-2 text-sm text-fg">
                    <input type="checkbox" checked={draft.working_days.includes(index + 1)} aria-invalid={Boolean(errors.working_days) || undefined}
                      onChange={(event) => {
                        const days = event.target.checked ? [...draft.working_days, index + 1] : draft.working_days.filter((value) => value !== index + 1);
                        setDraft({ ...draft, working_days: days.sort((a, b) => a - b) }); setSuccess("");
                      }} className="h-4 w-4 accent-primary focus-visible:outline-2 focus-visible:outline-ring" />{day}
                  </label>)}
                </div>
                {errors.working_days && <p id="working_days-error" role="alert" className="mt-2 text-xs text-danger-fg">{errors.working_days}</p>}
              </fieldset>
              <div className="grid gap-5 sm:grid-cols-3">
                {input("work_start_time", "Work start time", { type: "time", required: true, step: "60" })}
                {input("work_end_time", "Work end time", { type: "time", required: true, step: "60" })}
                {input("grace_period_minutes", "Grace period (minutes)", { type: "number", required: true, min: 0, max: 1439, step: "1" })}
              </div>
              <p className="text-xs text-fg-subtle">An end time earlier than the start time means the shift finishes the next day. Grace must be shorter than the working period.</p>
            </div>
          </SectionCard>
          <SectionCard title="Attendance" icon={MapPin} description="Set the office point and permitted attendance radius.">
            <div className="grid gap-5 sm:grid-cols-2">
              {input("office_latitude", "Office latitude", { type: "number", min: -90, max: 90, step: "any", hint: "Enter -90 to 90. Supply both coordinates or leave both empty." })}
              {input("office_longitude", "Office longitude", { type: "number", min: -180, max: 180, step: "any", hint: "Enter -180 to 180." })}
              {input("attendance_radius_meters", "Attendance radius (metres)", { type: "number", required: true, min: 1, max: 10000, step: "1", hint: "A distance from 1 to 10000 metres. Review the initial 100-metre default." })}
            </div>
            {draft.office_latitude === "" && draft.office_longitude === "" && <p className="mt-4 text-sm text-fg-muted">Office location is not configured.</p>}
          </SectionCard>
          <div className="flex flex-wrap items-center justify-end gap-3">
            {dirty && <span className="mr-auto text-sm text-fg-muted">Unsaved changes</span>}
            <Button variant="secondary" onClick={reloadSettings}>Reload latest settings</Button>
            <Button type="submit" isLoading={saving} loadingLabel="Saving…" disabled={Boolean(conflict) || (!dirty && Boolean(saved.company_name))}>Save settings</Button>
          </div>
        </fieldset>
      </form>
    </>}
    <ConfirmationModal isOpen={confirmReload} isProcessing={false} title="Reload settings?"
      description="Reloading will replace your unsaved edits with the latest saved settings."
      confirmLabel="Reload settings" processingLabel="Reloading…" tone="primary"
      onCancel={() => setConfirmReload(false)} onConfirm={() => { setConfirmReload(false); setReload((value) => value + 1); }} />
  </section>;
}
