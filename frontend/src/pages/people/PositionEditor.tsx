import { useEffect, useMemo, useState } from "react";
import { archivePosition, createPosition, updatePosition } from "../../api/orgApi";
import { getApiErrorMessage } from "../../api/axios";
import Alert from "../../components/ui/Alert";
import Button from "../../components/ui/Button";
import Checkbox from "../../components/ui/Checkbox";
import FormField from "../../components/ui/FormField";
import Modal from "../../components/ui/Modal";
import SelectInput from "../../components/ui/SelectInput";
import TextArea from "../../components/ui/TextArea";
import TextInput from "../../components/ui/TextInput";
import type { OrgNode } from "../../types/people";

/**
 * The editor for one position on the org chart.
 *
 * WHY A POSITION IS NOT AN OCCUPANT. The form keeps three questions apart: what
 * the position is, whether anybody holds it, and who. A post can be marked
 * filled without naming anyone, which is the honest state when HR knows the
 * seat is taken but has not been told by whom - and it is the state that stops
 * the chart inventing a colleague to fill a gap. Only choosing "Filled by" and
 * typing a name makes the record describe a person.
 *
 * WHY TWO KINDS OF MANAGER. The primary manager is the one the rest of HR Nexus
 * runs on: team scope, leave approval, who may see whose attendance. It is
 * single by design. Additional reporting lines are for people who genuinely
 * answer to more than one person; they are drawn on the chart and deliberately
 * change nothing operational.
 */

export interface PositionDraft {
  id: number | null;
  title: string;
  departmentId: number | null;
  positionKind: "staff" | "vacant" | "external";
  occupancy: "vacant" | "filled" | "filled_unnamed";
  occupantName: string | null;
  managerId: number | null;
  additionalManagerIds: number[];
  notes: string | null;
}

export function draftFrom(node: OrgNode): PositionDraft {
  const filled = node.occupancy === "filled" || node.positionKind === "staff";
  return {
    id: node.id,
    // A filled post shows the person's name, so its title lives in job title.
    title: (filled && node.jobTitle ? node.jobTitle : node.fullName) || node.fullName,
    departmentId: node.departmentId,
    positionKind: node.positionKind,
    occupancy: node.occupancy ?? (node.positionKind === "staff" ? "filled" : "vacant"),
    occupantName: node.positionKind === "staff" ? node.fullName : null,
    managerId: node.managerId,
    additionalManagerIds: node.alsoReportsTo,
    notes: node.notes,
  };
}

export const emptyDraft: PositionDraft = {
  id: null,
  title: "",
  departmentId: null,
  positionKind: "vacant",
  occupancy: "vacant",
  occupantName: null,
  managerId: null,
  additionalManagerIds: [],
  notes: null,
};

interface Props {
  draft: PositionDraft | null;
  nodes: OrgNode[];
  departments: Array<{ id: number; name: string }>;
  onClose: () => void;
  onSaved: () => void;
}

