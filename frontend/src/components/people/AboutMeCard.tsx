import { Eye, Plus, Save, Sparkles, X } from "lucide-react";
import { useEffect, useState, type FormEvent, type KeyboardEvent } from "react";
import { getApiErrorMessage } from "../../api/axios";
import { getAboutMe, saveAboutMe } from "../../api/peopleApi";
import Alert from "../ui/Alert";
import Button from "../ui/Button";
import Checkbox from "../ui/Checkbox";
import FormField from "../ui/FormField";
import { fieldDescribedBy } from "../ui/fieldStyles";
import LinkButton from "../ui/LinkButton";
import SectionCard from "../ui/SectionCard";
import { SkeletonText } from "../ui/Skeleton";
import TextArea from "../ui/TextArea";
import TextInput from "../ui/TextInput";

const ABOUT_MAX = 2000;
const SKILLS_MAX = 30;
const SKILL_MAX = 40;

/**
 * What colleagues see about you: a few words, your skills, and whether your
 * phone number is shown. Nothing here changes an HR record, and the server
 * refuses any field but these three.
 */
export default function AboutMeCard({ employeeId }: { employeeId: number }) {
  const [about, setAbout] = useState("");
  const [skills, setSkills] = useState<string[]>([]);
  const [sharePhone, setSharePhone] = useState(false);
  const [draftSkill, setDraftSkill] = useState("");
  const [state, setState] = useState<"loading" | "ready" | "failed">("loading");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");

  useEffect(() => {
    getAboutMe()
      .then((me) => {
        setAbout(me.about ?? "");
        setSkills(me.skills);
        setSharePhone(me.sharePhone);
        setState("ready");
      })
      .catch(() => setState("failed"));
  }, []);

  function addSkill() {
    const skill = draftSkill.trim().replace(/\s+/g, " ");
    if (!skill) return;
    if (skill.length > SKILL_MAX) { setError(`Keep each skill to ${SKILL_MAX} characters.`); return; }
    if (skills.length >= SKILLS_MAX) { setError(`You can list up to ${SKILLS_MAX} skills.`); return; }
    if (!skills.some((existing) => existing.toLowerCase() === skill.toLowerCase())) setSkills([...skills, skill]);
    setDraftSkill("");
    setError("");
  }

  function onSkillKey(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter" || event.key === ",") {
      event.preventDefault();
      addSkill();
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setSaved("");
    setIsSaving(true);
    try {
      const result = await saveAboutMe({ about: about.trim() || null, skills, sharePhone });
      setSkills(result.skills);
      setSaved("Saved. Colleagues now see this on your profile.");
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, "Your profile could not be saved."));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <form onSubmit={submit} id="about">
      <SectionCard
        title="About me"
        description="What colleagues see on your profile. Nothing here changes your HR record."
        icon={Sparkles}
        actions={<LinkButton to={`/people/${employeeId}`} variant="ghost" size="sm" icon={Eye}>View as colleagues see it</LinkButton>}
      >
        {state === "loading" && <SkeletonText lines={4} />}
        {state === "failed" && <p className="text-sm text-fg-muted">This could not be loaded. Reload the page to try again.</p>}
        {state === "ready" && (
          <div className="space-y-5">
            <FormField id="about-text" label="About" hint={`${about.length} of ${ABOUT_MAX} characters.`}>
              <TextArea
                id="about-text"
                rows={4}
                maxLength={ABOUT_MAX}
                value={about}
                onChange={(event) => setAbout(event.target.value)}
                placeholder="What you work on, and what people can come to you for."
                aria-describedby={fieldDescribedBy("about-text", { hint: true })}
              />
            </FormField>

            <div>
              <FormField id="skill-draft" label="Skills" hint="Press Enter or comma to add. Colleagues can search by skill.">
                <div className="flex gap-2">
                  <TextInput
                    id="skill-draft"
                    value={draftSkill}
                    maxLength={SKILL_MAX}
                    onChange={(event) => setDraftSkill(event.target.value)}
                    onKeyDown={onSkillKey}
                    placeholder="e.g. Payroll, Excel, Customer onboarding"
                    aria-describedby={fieldDescribedBy("skill-draft", { hint: true })}
                  />
                  <Button variant="secondary" icon={Plus} onClick={addSkill} disabled={!draftSkill.trim()}>Add</Button>
                </div>
              </FormField>
              {skills.length > 0 && (
                <ul className="mt-3 flex flex-wrap gap-2" aria-label="Your skills">
                  {skills.map((skill) => (
                    <li key={skill} className="inline-flex min-h-8 items-center gap-1 rounded-full bg-primary-soft pl-3 pr-1 text-xs font-medium text-primary">
                      <span className="[overflow-wrap:anywhere]">{skill}</span>
                      <button
                        type="button"
                        onClick={() => setSkills(skills.filter((existing) => existing !== skill))}
                        className="grid h-6 w-6 place-items-center rounded-full hover:bg-surface focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
                        aria-label={`Remove ${skill}`}
                      >
                        <X size={12} aria-hidden="true" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <Checkbox
              id="share-phone"
              label="Show my phone number to colleagues"
              description="Off by default. HR can always see it; your work email is always visible."
              checked={sharePhone}
              onChange={(event) => setSharePhone(event.target.checked)}
            />

            {error && <Alert tone="danger">{error}</Alert>}
            {saved && <Alert tone="success" onDismiss={() => setSaved("")}>{saved}</Alert>}

            <div className="flex justify-end border-t border-line pt-5">
              <Button type="submit" icon={Save} isLoading={isSaving} loadingLabel="Saving…">Save profile</Button>
            </div>
          </div>
        )}
      </SectionCard>
    </form>
  );
}
