import { Save, Send } from "lucide-react";
import { useState } from "react";
import type { ReviewRating } from "../../types/performance";
import { cn } from "../../utils/cn";
import ConfirmationModal from "../common/ConfirmationModal";
import Button from "../ui/Button";
import FormField from "../ui/FormField";
import { fieldDescribedBy } from "../ui/fieldStyles";
import TextArea from "../ui/TextArea";

const SUMMARY_MAX = 4000;

/**
 * Write a review: the words and a 1-5 rating. Drafts stay with their writer;
 * submitting is final, so it asks first.
 */
export default function ReviewForm({ idPrefix, label, initialSummary, initialRating, scale, busy, errors, onSave, submitWarning }: {
  idPrefix: string;
  label: string;
  initialSummary: string | null;
  initialRating: number | null;
  scale: ReviewRating[];
  busy: boolean;
  errors: Record<string, string>;
  onSave: (summary: string | null, rating: number | null, submit: boolean) => void;
  submitWarning: string;
}) {
  const [summary, setSummary] = useState(initialSummary ?? "");
  const [rating, setRating] = useState<number | null>(initialRating);
  const [confirming, setConfirming] = useState(false);

  return (
    <div className="space-y-4">
      <FormField id={`${idPrefix}-summary`} label={label} hint={`${summary.length} of ${SUMMARY_MAX} characters. Specific examples help.`} error={errors.summary}>
        <TextArea id={`${idPrefix}-summary`} rows={8} maxLength={SUMMARY_MAX} value={summary} onChange={(e) => setSummary(e.target.value)}
          aria-invalid={Boolean(errors.summary) || undefined}
          aria-describedby={fieldDescribedBy(`${idPrefix}-summary`, { hint: true, error: Boolean(errors.summary) })} />
      </FormField>
      <fieldset>
        <legend className="mb-2 text-sm font-medium text-fg-muted">Rating</legend>
        <div className="grid gap-2 sm:grid-cols-5">
          {scale.map((option) => (
            <label key={option.value} className={cn(
              "flex cursor-pointer flex-col items-center rounded-xl border p-2 text-center transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring",
              rating === option.value ? "border-primary bg-primary-soft" : "border-control-border hover:bg-surface-muted",
            )}>
              <input type="radio" name={`${idPrefix}-rating`} value={option.value} checked={rating === option.value} onChange={() => setRating(option.value)} className="sr-only" />
              <span className={cn("text-lg font-bold tabular-nums", rating === option.value ? "text-primary" : "text-fg")}>{option.value}</span>
              <span className="text-xs text-fg-muted">{option.label}</span>
            </label>
          ))}
        </div>
        {errors.rating && <p className="mt-1 text-sm text-danger-fg">{errors.rating}</p>}
      </fieldset>
      <div className="flex flex-wrap justify-end gap-2 border-t border-line pt-4">
        <Button variant="secondary" icon={Save} disabled={busy} onClick={() => onSave(summary.trim() || null, rating, false)}>Save draft</Button>
        <Button icon={Send} disabled={busy || !summary.trim() || rating === null} onClick={() => setConfirming(true)}>Submit</Button>
      </div>
      <ConfirmationModal
        isOpen={confirming}
        isProcessing={busy}
        tone="primary"
        title="Submit this review?"
        description={submitWarning}
        confirmLabel="Submit"
        processingLabel="Submitting…"
        onCancel={() => setConfirming(false)}
        onConfirm={() => { setConfirming(false); onSave(summary.trim() || null, rating, true); }}
      />
    </div>
  );
}