export default function PositionEditor({ draft, nodes, departments, onClose, onSaved }: Props) {
  const [form, setForm] = useState<PositionDraft>(emptyDraft);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmArchive, setConfirmArchive] = useState(false);

  useEffect(() => {
    if (draft) {
      setForm(draft);
      setErrors({});
      setMessage("");
      setConfirmArchive(false);
    }
  }, [draft]);

  // Nobody may report to themselves, nor to anyone already below them: that is a
  // ring, and a ring cannot be drawn. The server refuses it too.
  const below = useMemo(() => {
    if (form.id === null) return new Set<number>();
    const children = new Map<number, number[]>();
    for (const node of nodes) {
      if (node.managerId === null) continue;
      children.set(node.managerId, [...(children.get(node.managerId) ?? []), node.id]);
    }
    const seen = new Set<number>([form.id]);
    const stack = [...(children.get(form.id) ?? [])];
    while (stack.length > 0) {
      const next = stack.pop()!;
      if (seen.has(next)) continue;
      seen.add(next);
      stack.push(...(children.get(next) ?? []));
    }
    return seen;
  }, [form.id, nodes]);

  const candidates = useMemo(
    () => nodes.filter((node) => !below.has(node.id)).sort((a, b) => a.fullName.localeCompare(b.fullName)),
    [nodes, below],
  );

  const set = <K extends keyof PositionDraft>(key: K, value: PositionDraft[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  const changeOccupancy = (occupancy: PositionDraft["occupancy"]) => {
    setForm((current) => ({
      ...current,
      occupancy,
      // A named occupant is what makes the record a person; dropping the name
      // must drop that too, or the chart keeps asserting somebody.
      occupantName: occupancy === "filled" ? (current.occupantName ?? "") : null,
      positionKind:
        occupancy === "filled"
          ? "staff"
          : current.positionKind === "staff"
            ? "vacant"
            : current.positionKind,
    }));
  };

  const submit = async () => {
    setSaving(true);
    setErrors({});
    setMessage("");
    try {
      const payload = {
        title: form.title,
        departmentId: form.departmentId,
        positionKind: form.positionKind,
        occupancy: form.occupancy,
        occupantName: form.occupancy === "filled" ? form.occupantName : null,
        managerId: form.managerId,
        additionalManagerIds: form.additionalManagerIds,
        notes: form.notes,
      };
      if (form.id === null) await createPosition(payload);
      else await updatePosition(form.id, payload);
      onSaved();
    } catch (error) {
      const fields = (error as { response?: { data?: { errors?: Record<string, string> } } })
        .response?.data?.errors;
      if (fields) setErrors(fields);
      setMessage(getApiErrorMessage(error, "The position could not be saved."));
    } finally {
      setSaving(false);
    }
  };

  const archive = async () => {
    if (form.id === null) return;
    setSaving(true);
    setMessage("");
    try {
      await archivePosition(form.id);
      onSaved();
    } catch (error) {
      setMessage(getApiErrorMessage(error, "The position could not be archived."));
      setConfirmArchive(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen={draft !== null}
      onClose={onClose}
      title={form.id === null ? "Add position" : "Edit position"}
      description="Changes take effect on the org chart as soon as they are saved."
      size="lg"
      isDismissDisabled={saving}
      footer={
        <div className="flex w-full flex-wrap items-center justify-between gap-2">
          {form.id !== null ? (
            confirmArchive ? (
              <span className="flex items-center gap-2 text-sm text-fg-muted">
                Archive this position?
                <Button variant="danger" size="sm" onClick={archive} isLoading={saving}>Archive</Button>
                <Button variant="ghost" size="sm" onClick={() => setConfirmArchive(false)}>Keep it</Button>
              </span>
            ) : (
              <Button variant="ghost" size="sm" onClick={() => setConfirmArchive(true)} disabled={saving}>
                Archive position
              </Button>
            )
          ) : <span />}
          <span className="flex gap-2">
            <Button variant="ghost" onClick={onClose} disabled={saving}>Cancel</Button>
            <Button variant="primary" onClick={submit} isLoading={saving}>Save</Button>
          </span>
        </div>
      }
    >
      <div className="space-y-4">
        {message && <Alert tone="danger" title="That did not save">{message}</Alert>}

        <FormField id="pos-title" label="Position title" error={errors.title}>
          <TextInput
            id="pos-title"
            value={form.title}
            invalid={Boolean(errors.title)}
            onChange={(event) => set("title", event.target.value)}
            placeholder="Head of Compliance & Quality Management"
          />
        </FormField>

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField id="pos-department" label="Department / function">
            <SelectInput
              id="pos-department"
              value={form.departmentId ?? ""}
              onChange={(event) => set("departmentId", event.target.value ? Number(event.target.value) : null)}
            >
              <option value="">No department</option>
              {departments.map((department) => (
                <option key={department.id} value={department.id}>{department.name}</option>
              ))}
            </SelectInput>
          </FormField>

          <FormField
            id="pos-kind"
            label="Position type"
            error={errors.positionKind}
            hint="External or advisory entries stay out of headcount, payroll, attendance and leave."
          >
            <SelectInput
              id="pos-kind"
              value={form.positionKind}
              invalid={Boolean(errors.positionKind)}
              onChange={(event) => set("positionKind", event.target.value as PositionDraft["positionKind"])}
            >
              <option value="vacant">Internal position</option>
              <option value="staff">Member of staff</option>
              <option value="external">External / advisory</option>
            </SelectInput>
          </FormField>
        </div>

        <FormField id="pos-occupancy" label="Status" error={errors.occupancy}>
          <SelectInput
            id="pos-occupancy"
            value={form.occupancy}
            onChange={(event) => changeOccupancy(event.target.value as PositionDraft["occupancy"])}
          >
            <option value="vacant">Vacant — nobody holds this position</option>
            <option value="filled_unnamed">Filled — employee details not entered</option>
            <option value="filled">Filled by a named person</option>
          </SelectInput>
        </FormField>

        {form.occupancy === "filled" && (
          <FormField
            id="pos-occupant"
            label="Employee holding this position"
            error={errors.occupantName}
            hint="The chart will show this name instead of the position title."
          >
            <TextInput
              id="pos-occupant"
              value={form.occupantName ?? ""}
              invalid={Boolean(errors.occupantName)}
              onChange={(event) => set("occupantName", event.target.value)}
            />
          </FormField>
        )}

        <FormField
          id="pos-manager"
          label="Primary manager"
          error={errors.managerId}
          hint="The reporting line HR Nexus uses for team scope and leave approval."
        >
          <SelectInput
            id="pos-manager"
            value={form.managerId ?? ""}
            invalid={Boolean(errors.managerId)}
            onChange={(event) => set("managerId", event.target.value ? Number(event.target.value) : null)}
          >
            <option value="">No manager — top of the chart</option>
            {candidates.map((node) => (
              <option key={node.id} value={node.id}>{node.fullName}</option>
            ))}
          </SelectInput>
        </FormField>

        <fieldset className="rounded-card border border-line p-3">
          <legend className="px-1 text-sm font-medium text-fg">Also reports to</legend>
          <p className="mb-2 text-xs text-fg-muted">
            Drawn on the chart for anyone who answers to more than one person. These lines change nothing
            operational.
          </p>
          {errors.additionalManagerIds && (
            <p className="mb-2 text-xs text-danger-fg">{errors.additionalManagerIds}</p>
          )}
          <div className="max-h-44 space-y-1.5 overflow-y-auto">
            {candidates
              .filter((node) => node.id !== form.managerId)
              .map((node) => (
                <Checkbox
                  key={node.id}
                  id={`also-${node.id}`}
                  label={node.fullName}
                  checked={form.additionalManagerIds.includes(node.id)}
                  onChange={(event) =>
                    set(
                      "additionalManagerIds",
                      event.target.checked
                        ? [...form.additionalManagerIds, node.id]
                        : form.additionalManagerIds.filter((id) => id !== node.id),
                    )
                  }
                />
              ))}
          </div>
        </fieldset>

        <FormField id="pos-notes" label="Role description or notes" error={errors.notes}>
          <TextArea
            id="pos-notes"
            rows={3}
            value={form.notes ?? ""}
            onChange={(event) => set("notes", event.target.value)}
            placeholder="What this position covers. Not personal information about whoever holds it."
          />
        </FormField>
      </div>
    </Modal>
  );
}
