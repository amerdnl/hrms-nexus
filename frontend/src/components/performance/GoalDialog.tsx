import axios from "axios";
import { Target } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { getApiErrorMessage } from "../../api/axios";
import { createGoal, updateGoal } from "../../api/performanceApi";
import { getCalendarConfig } from "../../api/workplaceApi";
import type { Goal, GoalVisibility } from "../../types/performance";
import { visibilityDescriptions, visibilityLabels } from "../../types/performance";
import { cn } from "../../utils/cn";
import Alert from "../ui/Alert";
import Button from "../ui/Button";
import FormField from "../ui/FormField";
import { fieldDescribedBy } from "../ui/fieldStyles";
import Modal from "../ui/Modal";
import SecondaryButton from "../ui/SecondaryButton";
import SelectInput from "../ui/SelectInput";
import TextArea from "../ui/TextArea";
import TextInput from "../ui/TextInput";

function addDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

/**
 * Create a goal, or edit one. A manager setting a goal for a report picks the
 * report from `owners`; the server checks the reporting line again.
 */
export default function GoalDialog({ isOpen, goal, owners, onClose, onSaved }: {
  isOpen: boolean;
  /** Present when editing. */
  goal?: Goal | null;
  /** Present when a manager sets a goal for someone else. */
  owners?: Array<{ id: number; name: string }>;
  onClose: () => void;
  onSaved: (id: number, message: string) => void;
}) {
  const [ownerId, setOwnerId] = useState<number | "">("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [startsOn, setStartsOn] = useState("");
  const [dueOn, setDueOn] = useState("");
  const [visibility, setVisibility] = useState<GoalVisibility>("private");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setErrors({});
    setFormError("");
    if (goal) {
      setTitle(goal.title);
      setDescription(goal.description ?? "");
      setStartsOn(goal.startsOn);
      setDueOn(goal.dueOn);
      setVisibility(goal.visibility);
      return;
    }
    setOwnerId(owners?.[0]?.id ?? "");
    setTitle("");
    setDescription("");
    setVisibility("private");
    getCalendarConfig()
      .then((config) => {
        setStartsOn(config.today);
        setDueOn(addDays(config.today, 90));
      })
      .catch(() => undefined);
  }, [isOpen, goal, owners]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setIsSaving(true);
    setErrors({});
    setFormError("");
    const input = { title, description: description.trim() || null, startsOn, dueOn, visibility };
    try {
      if (goal) {
        await updateGoal(goal.id, { ...input, revision: goal.revision });
        onSaved(goal.id, "Goal saved.");
      } else {
        const id = await createGoal(owners ? { ...input, ownerId: Number(ownerId) } : input);
        onSaved(id, owners ? "Goal set. They have been told." : "Goal saved.");
      }
    } catch (requestError) {
      if (axios.isAxiosError(requestError) && requestError.response?.data?.errors) {
        setErrors(requestError.response.data.errors as Record<string, string>);
      }
      setFormError(getApiErrorMessage(requestError, "The goal could not be saved."));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={goal ? "Edit goal" : owners ? "Set a goal for your team" : "New goal"}
      description="Progress is a percentage the owner or their manager records as it moves."
      icon={<Target size={20} aria-hidden="true" />}
      size="md"
      isDismissDisabled={isSaving}
      footer={
        <>
          <SecondaryButton onClick={onClose} disabled={isSaving}>Cancel</SecondaryButton>
          <Button type="submit" form="goal-form" isLoading={isSaving} loadingLabel="Saving…">Save goal</Button>
        </>
      }
    >
      <form id="goal-form" onSubmit={submit} className="space-y-4" noValidate>
        {formError && <Alert tone="danger">{formError}</Alert>}
        {owners && !goal && (
          <FormField id="goal-owner" label="For" required error={errors.ownerId}>
            <SelectInput id="goal-owner" value={ownerId} onChange={(e) => setOwnerId(Number(e.target.value) || "")} invalid={Boolean(errors.ownerId)}>
              {owners.map((owner) => <option key={owner.id} value={owner.id}>{owner.name}</option>)}
            </SelectInput>
          </FormField>
        )}
        <FormField id="goal-title" label="Goal" required error={errors.title}>
          <TextInput id="goal-title" value={title} maxLength={160} onChange={(e) => setTitle(e.target.value)} invalid={Boolean(errors.title)}
            aria-describedby={fieldDescribedBy("goal-title", { error: Boolean(errors.title) })} />
        </FormField>
        <FormField id="goal-description" label="What done looks like" hint={`${description.length} of 2000 characters.`} error={errors.description}>
          <TextArea id="goal-description" rows={3} maxLength={2000} value={description} onChange={(e) => setDescription(e.target.value)}
            aria-describedby={fieldDescribedBy("goal-description", { hint: true, error: Boolean(errors.description) })} />
        </FormField>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField id="goal-starts" label="Starts" required error={errors.startsOn}>
            <TextInput id="goal-starts" type="date" value={startsOn} onChange={(e) => setStartsOn(e.target.value)} invalid={Boolean(errors.startsOn)} />
          </FormField>
          <FormField id="goal-due" label="Due" required error={errors.dueOn}>
            <TextInput id="goal-due" type="date" value={dueOn} min={startsOn} onChange={(e) => setDueOn(e.target.value)} invalid={Boolean(errors.dueOn)} />
          </FormField>
        </div>
        <fieldset>
          <legend className="mb-2 text-sm font-medium text-fg-muted">Who can see it</legend>
          <div className="grid gap-2 sm:grid-cols-3">
            {(Object.keys(visibilityLabels) as GoalVisibility[]).map((key) => (
              <label key={key} className={cn(
                "flex cursor-pointer flex-col rounded-xl border p-3 transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring",
                visibility === key ? "border-primary bg-primary-soft" : "border-control-border hover:bg-surface-muted",
              )}>
                <input type="radio" name="goal-visibility" value={key} checked={visibility === key} onChange={() => setVisibility(key)} className="sr-only" />
                <span className={cn("text-sm font-semibold", visibility === key ? "text-primary" : "text-fg")}>{visibilityLabels[key]}</span>
                <span className="mt-0.5 text-xs text-fg-muted">{visibilityDescriptions[key]}</span>
              </label>
            ))}
          </div>
          {errors.visibility && <p className="mt-1 text-sm text-danger-fg">{errors.visibility}</p>}
        </fieldset>
      </form>
    </Modal>
  );
}
