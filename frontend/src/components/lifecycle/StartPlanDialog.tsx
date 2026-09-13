import axios from "axios";
import { ClipboardList } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { getApiErrorMessage } from "../../api/axios";
import { getTemplates, startPlan } from "../../api/lifecycleApi";
import { getDirectory } from "../../api/peopleApi";
import { getCalendarConfig } from "../../api/workplaceApi";
import type { ExitStatus, LifecycleKind, LifecycleTemplate } from "../../types/lifecycle";
import { exitStatusLabels, kindLabels } from "../../types/lifecycle";
import type { PersonCard } from "../../types/people";
import Alert from "../ui/Alert";
import Button from "../ui/Button";
import FormField from "../ui/FormField";
import { fieldDescribedBy } from "../ui/fieldStyles";
import Modal from "../ui/Modal";
import SecondaryButton from "../ui/SecondaryButton";
import SelectInput from "../ui/SelectInput";
import TextInput from "../ui/TextInput";

function addDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

/**
 * HR starts an onboarding or offboarding plan from an active checklist. The
 * employee list is the working company (the only people a plan is for), and
 * the dates default from the company's today, not the browser's.
 */
export default function StartPlanDialog({ isOpen, kind, employee, onClose, onStarted }: {
  isOpen: boolean;
  kind: LifecycleKind;
  /** Preselected, e.g. from the HR record. */
  employee?: { id: number; name: string } | null;
  onClose: () => void;
  onStarted: (planId: number, message: string) => void;
}) {
  const [search, setSearch] = useState("");
  const [people, setPeople] = useState<PersonCard[]>([]);
  const [templates, setTemplates] = useState<LifecycleTemplate[] | null>(null);
  const [employeeId, setEmployeeId] = useState<number | "">(employee?.id ?? "");
  const [templateId, setTemplateId] = useState<number | "">("");
  const [startsOn, setStartsOn] = useState("");
  const [targetDate, setTargetDate] = useState("");
  const [exitStatus, setExitStatus] = useState<ExitStatus>("resigned");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setErrors({});
    setFormError("");
    setEmployeeId(employee?.id ?? "");
    setSearch("");
    getTemplates(kind)
      .then((found) => {
        const active = found.filter((template) => template.isActive);
        setTemplates(active);
        setTemplateId(active[0]?.id ?? "");
      })
      .catch(() => setTemplates([]));
    getCalendarConfig()
      .then((config) => {
        setStartsOn(config.today);
        setTargetDate(addDays(config.today, kind === "onboarding" ? 30 : 14));
      })
      .catch(() => undefined);
  }, [isOpen, kind, employee]);

  useEffect(() => {
    if (!isOpen || employee) return;
    const timer = window.setTimeout(() => {
      getDirectory({ search: search.trim() || undefined, pageSize: 50 })
        .then((page) => setPeople(page.people))
        .catch(() => setPeople([]));
    }, 200);
    return () => window.clearTimeout(timer);
  }, [isOpen, search, employee]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setIsSaving(true);
    setErrors({});
    setFormError("");
    try {
      const result = await startPlan({
        employeeId: Number(employeeId),
        kind,
        templateId: Number(templateId),
        startsOn,
        targetDate,
        exitStatus: kind === "offboarding" ? exitStatus : null,
      });
      onStarted(result.id, result.message);
    } catch (requestError) {
      if (axios.isAxiosError(requestError) && requestError.response?.data?.errors) {
        setErrors(requestError.response.data.errors as Record<string, string>);
      }
      setFormError(getApiErrorMessage(requestError, "The plan could not be started."));
    } finally {
      setIsSaving(false);
    }
  }

  const label = kindLabels[kind].toLowerCase();

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Start ${label}`}
      description={kind === "offboarding"
        ? "Their account stays active until you complete the plan on or after the last working day."
        : "The checklist is copied, dated from the start, and each role is notified."}
      icon={<ClipboardList size={20} aria-hidden="true" />}
      size="md"
      isDismissDisabled={isSaving}
      footer={
        <>
          <SecondaryButton onClick={onClose} disabled={isSaving}>Cancel</SecondaryButton>
          <Button type="submit" form="start-plan-form" isLoading={isSaving} loadingLabel="Starting…" disabled={templates !== null && templates.length === 0}>
            Start {label}
          </Button>
        </>
      }
    >
      <form id="start-plan-form" onSubmit={submit} className="space-y-4" noValidate>
        {formError && <Alert tone="danger">{formError}</Alert>}

        {employee ? (
          <p className="text-sm text-fg">For <strong>{employee.name}</strong></p>
        ) : (
          <>
            <FormField id="plan-person-search" label="Find the employee">
              <TextInput id="plan-person-search" type="search" value={search} placeholder="Name, role or department" onChange={(e) => setSearch(e.target.value)} />
            </FormField>
            <FormField id="plan-employee" label="Employee" required error={errors.employeeId}>
              <SelectInput id="plan-employee" value={employeeId} onChange={(e) => setEmployeeId(Number(e.target.value) || "")} invalid={Boolean(errors.employeeId)}
                aria-describedby={fieldDescribedBy("plan-employee", { error: Boolean(errors.employeeId) })}>
                <option value="">Choose an employee</option>
                {people.map((person) => (
                  <option key={person.id} value={person.id}>{[person.fullName, person.jobTitle].filter(Boolean).join(" · ")}</option>
                ))}
              </SelectInput>
            </FormField>
          </>
        )}

        <FormField id="plan-template" label="Checklist" required error={errors.templateId}
          hint={templates !== null && templates.length === 0 ? `There is no active ${label} checklist yet. Create one under Checklists first.` : undefined}>
          <SelectInput id="plan-template" value={templateId} onChange={(e) => setTemplateId(Number(e.target.value) || "")} invalid={Boolean(errors.templateId)}
            aria-describedby={fieldDescribedBy("plan-template", { hint: templates !== null && templates.length === 0, error: Boolean(errors.templateId) })}>
            {(templates ?? []).map((template) => (
              <option key={template.id} value={template.id}>{template.name} ({template.tasks.length} tasks)</option>
            ))}
          </SelectInput>
        </FormField>

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField id="plan-starts" label={kind === "onboarding" ? "First day" : "Plan starts"} required error={errors.startsOn}>
            <TextInput id="plan-starts" type="date" value={startsOn} onChange={(e) => setStartsOn(e.target.value)} invalid={Boolean(errors.startsOn)}
              aria-describedby={fieldDescribedBy("plan-starts", { error: Boolean(errors.startsOn) })} />
          </FormField>
          <FormField id="plan-target" label={kind === "onboarding" ? "Finish by" : "Last working day"} required error={errors.targetDate}>
            <TextInput id="plan-target" type="date" value={targetDate} min={startsOn} onChange={(e) => setTargetDate(e.target.value)} invalid={Boolean(errors.targetDate)}
              aria-describedby={fieldDescribedBy("plan-target", { error: Boolean(errors.targetDate) })} />
          </FormField>
        </div>

        {kind === "offboarding" && (
          <FormField id="plan-exit" label="Leaves as" required hint="Their employment status when you complete the plan." error={errors.exitStatus}>
            <SelectInput id="plan-exit" value={exitStatus} onChange={(e) => setExitStatus(e.target.value as ExitStatus)}
              aria-describedby={fieldDescribedBy("plan-exit", { hint: true, error: Boolean(errors.exitStatus) })}>
              {(Object.keys(exitStatusLabels) as ExitStatus[]).map((status) => <option key={status} value={status}>{exitStatusLabels[status]}</option>)}
            </SelectInput>
          </FormField>
        )}
      </form>
    </Modal>
  );
}
