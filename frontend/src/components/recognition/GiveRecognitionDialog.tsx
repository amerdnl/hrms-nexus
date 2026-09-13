import axios from "axios";
import { Award } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { getApiErrorMessage } from "../../api/axios";
import { getDirectory } from "../../api/peopleApi";
import { giveRecognition } from "../../api/recognitionApi";
import { useAuth } from "../../context/useAuth";
import type { PersonCard } from "../../types/people";
import type { RecognitionCategory } from "../../types/recognition";
import { categoryLabels } from "../../types/recognition";
import { cn } from "../../utils/cn";
import Alert from "../ui/Alert";
import Button from "../ui/Button";
import Checkbox from "../ui/Checkbox";
import FormField from "../ui/FormField";
import { fieldDescribedBy } from "../ui/fieldStyles";
import Modal from "../ui/Modal";
import SecondaryButton from "../ui/SecondaryButton";
import SelectInput from "../ui/SelectInput";
import TextArea from "../ui/TextArea";
import TextInput from "../ui/TextInput";

const MESSAGE_MAX = 500;

/**
 * Recognise a colleague: a category, a few words, and whether the company may
 * see it. The server enforces the limits (once a day per colleague, five a day
 * in total) and refuses yourself and anyone who has left.
 */
export default function GiveRecognitionDialog({ isOpen, receiver, onClose, onGiven }: {
  isOpen: boolean;
  receiver?: { id: number; name: string } | null;
  onClose: () => void;
  onGiven: (message: string) => void;
}) {
  const { user } = useAuth();
  const [search, setSearch] = useState("");
  const [people, setPeople] = useState<PersonCard[]>([]);
  const [receiverId, setReceiverId] = useState<number | "">(receiver?.id ?? "");
  const [category, setCategory] = useState<RecognitionCategory>("teamwork");
  const [message, setMessage] = useState("");
  const [isPrivate, setIsPrivate] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setReceiverId(receiver?.id ?? "");
    setCategory("teamwork");
    setMessage("");
    setIsPrivate(false);
    setErrors({});
    setFormError("");
    setSearch("");
  }, [isOpen, receiver]);

  useEffect(() => {
    if (!isOpen || receiver) return;
    const timer = window.setTimeout(() => {
      getDirectory({ search: search.trim() || undefined, pageSize: 50 })
        .then((page) => setPeople(page.people.filter((person) => person.id !== user?.employeeId)))
        .catch(() => setPeople([]));
    }, 200);
    return () => window.clearTimeout(timer);
  }, [isOpen, search, receiver, user?.employeeId]);

  const chosenName = receiver?.name ?? people.find((person) => person.id === receiverId)?.fullName ?? null;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setIsSaving(true);
    setErrors({});
    setFormError("");
    try {
      const result = await giveRecognition({
        receiverId: Number(receiverId), category, message, visibility: isPrivate ? "private" : "company",
      });
      onGiven(`Recognition sent to ${chosenName ?? "your colleague"}. You can give ${result.dailyLimit - result.givenToday} more today.`);
    } catch (requestError) {
      if (axios.isAxiosError(requestError) && requestError.response?.data?.errors) {
        setErrors(requestError.response.data.errors as Record<string, string>);
      }
      setFormError(getApiErrorMessage(requestError, "The recognition could not be sent."));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={receiver ? `Recognise ${receiver.name}` : "Recognise a colleague"}
      description="A short, specific thank-you. It is kept as written."
      icon={<Award size={20} aria-hidden="true" />}
      size="md"
      isDismissDisabled={isSaving}
      footer={
        <>
          <SecondaryButton onClick={onClose} disabled={isSaving}>Cancel</SecondaryButton>
          <Button type="submit" form="recognition-form" isLoading={isSaving} loadingLabel="Sending…">Send recognition</Button>
        </>
      }
    >
      <form id="recognition-form" onSubmit={submit} className="space-y-4" noValidate>
        {formError && <Alert tone="danger">{formError}</Alert>}

        {!receiver && (
          <>
            <FormField id="recognition-search" label="Find a colleague">
              <TextInput id="recognition-search" type="search" value={search} placeholder="Name, role or department" onChange={(e) => setSearch(e.target.value)} />
            </FormField>
            <FormField id="recognition-receiver" label="Colleague" required error={errors.receiverId}>
              <SelectInput id="recognition-receiver" value={receiverId} onChange={(e) => setReceiverId(Number(e.target.value) || "")} invalid={Boolean(errors.receiverId)}
                aria-describedby={fieldDescribedBy("recognition-receiver", { error: Boolean(errors.receiverId) })}>
                <option value="">Choose a colleague</option>
                {people.map((person) => <option key={person.id} value={person.id}>{[person.fullName, person.jobTitle].filter(Boolean).join(" · ")}</option>)}
              </SelectInput>
            </FormField>
          </>
        )}

        <fieldset>
          <legend className="mb-2 text-sm font-medium text-fg-muted">For</legend>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Category">
            {(Object.keys(categoryLabels) as RecognitionCategory[]).map((key) => (
              <label
                key={key}
                className={cn(
                  "inline-flex min-h-9 cursor-pointer items-center rounded-full border px-3 text-sm font-medium transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring",
                  category === key ? "border-primary bg-primary-soft text-primary" : "border-control-border text-fg-muted hover:bg-surface-muted",
                )}
              >
                <input type="radio" name="recognition-category" value={key} checked={category === key} onChange={() => setCategory(key)} className="sr-only" />
                {categoryLabels[key]}
              </label>
            ))}
          </div>
          {errors.category && <p className="mt-1 text-sm text-danger-fg">{errors.category}</p>}
        </fieldset>

        <FormField id="recognition-message" label="Message" required hint={`${message.trim().length} of ${MESSAGE_MAX} characters. Say what they did.`} error={errors.message}>
          <TextArea id="recognition-message" rows={4} maxLength={MESSAGE_MAX} value={message} onChange={(e) => setMessage(e.target.value)}
            aria-invalid={Boolean(errors.message) || undefined}
            aria-describedby={fieldDescribedBy("recognition-message", { hint: true, error: Boolean(errors.message) })} />
        </FormField>

        <Checkbox
          id="recognition-private"
          label="Keep it private"
          description={chosenName
            ? `Only ${chosenName} and HR will see it. Otherwise colleagues see it on their profile.`
            : "Only the person you recognise and HR will see it. Otherwise colleagues see it on their profile."}
          checked={isPrivate}
          onChange={(e) => setIsPrivate(e.target.checked)}
        />
      </form>
    </Modal>
  );
}
