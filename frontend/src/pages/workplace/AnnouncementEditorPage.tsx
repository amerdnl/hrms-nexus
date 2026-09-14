import axios from "axios";
import { Megaphone, Save, Send } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { getApiErrorMessage } from "../../api/axios";
import { getDepartments, type Department } from "../../api/departmentApi";
import {
  createAnnouncement,
  getAnnouncement,
  publishAnnouncement,
  updateAnnouncement,
} from "../../api/workplaceApi";
import Alert from "../../components/ui/Alert";
import Button from "../../components/ui/Button";
import ErrorState from "../../components/ui/ErrorState";
import FormField from "../../components/ui/FormField";
import { fieldDescribedBy } from "../../components/ui/fieldStyles";
import PageHeader from "../../components/ui/PageHeader";
import SectionCard from "../../components/ui/SectionCard";
import SelectInput from "../../components/ui/SelectInput";
import { SkeletonText } from "../../components/ui/Skeleton";
import TextArea from "../../components/ui/TextArea";
import TextInput from "../../components/ui/TextInput";
import type { Announcement, AnnouncementInput } from "../../types/workplace";

const BODY_MAX = 5000;

const empty: AnnouncementInput = {
  title: "", body: "", priority: "normal", audience: "company", departmentId: null, expiresOn: null,
};

/**
 * HR writes or edits an announcement. A draft can be saved and published
 * later; once published, its text can be corrected but its audience is fixed,
 * because the people it reached have already been notified.
 */
