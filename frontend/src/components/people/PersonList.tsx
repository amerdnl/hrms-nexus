import { Link } from "react-router-dom";
import { resolveProfileImageUrl } from "../../api/axios";
import type { PersonLink } from "../../types/people";
import Avatar from "../ui/Avatar";

/**
 * A short list of colleagues, each a link to their profile.
 *
 * Shared by the profile's side column (reports to, direct reports, works with)
 * so every "person as a link" on the page looks and behaves the same.
 */
export default function PersonList({ people, empty }: { people: PersonLink[]; empty?: string }) {
  if (people.length === 0) {
    return empty ? <p className="text-sm text-fg-muted">{empty}</p> : null;
  }
  return (
    <ul className="space-y-1">
      {people.map((person) => (
        <li key={person.id}>
          <Link
            to={`/people/${person.id}`}
            className="-mx-2 grid grid-cols-[auto_minmax(0,1fr)] items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <Avatar name={person.fullName} src={resolveProfileImageUrl(person.profileImage)} size="sm" />
            <span className="min-w-0">
              <span className="block text-sm font-medium text-fg [overflow-wrap:anywhere]">{person.fullName}</span>
              <span className="block text-xs text-fg-subtle [overflow-wrap:anywhere]">{person.jobTitle ?? "No job title recorded"}</span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
