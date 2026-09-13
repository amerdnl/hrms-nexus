import axios from "axios";
import { CalendarHeart, ChevronLeft, ChevronRight, Pencil, Plus, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { getApiErrorMessage } from "../../api/axios";
import { createHoliday, deleteHoliday, listHolidays, updateHoliday } from "../../api/workplaceApi";
import type { Holiday } from "../../types/workplace";
import ConfirmationModal from "../common/ConfirmationModal";
import Alert from "../ui/Alert";
import Button from "../ui/Button";
import EmptyState from "../ui/EmptyState";
import FormField from "../ui/FormField";
import { fieldDescribedBy } from "../ui/fieldStyles";
import SectionCard from "../ui/SectionCard";
import { SkeletonText } from "../ui/Skeleton";
import TextInput from "../ui/TextInput";

function weekday(date: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
}

/**
 * Company holidays, one per date, managed a year at a time. Saved on their
 * own - separately from the settings form above - and checked against the
 * revision each row was loaded at.
 */
export default function HolidaysCard() {
  const [year, setYear] = useState<number | null>(null);
  const [holidays, setHolidays] = useState<Holiday[] | null>(null);
  const [loadError, setLoadError] = useState("");
  const [draft, setDraft] = useState({ date: "", name: "" });
  const [draftErrors, setDraftErrors] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState<Holiday | null>(null);
  const [editErrors, setEditErrors] = useState<Record<string, string>>({});
  const [removing, setRemoving] = useState<Holiday | null>(null);
  const [busy, setBusy] = useState<"add" | "edit" | "remove" | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const load = useCallback((which?: number) => {
    setHolidays(null);
    setLoadError("");
    listHolidays(which)
      .then((result) => {
        setYear(result.year);
        setHolidays(result.holidays);
      })
      .catch((requestError) => setLoadError(getApiErrorMessage(requestError, "Holidays could not be loaded.")));
  }, []);

  useEffect(() => load(), [load]);

  function fieldErrors(requestError: unknown): Record<string, string> {
    return axios.isAxiosError(requestError) && requestError.response?.data?.errors
      ? requestError.response.data.errors as Record<string, string>
      : {};
  }

  async function add(event: FormEvent) {
    event.preventDefault();
    setBusy("add");
    setDraftErrors({});
    setError("");
    try {
      const created = await createHoliday(draft);
      setNotice(`${created.name} added.`);
      setDraft({ date: "", name: "" });
      load(Number(created.date.slice(0, 4)));
    } catch (requestError) {
      setDraftErrors(fieldErrors(requestError));
      setError(getApiErrorMessage(requestError, "The holiday could not be added."));
    } finally {
      setBusy(null);
    }
  }

  async function saveEdit(event: FormEvent) {
    event.preventDefault();
    if (!editing) return;
    setBusy("edit");
    setEditErrors({});
    setError("");
    try {
      const saved = await updateHoliday(editing.id, { date: editing.date, name: editing.name, revision: editing.revision });
      setNotice(`${saved.name} saved.`);
      setEditing(null);
      load(Number(saved.date.slice(0, 4)));
    } catch (requestError) {
      setEditErrors(fieldErrors(requestError));
      setError(getApiErrorMessage(requestError, "The holiday could not be saved."));
    } finally {
      setBusy(null);
    }
  }

  async function confirmRemove() {
    if (!removing) return;
    setBusy("remove");
    setError("");
    try {
      await deleteHoliday(removing.id);
      setNotice(`${removing.name} removed.`);
      load(year ?? undefined);
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, "The holiday could not be removed."));
    } finally {
      setBusy(null);
      setRemoving(null);
    }
  }

  return (
    <SectionCard
      title="Company holidays"
      description="Non-working days for everyone. They show on the company calendar."
      icon={CalendarHeart}
      actions={year !== null && (
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" icon={ChevronLeft} aria-label={`Holidays in ${year - 1}`} onClick={() => load(year - 1)} />
          <span className="min-w-12 text-center text-sm font-semibold text-fg" aria-live="polite">{year}</span>
          <Button variant="ghost" size="sm" icon={ChevronRight} aria-label={`Holidays in ${year + 1}`} onClick={() => load(year + 1)} />
        </div>
      )}
    >
      <div className="space-y-5">
        {notice && <Alert tone="success" onDismiss={() => setNotice("")}>{notice}</Alert>}
        {error && <Alert tone="danger" onDismiss={() => setError("")}>{error}</Alert>}

        <form onSubmit={add} className="grid gap-3 sm:grid-cols-[10rem_minmax(0,1fr)_auto] sm:items-end" noValidate>
          <FormField id="holiday-date" label="Date" error={draftErrors.date}>
            <TextInput id="holiday-date" type="date" value={draft.date} onChange={(event) => setDraft({ ...draft, date: event.target.value })}
              invalid={Boolean(draftErrors.date)} aria-describedby={fieldDescribedBy("holiday-date", { error: Boolean(draftErrors.date) })} />
          </FormField>
          <FormField id="holiday-name" label="Name" error={draftErrors.name}>
            <TextInput id="holiday-name" value={draft.name} maxLength={120} placeholder="e.g. Malaysia Day" onChange={(event) => setDraft({ ...draft, name: event.target.value })}
              invalid={Boolean(draftErrors.name)} aria-describedby={fieldDescribedBy("holiday-name", { error: Boolean(draftErrors.name) })} />
          </FormField>
          <Button type="submit" icon={Plus} isLoading={busy === "add"} loadingLabel="Adding…" disabled={!draft.date || !draft.name.trim()}>Add</Button>
        </form>

        {loadError ? (
          <p className="text-sm text-danger-fg">{loadError}</p>
        ) : holidays === null ? (
          <SkeletonText lines={3} />
        ) : holidays.length === 0 ? (
          <EmptyState icon={CalendarHeart} title={`No holidays in ${year}`} description="Add the company's non-working days above." className="py-6" />
        ) : (
          <ul className="divide-y divide-line rounded-xl border border-line" aria-label={`Holidays in ${year}`}>
            {holidays.map((holiday) => (
              <li key={holiday.id} className="px-4 py-3">
                {editing?.id === holiday.id ? (
                  <form onSubmit={saveEdit} className="grid gap-3 sm:grid-cols-[10rem_minmax(0,1fr)_auto] sm:items-end" noValidate>
                    <FormField id={`holiday-edit-date-${holiday.id}`} label="Date" error={editErrors.date}>
                      <TextInput id={`holiday-edit-date-${holiday.id}`} type="date" value={editing.date} onChange={(event) => setEditing({ ...editing, date: event.target.value })} invalid={Boolean(editErrors.date)} />
                    </FormField>
                    <FormField id={`holiday-edit-name-${holiday.id}`} label="Name" error={editErrors.name}>
                      <TextInput id={`holiday-edit-name-${holiday.id}`} value={editing.name} maxLength={120} onChange={(event) => setEditing({ ...editing, name: event.target.value })} invalid={Boolean(editErrors.name)} />
                    </FormField>
                    <div className="flex gap-2">
                      <Button type="submit" size="sm" isLoading={busy === "edit"} loadingLabel="Saving…">Save</Button>
                      <Button variant="ghost" size="sm" icon={X} onClick={() => { setEditing(null); setEditErrors({}); }} aria-label="Cancel editing" />
                    </div>
                  </form>
                ) : (
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="w-28 shrink-0 text-sm font-medium text-fg-muted">{weekday(holiday.date)}</span>
                    <span className="min-w-0 flex-1 text-sm font-semibold text-fg [overflow-wrap:anywhere]">{holiday.name}</span>
                    <Button variant="ghost" size="sm" icon={Pencil} onClick={() => setEditing(holiday)} aria-label={`Edit ${holiday.name}`} />
                    <Button variant="ghost" size="sm" icon={Trash2} onClick={() => setRemoving(holiday)} aria-label={`Remove ${holiday.name}`} />
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <ConfirmationModal
        isOpen={removing !== null}
        isProcessing={busy === "remove"}
        title="Remove this holiday?"
        description={removing ? `${removing.name} on ${weekday(removing.date)} will no longer be a company holiday.` : ""}
        confirmLabel="Remove holiday"
        processingLabel="Removing…"
        onCancel={() => setRemoving(null)}
        onConfirm={() => void confirmRemove()}
      />
    </SectionCard>
  );
}
