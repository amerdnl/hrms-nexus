import {
  Award,
  Briefcase,
  Building2,
  CircleDot,
  Flag,
  PartyPopper,
  Target,
  UserCheck,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import type { TimelineEntry } from "../../types/people";
import { formatDate } from "../../utils/datetime";

const icons: Record<string, LucideIcon> = {
  joined: PartyPopper,
  job_title_changed: Briefcase,
  department_changed: Building2,
  manager_changed: UsersRound,
  status_changed: UserCheck,
  onboarding_started: Flag,
  onboarding_completed: Flag,
  offboarding_started: Flag,
  offboarding_completed: Flag,
  recognition_received: Award,
  goal_completed: Target,
  review_completed: CircleDot,
};

const audience: Record<string, string | null> = {
  company: null,
  self: "Visible to them and HR",
  management: "Visible to their manager and HR",
};

/**
 * A person's history, newest first.
 *
 * Each entry says who can see it when that is narrower than everyone, so a
 * manager reading a status change knows a colleague would not see it.
 */
export default function Timeline({ events }: { events: TimelineEntry[] }) {
  return (
    <ol className="relative space-y-5 border-l border-line pl-6">
      {events.map((event) => {
        const Icon = icons[event.kind] ?? CircleDot;
        return (
          <li key={event.id} className="relative">
            <span
              className="absolute -left-[2.15rem] top-0 grid h-7 w-7 place-items-center rounded-full border border-line bg-surface text-primary"
              aria-hidden="true"
            >
              <Icon size={14} />
            </span>
            <p className="text-sm font-medium text-fg [overflow-wrap:anywhere]">{event.title}</p>
            <p className="mt-0.5 text-xs text-fg-subtle">
              <time dateTime={event.occurredOn}>{formatDate(event.occurredOn)}</time>
              {audience[event.visibility] ? ` · ${audience[event.visibility]}` : ""}
            </p>
          </li>
        );
      })}
    </ol>
  );
}
