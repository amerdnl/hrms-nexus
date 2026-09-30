import { useState } from "react";
import { getApiErrorMessage } from "../../api/axios";
import { createRelationship, removeRelationship, type RelationshipKind } from "../../api/orgApi";
import Alert from "../../components/ui/Alert";
import Button from "../../components/ui/Button";
import FormField from "../../components/ui/FormField";
import Modal from "../../components/ui/Modal";
import SelectInput from "../../components/ui/SelectInput";

/**
 * Creating or removing one reporting line, drawn between two cards.
 *
 * A line on an org chart is a statement about who answers to whom, so it is
 * never created by the act of dragging alone: the two positions are named back
 * to the administrator, and they say which kind of line they mean before
 * anything is written.
 *
 * The primary manager is the line the rest of HR Nexus runs on - team scope,
 * leave approval, who may see whose attendance - and there can only be one.
 * Additional lines are for people who genuinely answer to more than one person;
 * the chart draws them and nothing operational reads them.
 */
interface Props {
  childId: number;
  parentId: number;
  childName: string;
  parentName: string;
  /** True when an existing line was clicked, rather than a new one drawn. */
  existing: boolean;
  onClose: () => void;
  onSaved: () => void;
}

export default function RelationshipDialog({ childId, parentId, childName, parentName, existing, onClose, onSaved }: Props) {
  const [kind, setKind] = useState<RelationshipKind>("additional");
  const [confidence, setConfidence] = useState<"confirmed" | "unconfirmed">("confirmed");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [confirmRemove, setConfirmRemove] = useState(false);

  const run = async (action: () => Promise<void>, failure: string) => {
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

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={existing ? "Reporting line" : "Create reporting relationship"}
      size="md"
      isDismissDisabled={busy}
      footer={
        <div className="flex w-full flex-wrap items-center justify-between gap-2">
          {existing ? (
            confirmRemove ? (
              <span className="flex items-center gap-2 text-sm text-fg-muted">
                Remove this line?
                <Button variant="danger" size="sm" isLoading={busy} onClick={() => run(() => removeRelationship(childId, parentId), "The line could not be removed.")}>Remove</Button>
                <Button variant="ghost" size="sm" onClick={() => setConfirmRemove(false)}>Keep it</Button>
              </span>
            ) : (
              <Button variant="ghost" size="sm" disabled={busy} onClick={() => setConfirmRemove(true)}>Remove relationship</Button>
            )
          ) : <span />}
          <span className="flex gap-2">
            <Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
            <Button
              variant="primary"
              isLoading={busy}
              onClick={() => run(() => createRelationship({ childId, parentId, kind, confidence }), "The line could not be saved.")}
            >
              {existing ? "Change" : "Create"}
            </Button>
          </span>
        </div>
      }
    >
      <div className="space-y-4">
        {message && <Alert tone="danger" title="That did not save">{message}</Alert>}

        <dl className="rounded-card border border-line bg-surface-muted px-3.5 py-3 text-sm">
          <div className="flex gap-2"><dt className="w-16 text-fg-muted">From</dt><dd className="font-medium text-fg">{childName}</dd></div>
          <div className="mt-1 flex gap-2"><dt className="w-16 text-fg-muted">To</dt><dd className="font-medium text-fg">{parentName}</dd></div>
        </dl>

        <FormField
          id="rel-kind"
          label="Relationship"
          hint="Only the primary manager is used for team scope and leave approval, and a position has one."
        >
          <SelectInput id="rel-kind" value={kind} onChange={(event) => setKind(event.target.value as RelationshipKind)}>
            <option value="additional">Additional reporting relationship</option>
            <option value="primary">Primary manager</option>
          </SelectInput>
        </FormField>

        <FormField id="rel-confidence" label="Confidence" hint="An unconfirmed line is drawn differently and labelled on the card.">
          <SelectInput
            id="rel-confidence"
            value={confidence}
            onChange={(event) => setConfidence(event.target.value as "confirmed" | "unconfirmed")}
          >
            <option value="confirmed">Confirmed</option>
            <option value="unconfirmed">Unconfirmed</option>
          </SelectInput>
        </FormField>
      </div>
    </Modal>
  );
}
