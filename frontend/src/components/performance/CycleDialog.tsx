import axios from "axios";
import { CalendarRange } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { getApiErrorMessage } from "../../api/axios";
import { createCycle, updateCycle, type CycleInput } from "../../api/performanceApi";
import type { ReviewCycle } from "../../types/performance";
import Alert from "../ui/Alert";
import Button from "../ui/Button";
import FormField from "../ui/FormField";
import Modal from "../ui/Modal";
import SecondaryButton from "../ui/SecondaryButton";
import TextInput from "../ui/TextInput";

const blank: CycleInput = { name: "", periodStart: "", periodEnd: "", selfDueOn: "", managerDueOn: "" };

/** HR drafts or edits a review cycle. Nothing is sent to anyone until it is opened. */
export default function CycleDialog({ isOpen, cycle, onClose, onSaved }: {
  isOpen: boolean;
  cycle?: ReviewCycle | null;
  onClose: () => void;
  onSaved: (id: number) => void;
}) {
  const [draft, setDraft] = useState<CycleInput>(blank);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setErrors({});
    setFormError("");
    setDraft(cycle ? { name: cycle.name, periodStart: cycle.periodStart, periodEnd: cycle.periodEnd, selfDueOn: cycle.selfDueOn, managerDueOn: cycle.managerDueOn } : blank);
  }, [isOpen, cycle]);

  const set = (field: keyof CycleInput) => (value: string) => setDraft((current) => ({ ...current, [field]: value }));

  async function submit(event: FormEvent) {
    event.preventDefault();
    setIsSaving(true);
    setErrors({});
    setFormError("");
    try {
      if (cycle) {
        await updateCycle(cycle.id, { ...draft, revision: cycle.revision });
        onSaved(cycle.id);
      } else {
        onSaved(await createCycle(draft));
      }
    } catch (requestError) {
      if (axios.isAxiosError(requestError) && requestError.response?.data?.errors) setErrors(requestError.response.data.errors as Record<string, string>);
      setFormError(getApiErrorMessage(requestError, "The cycle could not be saved."));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={cycle ? "Edit draft cycle" : "New review cycle"}
      description="Drafts are private to HR. Opening a cycle creates each person's review and tells them."
      icon={<CalendarRange size={20} aria-hidden="true" />}
      size="md"
      isDismissDisabled={isSaving}
      footer={
        <>
          <SecondaryButton onClick={onClose} disabled={isSaving}>Cancel</SecondaryButton>
          <Button type="submit" form="cycle-form" isLoading={isSaving} loadingLabel="Saving…">Save draft</Button>
        </>
      }
    >
      <form id="cycle-form" onSubmit={submit} className="space-y-4" noValidate>
        {formError && <Alert tone="danger">{formError}</Alert>}
        <FormField id="cycle-name" label="Name" required error={errors.name}>
          <TextInput id="cycle-name" value={draft.name} maxLength={120} placeholder="e.g. Mid-year 2026" onChange={(e) => set("name")(e.target.value)} invalid={Boolean(errors.name)} />
        </FormField>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField id="cycle-period-start" label="Period starts" required error={errors.periodStart}>
            <TextInput id="cycle-period-start" type="date" value={draft.periodStart} onChange={(e) => set("periodStart")(e.target.value)} invalid={Boolean(errors.periodStart)} />
          </FormField>
          <FormField id="cycle-period-end" label="Period ends" required error={errors.periodEnd}>
            <TextInput id="cycle-period-end" type="date" value={draft.periodEnd} min={draft.periodStart} onChange={(e) => set("periodEnd")(e.target.value)} invalid={Boolean(errors.periodEnd)} />
          </FormField>
          <FormField id="cycle-self-due" label="Self-reviews due" required error={errors.selfDueOn}>
            <TextInput id="cycle-self-due" type="date" value={draft.selfDueOn} onChange={(e) => set("selfDueOn")(e.target.value)} invalid={Boolean(errors.selfDueOn)} />
          </FormField>
          <FormField id="cycle-manager-due" label="Manager reviews due" required error={errors.managerDueOn}>
            <TextInput id="cycle-manager-due" type="date" value={draft.managerDueOn} min={draft.selfDueOn} onChange={(e) => set("managerDueOn")(e.target.value)} invalid={Boolean(errors.managerDueOn)} />
          </FormField>
        </div>
      </form>
    </Modal>
  );
}
