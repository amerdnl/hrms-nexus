import { useState } from "react";
import { getApiErrorMessage } from "../../api/axios";
import { createNote, deleteNote, updateNote } from "../../api/orgApi";
import Alert from "../../components/ui/Alert";
import Button from "../../components/ui/Button";
import FormField from "../../components/ui/FormField";
import Modal from "../../components/ui/Modal";
import TextArea from "../../components/ui/TextArea";
import TextInput from "../../components/ui/TextInput";
import type { OrgSourceNote } from "../../types/people";

/**
 * An information panel on the chart: a heading and some lines of context.
 *
 * Deliberately not a position. A panel describes a team's remit or the streams
 * a function sells into; it holds no post, manages nobody, and is counted in
 * nothing. Keeping it a separate kind of thing is what stops a caption turning
 * into four imaginary jobs.
 */
interface Props {
  note: OrgSourceNote | { id: null };
  onClose: () => void;
  onSaved: () => void;
}

export default function NoteDialog({ note, onClose, onSaved }: Props) {
  const existing = note.id !== null ? (note as OrgSourceNote) : null;
  const [label, setLabel] = useState(existing?.label ?? "");
  const [body, setBody] = useState(existing?.body ?? "");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [confirmRemove, setConfirmRemove] = useState(false);

  const run = async (action: () => Promise<unknown>, failure: string) => {
    setBusy(true);
    setMessage("");
    try {
      await action();
      onSaved();
    } catch (error) {
      setMessage(getApiErrorMessage(error, failure));
      setConfirmRemove(false);
    } finally {
      setBusy(false);
    }
  };

  const save = () =>
    run(
      () =>
        existing
          ? updateNote(existing.id, { label, body: body.trim() || null })
          : createNote({ label, body: body.trim() || null, x: 0.2, y: 0.2 }),
      "The panel could not be saved.",
    );

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={existing ? "Edit information panel" : "Add information panel"}
      description="Context on the chart. Not a position, and counted in nothing."
      size="md"
      isDismissDisabled={busy}
      footer={
        <div className="flex w-full flex-wrap items-center justify-between gap-2">
          {existing ? (
            confirmRemove ? (
              <span className="flex items-center gap-2 text-sm text-fg-muted">
                Remove this panel?
                <Button variant="danger" size="sm" isLoading={busy} onClick={() => run(() => deleteNote(existing.id), "The panel could not be removed.")}>Remove</Button>
                <Button variant="ghost" size="sm" onClick={() => setConfirmRemove(false)}>Keep it</Button>
              </span>
            ) : (
              <Button variant="ghost" size="sm" disabled={busy} onClick={() => setConfirmRemove(true)}>Remove panel</Button>
            )
          ) : <span />}
          <span className="flex gap-2">
            <Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
            <Button variant="primary" isLoading={busy} onClick={save}>Save</Button>
          </span>
        </div>
      }
    >
      <div className="space-y-4">
        {message && <Alert tone="danger" title="That did not save">{message}</Alert>}
        <FormField id="note-label" label="Heading">
          <TextInput id="note-label" value={label} onChange={(event) => setLabel(event.target.value)} placeholder="SALES / BD Functions" />
        </FormField>
        <FormField id="note-body" label="Lines" hint="One per line.">
          <TextArea id="note-body" rows={4} value={body} onChange={(event) => setBody(event.target.value)} />
        </FormField>
      </div>
    </Modal>
  );
}
