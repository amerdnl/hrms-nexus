import axios from "axios";
import { ArrowDown, ArrowUp, ListChecks, Pencil, Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { getApiErrorMessage } from "../../api/axios";
import { createTemplate, getTemplates, updateTemplate } from "../../api/lifecycleApi";
import Alert from "../../components/ui/Alert";
import Button from "../../components/ui/Button";
import Checkbox from "../../components/ui/Checkbox";
import EmptyState from "../../components/ui/EmptyState";
import ErrorState from "../../components/ui/ErrorState";
import FormField from "../../components/ui/FormField";
import Modal from "../../components/ui/Modal";
import PageHeader from "../../components/ui/PageHeader";
import SecondaryButton from "../../components/ui/SecondaryButton";
import SectionCard from "../../components/ui/SectionCard";
import SelectInput from "../../components/ui/SelectInput";
import { SkeletonText } from "../../components/ui/Skeleton";
import StatusBadge from "../../components/ui/StatusBadge";
import Tabs from "../../components/ui/Tabs";
import TextArea from "../../components/ui/TextArea";
import TextInput from "../../components/ui/TextInput";
import type { AssigneeRole, LifecycleKind, LifecycleTemplate, TemplateTask } from "../../types/lifecycle";
import { kindLabels, roleLabels } from "../../types/lifecycle";

interface Draft {
  name: string;
  description: string;
  isActive: boolean;
  tasks: TemplateTask[];
}

const blankTask = (): TemplateTask => ({ title: "", instructions: null, assigneeRole: "employee", dueOffsetDays: 0 });

function offsetText(kind: LifecycleKind, days: number): string {
  if (days === 0) return kind === "onboarding" ? "on the first day" : "on the last day";
  const anchor = kind === "onboarding" ? "the first day" : "the last day";
  return `${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"} ${days < 0 ? "before" : "after"} ${anchor}`;
}

function TemplateEditor({ kind, template, onClose, onSaved }: {
  kind: LifecycleKind;
  template: LifecycleTemplate | null;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const [draft, setDraft] = useState<Draft>(() => ({
    name: template?.name ?? "",
    description: template?.description ?? "",
    isActive: template?.isActive ?? true,
    tasks: template?.tasks.map(({ title, instructions, assigneeRole, dueOffsetDays }) => ({ title, instructions, assigneeRole, dueOffsetDays })) ?? [blankTask()],
  }));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const setTask = (index: number, change: Partial<TemplateTask>) =>
    setDraft((current) => ({ ...current, tasks: current.tasks.map((task, i) => (i === index ? { ...task, ...change } : task)) }));
  const move = (index: number, delta: number) =>
    setDraft((current) => {
      const tasks = [...current.tasks];
      const [task] = tasks.splice(index, 1);
      tasks.splice(index + delta, 0, task!);
      return { ...current, tasks };
    });

  async function submit(event: FormEvent) {
    event.preventDefault();
    setIsSaving(true);
    setErrors({});
    setFormError("");
    const tasks = draft.tasks.map((task) => ({ ...task, instructions: task.instructions?.trim() || null }));
    try {
      if (template) {
        await updateTemplate(template.id, { name: draft.name, description: draft.description.trim() || null, isActive: draft.isActive, tasks, revision: template.revision });
        onSaved("Checklist saved. Plans already started keep their own tasks.");
      } else {
        await createTemplate({ kind, name: draft.name, description: draft.description.trim() || null, tasks });
        onSaved("Checklist created.");
      }
    } catch (requestError) {
      if (axios.isAxiosError(requestError) && requestError.response?.data?.errors) {
        setErrors(requestError.response.data.errors as Record<string, string>);
      }
      setFormError(getApiErrorMessage(requestError, "The checklist could not be saved."));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={template ? `Edit ${template.name}` : `New ${kindLabels[kind].toLowerCase()} checklist`}
      description="Each task goes to a role - the employee, their manager or HR - and is dated from the plan."
      size="xl"
      isDismissDisabled={isSaving}
      footer={
        <>
          <SecondaryButton onClick={onClose} disabled={isSaving}>Cancel</SecondaryButton>
          <Button type="submit" form="template-form" isLoading={isSaving} loadingLabel="Saving…">Save checklist</Button>
        </>
      }
    >
      <form id="template-form" onSubmit={submit} className="space-y-5" noValidate>
        {formError && <Alert tone="danger">{formError}</Alert>}
        <FormField id="template-name" label="Name" required error={errors.name}>
          <TextInput id="template-name" value={draft.name} maxLength={120} onChange={(e) => setDraft({ ...draft, name: e.target.value })} invalid={Boolean(errors.name)} />
        </FormField>
        <FormField id="template-description" label="Description" error={errors.description}>
          <TextArea id="template-description" rows={2} value={draft.description} maxLength={1000} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
        </FormField>
        {template && (
          <Checkbox id="template-active" label="In use" description="Retired checklists cannot start new plans; existing plans are unaffected."
            checked={draft.isActive} onChange={(e) => setDraft({ ...draft, isActive: e.target.checked })} />
        )}

        <fieldset className="space-y-3">
          <legend className="mb-2 text-sm font-semibold text-fg">Tasks</legend>
          {errors.tasks && <p className="text-sm text-danger-fg">{errors.tasks}</p>}
          <ol className="space-y-3">
            {draft.tasks.map((task, index) => (
              <li key={index} className="rounded-xl border border-line p-3">
                <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_9rem_7rem]">
                  <FormField id={`task-title-${index}`} label={`Task ${index + 1}`} required error={errors[`tasks.${index}.title`]}>
                    <TextInput id={`task-title-${index}`} value={task.title} maxLength={160} onChange={(e) => setTask(index, { title: e.target.value })} invalid={Boolean(errors[`tasks.${index}.title`])} />
                  </FormField>
                  <FormField id={`task-role-${index}`} label="Done by" error={errors[`tasks.${index}.assigneeRole`]}>
                    <SelectInput id={`task-role-${index}`} value={task.assigneeRole} onChange={(e) => setTask(index, { assigneeRole: e.target.value as AssigneeRole })}>
                      {(Object.keys(roleLabels) as AssigneeRole[]).map((role) => <option key={role} value={role}>{roleLabels[role]}</option>)}
                    </SelectInput>
                  </FormField>
                  <FormField id={`task-offset-${index}`} label="Due (days)" error={errors[`tasks.${index}.dueOffsetDays`]}>
                    <TextInput id={`task-offset-${index}`} type="number" min={-365} max={365} value={task.dueOffsetDays}
                      onChange={(e) => setTask(index, { dueOffsetDays: Number(e.target.value) || 0 })} aria-describedby={`task-offset-${index}-text`} />
                  </FormField>
                </div>
                <p id={`task-offset-${index}-text`} className="mt-1 text-xs text-fg-subtle">Due {offsetText(kind, task.dueOffsetDays)}.</p>
                <FormField id={`task-instructions-${index}`} label="Instructions" className="mt-3" error={errors[`tasks.${index}.instructions`]}>
                  <TextArea id={`task-instructions-${index}`} rows={2} maxLength={1000} value={task.instructions ?? ""} onChange={(e) => setTask(index, { instructions: e.target.value })} />
                </FormField>
                <div className="mt-2 flex justify-end gap-1">
                  <Button variant="ghost" size="sm" icon={ArrowUp} disabled={index === 0} onClick={() => move(index, -1)} aria-label={`Move task ${index + 1} up`} />
                  <Button variant="ghost" size="sm" icon={ArrowDown} disabled={index === draft.tasks.length - 1} onClick={() => move(index, 1)} aria-label={`Move task ${index + 1} down`} />
                  <Button variant="ghost" size="sm" icon={Trash2} disabled={draft.tasks.length === 1}
                    onClick={() => setDraft({ ...draft, tasks: draft.tasks.filter((_, i) => i !== index) })} aria-label={`Remove task ${index + 1}`} />
                </div>
              </li>
            ))}
          </ol>
          <Button variant="secondary" size="sm" icon={Plus} disabled={draft.tasks.length >= 100} onClick={() => setDraft({ ...draft, tasks: [...draft.tasks, blankTask()] })}>
            Add task
          </Button>
        </fieldset>
      </form>
    </Modal>
  );
}

/** HR's onboarding and offboarding checklists. Editing one never changes plans already started. */
export default function LifecycleTemplatesPage() {
  const [params, setParams] = useSearchParams();
  const kind: LifecycleKind = params.get("kind") === "offboarding" ? "offboarding" : "onboarding";
  const [templates, setTemplates] = useState<LifecycleTemplate[] | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [editing, setEditing] = useState<{ template: LifecycleTemplate | null } | null>(null);

  const load = useCallback(() => {
    setTemplates(null);
    setError("");
    getTemplates(kind)
      .then(setTemplates)
      .catch((requestError) => setError(getApiErrorMessage(requestError, "Checklists could not be loaded.")));
  }, [kind]);

  useEffect(load, [load]);

  return (
    <section className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        title="Checklists"
        description="The tasks copied into each new onboarding or offboarding plan."
        backTo={`/admin/${kind}`}
        backLabel={kindLabels[kind]}
        actions={<Button icon={Plus} onClick={() => setEditing({ template: null })}>New checklist</Button>}
      />
      {notice && <Alert tone="success" onDismiss={() => setNotice("")}>{notice}</Alert>}

      <SectionCard padded={false}>
        <div className="border-b border-line px-4 pt-2 sm:px-5">
          <Tabs
            tabs={[{ id: "onboarding", label: "Onboarding" }, { id: "offboarding", label: "Offboarding" }]}
            active={kind}
            onChange={(id) => setParams({ kind: id }, { replace: true })}
          />
        </div>
        <div role="tabpanel" id={`panel-${kind}`} aria-labelledby={`tab-${kind}`} className="p-4 sm:p-5">
          {error ? (
            <ErrorState title="Checklists could not be loaded" description={error} onRetry={load} />
          ) : templates === null ? (
            <SkeletonText lines={5} />
          ) : templates.length === 0 ? (
            <EmptyState icon={ListChecks} title={`No ${kind} checklists yet`} description="Create one to start plans from it." />
          ) : (
            <ul className="space-y-4">
              {templates.map((template) => (
                <li key={template.id} className="rounded-xl border border-line p-4">
                  <div className="flex flex-wrap items-start gap-3">
                    <div className="min-w-0 flex-1 basis-60">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-base font-semibold text-fg [overflow-wrap:anywhere]">{template.name}</h2>
                        {!template.isActive && <StatusBadge label="Retired" tone="neutral" />}
                      </div>
                      {template.description && <p className="mt-0.5 text-sm text-fg-muted [overflow-wrap:anywhere]">{template.description}</p>}
                      <p className="mt-1 text-xs text-fg-subtle">{template.tasks.length} tasks · used by {template.plansStarted} plan{template.plansStarted === 1 ? "" : "s"}</p>
                    </div>
                    <Button variant="secondary" size="sm" icon={Pencil} onClick={() => setEditing({ template })} aria-label={`Edit ${template.name}`}>Edit</Button>
                  </div>
                  <ol className="mt-3 space-y-1.5 border-t border-line pt-3">
                    {template.tasks.map((task) => (
                      <li key={task.position} className="flex flex-wrap gap-x-3 text-sm">
                        <span className="w-6 shrink-0 text-fg-subtle">{task.position}.</span>
                        <span className="min-w-0 flex-1 text-fg [overflow-wrap:anywhere]">{task.title}</span>
                        <span className="text-xs text-fg-muted">{roleLabels[task.assigneeRole]} · {offsetText(kind, task.dueOffsetDays)}</span>
                      </li>
                    ))}
                  </ol>
                </li>
              ))}
            </ul>
          )}
        </div>
      </SectionCard>

      {editing && (
        <TemplateEditor
          kind={kind}
          template={editing.template}
          onClose={() => setEditing(null)}
          onSaved={(message) => {
            setEditing(null);
            setNotice(message);
            load();
          }}
        />
      )}
    </section>
  );
}