export default function AnnouncementEditorPage() {
  const { id } = useParams();
  const editingId = id ? Number(id) : null;
  const navigate = useNavigate();

  const [existing, setExisting] = useState<Announcement | null>(null);
  const [draft, setDraft] = useState<AnnouncementInput>(empty);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "failed">(editingId ? "loading" : "ready");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState<"draft" | "publish" | null>(null);

  useEffect(() => {
    getDepartments().then(setDepartments).catch(() => setDepartments([]));
    if (!editingId) return;
    getAnnouncement(editingId)
      .then((found) => {
        if (found.status === "archived") {
          navigate(`/announcements/${found.id}`, { replace: true });
          return;
        }
        setExisting(found);
        setDraft({
          title: found.title, body: found.body, priority: found.priority,
          audience: found.audience, departmentId: found.departmentId, expiresOn: found.expiresOn,
        });
        setState("ready");
      })
      .catch((requestError) => {
        setFormError(getApiErrorMessage(requestError, "This announcement could not be loaded."));
        setState("failed");
      });
  }, [editingId, navigate]);

  const audienceLocked = existing?.status === "published";

  async function save(mode: "draft" | "publish") {
    setSaving(mode);
    setErrors({});
    setFormError("");
    try {
      let saved = existing
        ? await updateAnnouncement(existing.id, { ...draft, revision: existing.revision })
        : await createAnnouncement(draft);
      if (mode === "publish" && saved.status === "draft") saved = await publishAnnouncement(saved.id, saved.revision);
      navigate(`/announcements/${saved.id}`, { replace: true });
    } catch (requestError) {
      if (axios.isAxiosError(requestError) && requestError.response?.data?.errors) {
        setErrors(requestError.response.data.errors as Record<string, string>);
      }
      setFormError(getApiErrorMessage(requestError, "The announcement could not be saved."));
    } finally {
      setSaving(null);
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    void save("draft");
  }

  const title = existing ? (existing.status === "published" ? "Edit published announcement" : "Edit draft") : "New announcement";

  if (state === "failed") {
    return (
      <section className="max-w-3xl space-y-6">
        <PageHeader title={title} backTo="/announcements" backLabel="Announcements" />
        <SectionCard><ErrorState title="This announcement could not be loaded" description={formError} onRetry={() => window.location.reload()} /></SectionCard>
      </section>
    );
  }

  return (
    <section className="max-w-3xl space-y-6">
      <PageHeader
        title={title}
        description={audienceLocked ? "Corrections reach the same audience. Nobody is notified again." : "Save a draft, or publish to notify its audience."}
        backTo={existing ? `/announcements/${existing.id}` : "/announcements"}
        backLabel={existing ? "Announcement" : "Announcements"}
      />

      {state === "loading" ? (
        <SectionCard><p className="sr-only" role="status">Loading the announcement</p><SkeletonText lines={8} /></SectionCard>
      ) : (
        <form onSubmit={submit} noValidate>
          <SectionCard title="Announcement" icon={Megaphone}>
            <div className="space-y-5">
              {formError && <Alert tone="danger">{formError}</Alert>}

              <FormField id="announcement-title" label="Title" required error={errors.title}>
                <TextInput
                  id="announcement-title"
                  value={draft.title}
                  maxLength={160}
                  onChange={(event) => setDraft({ ...draft, title: event.target.value })}
                  invalid={Boolean(errors.title)}
                  aria-describedby={fieldDescribedBy("announcement-title", { error: Boolean(errors.title) })}
                />
              </FormField>

              <FormField
                id="announcement-body"
                label="Message"
                required
                hint={`Plain text; line breaks are kept. ${draft.body.length} of ${BODY_MAX} characters.`}
                error={errors.body}
              >
                <TextArea
                  id="announcement-body"
                  rows={10}
                  value={draft.body}
                  maxLength={BODY_MAX}
                  onChange={(event) => setDraft({ ...draft, body: event.target.value })}
                  aria-invalid={Boolean(errors.body) || undefined}
                  aria-describedby={fieldDescribedBy("announcement-body", { hint: true, error: Boolean(errors.body) })}
                />
              </FormField>

              <div className="grid gap-5 sm:grid-cols-2">
                <FormField id="announcement-priority" label="Priority" hint="Important ones are pinned in everyone's Action Center until read." error={errors.priority}>
                  <SelectInput
                    id="announcement-priority"
                    value={draft.priority}
                    onChange={(event) => setDraft({ ...draft, priority: event.target.value as AnnouncementInput["priority"] })}
                    aria-describedby={fieldDescribedBy("announcement-priority", { hint: true })}
                  >
                    <option value="normal">Normal</option>
                    <option value="important">Important</option>
                  </SelectInput>
                </FormField>

                <FormField id="announcement-expires" label="Show until" hint="Optional. Leave empty to keep it on the feed." error={errors.expiresOn}>
                  <TextInput
                    id="announcement-expires"
                    type="date"
                    value={draft.expiresOn ?? ""}
                    onChange={(event) => setDraft({ ...draft, expiresOn: event.target.value || null })}
                    invalid={Boolean(errors.expiresOn)}
                    aria-describedby={fieldDescribedBy("announcement-expires", { hint: true, error: Boolean(errors.expiresOn) })}
                  />
                </FormField>

                <FormField
                  id="announcement-audience"
                  label="Audience"
                  hint={audienceLocked ? "Fixed once published." : undefined}
                  error={errors.audience}
                >
                  <SelectInput
                    id="announcement-audience"
                    value={draft.audience}
                    disabled={audienceLocked}
                    onChange={(event) => setDraft({
                      ...draft,
                      audience: event.target.value as AnnouncementInput["audience"],
                      departmentId: event.target.value === "company" ? null : draft.departmentId,
                    })}
                    aria-describedby={audienceLocked ? fieldDescribedBy("announcement-audience", { hint: true }) : undefined}
                  >
                    <option value="company">The whole company</option>
                    <option value="department">One department</option>
                  </SelectInput>
                </FormField>

                {draft.audience === "department" && (
                  <FormField id="announcement-department" label="Department" required error={errors.departmentId}>
                    <SelectInput
                      id="announcement-department"
                      value={draft.departmentId ?? ""}
                      disabled={audienceLocked}
                      invalid={Boolean(errors.departmentId)}
                      onChange={(event) => setDraft({ ...draft, departmentId: Number(event.target.value) || null })}
                      aria-describedby={fieldDescribedBy("announcement-department", { error: Boolean(errors.departmentId) })}
                    >
                      <option value="">Choose a department</option>
                      {departments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}
                    </SelectInput>
                  </FormField>
                )}
              </div>

              <div className="flex flex-wrap justify-end gap-2 border-t border-line pt-5">
                {audienceLocked ? (
                  <Button type="submit" icon={Save} isLoading={saving === "draft"} loadingLabel="Saving…">Save changes</Button>
                ) : (
                  <>
                    <Button type="submit" variant="secondary" icon={Save} isLoading={saving === "draft"} loadingLabel="Saving…" disabled={saving !== null}>
                      Save draft
                    </Button>
                    <Button icon={Send} isLoading={saving === "publish"} loadingLabel="Publishing…" disabled={saving !== null} onClick={() => void save("publish")}>
                      Publish now
                    </Button>
                  </>
                )}
              </div>
            </div>
          </SectionCard>
        </form>
      )}
    </section>
  );
}
