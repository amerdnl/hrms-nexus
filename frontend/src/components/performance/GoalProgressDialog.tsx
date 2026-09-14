import axios from "axios";
import { TrendingUp } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { getApiErrorMessage } from "../../api/axios";
import { recordGoalProgress } from "../../api/performanceApi";
import type { Goal, GoalStatus } from "../../types/performance";
import Alert from "../ui/Alert";
import Button from "../ui/Button";
import FormField from "../ui/FormField";
import { fieldDescribedBy } from "../ui/fieldStyles";
import Modal from "../ui/Modal";
import SecondaryButton from "../ui/SecondaryButton";
import SelectInput from "../ui/SelectInput";
import TextArea from "../ui/TextArea";
import TextInput from "../ui/TextInput";

/** Record where a goal stands: a percentage, whether it is still active, and an optional note. */
export default function GoalProgressDialog({ isOpen, goal, onClose, onSaved }: {
  isOpen: boolean;
  goal: Goal;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const [progress, setProgress] = useState(goal.progress);
  const [status, setStatus] = useState<GoalStatus>("active");
  const [note, setNote] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setProgress(goal.progress);
    setStatus("active");
    setNote("");
    setErrors({});
    setFormError("");
  }, [isOpen, goal]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setIsSaving(true);
    setErrors({});
    setFormError("");
    try {
      const message = await recordGoalProgress(goal.id, { progress: status === "completed" ? 100 : progress, status, note: note.trim() || null });
      onSaved(message);
    } catch (requestError) {
      if (axios.isAxiosError(requestError) && requestError.response?.data?.errors) {
        setErrors(requestError.response.data.errors as Record<string, string>);
      }
      setFormError(getApiErrorMessage(requestError, "Progress could not be recorded."));
    } finally {
      setIsSaving(false);
    }
  }

  const shown = status === "completed" ? 100 : progress;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Record progress"
      description={goal.title}
      icon={<TrendingUp size={20} aria-hidden="true" />}
      size="md"
      isDismissDisabled={isSaving}
      footer={
        <>
          <SecondaryButton onClick={onClose} disabled={isSaving}>Cancel</SecondaryButton>
          <Button type="submit" form="goal-progress-form" isLoading={isSaving} loadingLabel="Saving…">
            {status === "completed" ? "Complete goal" : status === "cancelled" ? "Cancel goal" : "Record progress"}
          </Button>
        </>
      }
    >
      <form id="goal-progress-form" onSubmit={submit} className="space-y-4" noValidate>
        {formError && <Alert tone="danger">{formError}</Alert>}
        <FormField id="goal-status" label="Status" error={errors.status}>
          <SelectInput id="goal-status" value={status} onChange={(e) => setStatus(e.target.value as GoalStatus)}>
            <option value="active">Still in progress</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
          </SelectInput>
        </FormField>
        <FormField id="goal-progress" label="Progress" hint={status === "completed" ? "A completed goal is at 100%." : "Whole percentage from 0 to 100."} error={errors.progress}>
          <div className="flex items-center gap-3">
            <input
              type="range" min={0} max={100} step={5} value={shown} disabled={status === "completed"}
              onChange={(e) => setProgress(Number(e.target.value))}
              aria-label="Progress percentage" className="min-w-0 flex-1 accent-[var(--color-primary)]"
            />
            {/* A fixed-width wrapper: the field's own full-width style would otherwise squeeze the slider to nothing. */}
            <div className="w-24 shrink-0">
              <TextInput id="goal-progress" type="number" min={0} max={100} value={shown} disabled={status === "completed"}
                onChange={(e) => setProgress(Math.max(0, Math.min(100, Number(e.target.value) || 0)))}
                aria-describedby={fieldDescribedBy("goal-progress", { hint: true, error: Boolean(errors.progress) })} />
            </div>
          </div>
        </FormField>
        <FormField id="goal-note" label="Note" hint="Optional. What moved, or why it changed." error={errors.note}>
          <TextArea id="goal-note" rows={3} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)}
            aria-describedby={fieldDescribedBy("goal-note", { hint: true, error: Boolean(errors.note) })} />
        </FormField>
      </form>
    </Modal>
  );
}
