import axios from "axios";
import { CalendarClock } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { getApiErrorMessage } from "../../api/axios";
import { createEvent, updateEvent } from "../../api/workplaceApi";
import type { CompanyEvent } from "../../types/workplace";
import Alert from "../ui/Alert";
import Button from "../ui/Button";
import FormField from "../ui/FormField";
import { fieldDescribedBy } from "../ui/fieldStyles";
import Modal from "../ui/Modal";
import SecondaryButton from "../ui/SecondaryButton";
import TextArea from "../ui/TextArea";
import TextInput from "../ui/TextInput";

interface Draft {
  title: string;
  startsOn: string;
  endsOn: string;
  startTime: string;
  endTime: string;
  location: string;
  description: string;
}

function draftFrom(event: CompanyEvent | null, date: string): Draft {
  return {
    title: event?.title ?? "",
    startsOn: event?.startsOn ?? date,
    endsOn: event?.endsOn ?? date,
    startTime: event?.startTime ?? "",
    endTime: event?.endTime ?? "",
    location: event?.location ?? "",
    description: event?.description ?? "",
  };
}

/** HR adds or edits a company event. The server validates again and checks the revision. */
export default function EventDialog({ isOpen, event, defaultDate, onClose, onSaved }: {
  isOpen: boolean;
  event: CompanyEvent | null;
  defaultDate: string;
  onClose: () => void;
  onSaved: (event: CompanyEvent, message: string) => void;
}) {
  const [draft, setDraft] = useState<Draft>(() => draftFrom(event, defaultDate));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setDraft(draftFrom(event, defaultDate));
      setErrors({});
      setFormError("");
    }
  }, [isOpen, event, defaultDate]);

  const set = (field: keyof Draft) => (value: string) => setDraft((current) => ({ ...current, [field]: value }));

  async function submit(submitEvent: FormEvent) {
    submitEvent.preventDefault();
    setIsSaving(true);
    setErrors({});
    setFormError("");
    const input = {
      title: draft.title,
      startsOn: draft.startsOn,
      endsOn: draft.endsOn || draft.startsOn,
      startTime: draft.startTime || null,
      endTime: draft.endTime || null,
      location: draft.location.trim() || null,
      description: draft.description.trim() || null,
    };
    try {
      const saved = event
        ? await updateEvent(event.id, { ...input, revision: event.revision })
        : await createEvent(input);
      onSaved(saved, event ? "Event saved." : "Event added.");
    } catch (requestError) {
      if (axios.isAxiosError(requestError) && requestError.response?.data?.errors) {
        setErrors(requestError.response.data.errors as Record<string, string>);
      }
      setFormError(getApiErrorMessage(requestError, "The event could not be saved."));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={event ? "Edit event" : "Add a company event"}
      description="Everyone in the company sees events on the calendar."
      icon={<CalendarClock size={20} aria-hidden="true" />}
      size="md"
      isDismissDisabled={isSaving}
      footer={
        <>
          <SecondaryButton onClick={onClose} disabled={isSaving}>Cancel</SecondaryButton>
          <Button type="submit" form="event-form" isLoading={isSaving} loadingLabel="Saving…">
            {event ? "Save event" : "Add event"}
          </Button>
        </>
      }
    >
      <form id="event-form" onSubmit={submit} className="space-y-4" noValidate>
        {formError && <Alert tone="danger">{formError}</Alert>}
        <FormField id="event-title" label="Title" required error={errors.title}>
          <TextInput
            id="event-title"
            value={draft.title}
            maxLength={120}
            onChange={(e) => set("title")(e.target.value)}
            invalid={Boolean(errors.title)}
            aria-describedby={fieldDescribedBy("event-title", { error: Boolean(errors.title) })}
          />
        </FormField>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField id="event-starts" label="Starts" required error={errors.startsOn}>
            <TextInput id="event-starts" type="date" value={draft.startsOn} onChange={(e) => set("startsOn")(e.target.value)} invalid={Boolean(errors.startsOn)}
              aria-describedby={fieldDescribedBy("event-starts", { error: Boolean(errors.startsOn) })} />
          </FormField>
          <FormField id="event-ends" label="Ends" hint="Leave as the start date for a one-day event." error={errors.endsOn}>
            <TextInput id="event-ends" type="date" value={draft.endsOn} min={draft.startsOn} onChange={(e) => set("endsOn")(e.target.value)} invalid={Boolean(errors.endsOn)}
              aria-describedby={fieldDescribedBy("event-ends", { hint: true, error: Boolean(errors.endsOn) })} />
          </FormField>
          <FormField id="event-start-time" label="Start time" hint="Optional, company time." error={errors.startTime}>
            <TextInput id="event-start-time" type="time" value={draft.startTime} onChange={(e) => set("startTime")(e.target.value)} invalid={Boolean(errors.startTime)}
              aria-describedby={fieldDescribedBy("event-start-time", { hint: true, error: Boolean(errors.startTime) })} />
          </FormField>
          <FormField id="event-end-time" label="End time" hint="Optional." error={errors.endTime}>
            <TextInput id="event-end-time" type="time" value={draft.endTime} onChange={(e) => set("endTime")(e.target.value)} invalid={Boolean(errors.endTime)}
              aria-describedby={fieldDescribedBy("event-end-time", { hint: true, error: Boolean(errors.endTime) })} />
          </FormField>
        </div>
        <FormField id="event-location" label="Location" error={errors.location}>
          <TextInput id="event-location" value={draft.location} maxLength={120} onChange={(e) => set("location")(e.target.value)} invalid={Boolean(errors.location)}
            aria-describedby={fieldDescribedBy("event-location", { error: Boolean(errors.location) })} />
        </FormField>
        <FormField id="event-description" label="Details" hint={`${draft.description.length} of 1000 characters.`} error={errors.description}>
          <TextArea id="event-description" rows={3} value={draft.description} maxLength={1000} onChange={(e) => set("description")(e.target.value)}
            aria-describedby={fieldDescribedBy("event-description", { hint: true, error: Boolean(errors.description) })} />
        </FormField>
      </form>
    </Modal>
  );
}
