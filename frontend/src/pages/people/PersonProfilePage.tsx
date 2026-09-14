import {
  CalendarDays,
  Clock3,
  History,
  IdCard,
  Mail,
  Network,
  Pencil,
  Phone,
  Sparkles,
  UserRoundSearch,
  UsersRound,
  Wallet,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { getApiErrorMessage, resolveProfileImageUrl } from "../../api/axios";
import { getPerson, getPersonTimeline } from "../../api/peopleApi";
import { getTeamMember } from "../../api/teamApi";
import PersonList from "../../components/people/PersonList";
import ProfileRecognitionCard from "../../components/recognition/ProfileRecognitionCard";
import ProfileGoalsCard from "../../components/performance/ProfileGoalsCard";
import Timeline from "../../components/people/Timeline";
import Avatar from "../../components/ui/Avatar";
import Breadcrumbs from "../../components/ui/Breadcrumbs";
import EmptyState from "../../components/ui/EmptyState";
import ErrorState from "../../components/ui/ErrorState";
import LinkButton from "../../components/ui/LinkButton";
import SectionCard from "../../components/ui/SectionCard";
import Skeleton, { SkeletonText } from "../../components/ui/Skeleton";
import StatusBadge from "../../components/ui/StatusBadge";
import type { SocialProfile, TimelineEntry } from "../../types/people";
import type { TeamMemberDetail } from "../../types/team";
import { formatDate, formatDateRange } from "../../utils/datetime";
import { formatLeaveDuration } from "../../utils/leave";
import { employmentStatusMeta, leaveStatusMeta, leaveTypeMeta } from "../../utils/status";
import { dayStatusMeta } from "../team/teamStatus";
import { useBreadcrumbs } from "../../hooks/useBreadcrumbs";

/** "6 years", "8 months", "3 weeks" - tenure in the largest whole unit. */
function tenure(from: string | null): string | null {
  if (!from) return null;
  const start = new Date(`${from}T00:00:00`);
  const now = new Date();
  const months = (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth()) - (now.getDate() < start.getDate() ? 1 : 0);
  if (months >= 12) {
    const years = Math.floor(months / 12);
    return `${years} year${years === 1 ? "" : "s"}`;
  }
  if (months >= 1) return `${months} month${months === 1 ? "" : "s"}`;
  const days = Math.max(0, Math.floor((now.getTime() - start.getTime()) / 86_400_000));
  if (days < 0) return null;
  const weeks = Math.floor(days / 7);
  return weeks >= 1 ? `${weeks} week${weeks === 1 ? "" : "s"}` : "Started this week";
}

/**
 * A colleague's profile.
 *
 * The social layer is the same for everyone who can see it. Around it, the page
 * adds only the layer the server says this viewer's relation allows: your own
 * HR links when it is you, the team layer when they report to you, and a link to
 * the HR record for HR. Each of those makes its own authorised request; the
 * server would refuse it for anyone else whatever this page shows.
 */
export default function PersonProfilePage() {
  const { id } = useParams<{ id: string }>();
  const personId = Number(id);
  // This page has no PageHeader - its title is the person's name inside the
  // identity card - so it renders the trail itself.
  const crumbs = useBreadcrumbs();

  const [profile, setProfile] = useState<SocialProfile | null>(null);
  const [events, setEvents] = useState<TimelineEntry[] | null>(null);
  const [team, setTeam] = useState<TeamMemberDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<{ status: number | null; message: string } | null>(null);

  useEffect(() => {
    let active = true;
    setIsLoading(true);
    setError(null);
    setProfile(null);
    setEvents(null);
    setTeam(null);

    if (!Number.isSafeInteger(personId) || personId <= 0) {
      setError({ status: 404, message: "This profile does not exist." });
      setIsLoading(false);
      return;
    }

    getPerson(personId)
      .then(async (result) => {
        if (!active) return;
        setProfile(result);
        getPersonTimeline(personId).then((timeline) => { if (active) setEvents(timeline.events); }).catch(() => { if (active) setEvents([]); });
        // The team layer, only when the server says this is your report.
        if (result.layers.includes("team")) {
          getTeamMember(personId).then((detail) => { if (active) setTeam(detail); }).catch(() => undefined);
        }
      })
      .catch((requestError: { response?: { status?: number } }) => {
        if (!active) return;
        setError({
          status: requestError.response?.status ?? null,
          message: getApiErrorMessage(requestError, "This profile could not be loaded."),
        });
      })
      .finally(() => { if (active) setIsLoading(false); });

    return () => { active = false; };
  }, [personId]);

  if (isLoading) {
    return (
      <section className="mx-auto max-w-6xl space-y-6" aria-busy="true">
        <p className="sr-only" aria-live="polite">Loading profile</p>
        <SectionCard>
          <div className="flex flex-col items-center gap-4 sm:flex-row">
            <Skeleton className="h-28 w-28 rounded-full" />
            <div className="w-full max-w-sm space-y-2">
              <Skeleton className="h-7 w-2/3" />
              <Skeleton className="h-4 w-1/2" />
            </div>
          </div>
        </SectionCard>
        <SectionCard><SkeletonText lines={5} /></SectionCard>
      </section>
    );
  }

  if (error || !profile) {
    const notFound = error?.status === 404;
    return (
      <section className="mx-auto max-w-3xl space-y-6">
        <h1 className="text-2xl font-bold tracking-tight text-fg">Profile</h1>
        <SectionCard>
          {notFound ? (
            <EmptyState
              icon={UserRoundSearch}
              title="This person is not in the directory"
              description="They may have left the company, or the link may be wrong."
              action={<LinkButton to="/people" variant="secondary">Back to People</LinkButton>}
            />
          ) : (
            <ErrorState title="This profile could not be loaded" description={error?.message} onRetry={() => window.location.reload()} />
          )}
        </SectionCard>
      </section>
    );
  }

  const { person, relation, manager, directReports, peers, chain } = profile;
  const since = tenure(person.employmentDate);
  const isNew = person.employmentDate
    ? Date.now() - new Date(`${person.employmentDate}T00:00:00`).getTime() < 90 * 86_400_000
    : false;

  return (
    <section className="mx-auto max-w-6xl space-y-6">
      {crumbs.length > 1 && <Breadcrumbs items={crumbs} className="-mb-3 hidden md:block" />}
      <SectionCard>
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
          <Avatar
            name={person.fullName}
            src={resolveProfileImageUrl(person.profileImage)}
            size="2xl"
            className="mx-auto ring-4 ring-primary-soft sm:mx-0"
          />
          <div className="min-w-0 flex-1 text-center sm:text-left">
            <div className="flex flex-wrap items-center justify-center gap-2 sm:justify-start">
              <h1 className="text-2xl font-bold tracking-tight text-fg [overflow-wrap:anywhere]">{person.fullName}</h1>
              {relation === "self" && <StatusBadge label="You" tone="primary" />}
              {relation === "manager" && <StatusBadge label="Reports to you" tone="info" />}
              {isNew && <StatusBadge label="New joiner" tone="success" />}
              {person.employmentStatus && person.employmentStatus !== "active" && (
                <StatusBadge {...employmentStatusMeta(person.employmentStatus)} />
              )}
            </div>
            <p className="mt-1 text-sm text-fg-muted [overflow-wrap:anywhere]">
              {person.jobTitle ?? "No job title recorded"}
              {person.department && (
                <>
                  {" · "}
                  <Link
                    to={`/people?department=${person.department.id}`}
                    className="font-medium text-primary hover:underline focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                  >
                    {person.department.name}
                  </Link>
                </>
              )}
            </p>
            <ul className="mt-3 flex flex-wrap justify-center gap-x-5 gap-y-2 text-sm text-fg-muted sm:justify-start">
              {person.workEmail && (
                <li>
                  <a href={`mailto:${person.workEmail}`} className="inline-flex min-h-6 items-center gap-1.5 hover:text-primary focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring [overflow-wrap:anywhere]">
                    <Mail size={15} aria-hidden="true" />{person.workEmail}
                  </a>
                </li>
              )}
              {person.phone && (
                <li>
                  <a href={`tel:${person.phone.replace(/[^+\d]/g, "")}`} className="inline-flex min-h-6 items-center gap-1.5 hover:text-primary focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
                    <Phone size={15} aria-hidden="true" />{person.phone}
                  </a>
                  {relation === "self" && !person.sharesPhone && <span className="ml-1 text-xs text-fg-subtle">(only you and HR)</span>}
                </li>
              )}
              {person.employmentDate && (
                <li className="inline-flex items-center gap-1.5">
                  <CalendarDays size={15} aria-hidden="true" />
                  Joined {formatDate(person.employmentDate)}{since ? ` · ${since}` : ""}
                </li>
              )}
            </ul>
          </div>
          <div className="flex flex-wrap justify-center gap-2 sm:flex-col sm:items-end">
            {relation === "self" && <LinkButton to="/employee/profile#about" icon={Pencil} variant="secondary">Edit my profile</LinkButton>}
            {relation === "admin" && <LinkButton to={`/admin/employees/${person.id}`} icon={IdCard} variant="secondary">Open HR record</LinkButton>}
            {/* A former employee is not on the chart, so HR is not offered a dead link. */}
            {(!person.employmentStatus || ["active", "probation"].includes(person.employmentStatus)) && (
              <LinkButton to={`/org?focus=${person.id}`} icon={Network} variant="ghost">Show in org chart</LinkButton>
            )}
          </div>
        </div>
      </SectionCard>

      <div className="grid items-start gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <SectionCard title="About" icon={Sparkles}>
            {person.about ? (
              <p className="whitespace-pre-line text-sm leading-6 text-fg [overflow-wrap:anywhere]">{person.about}</p>
            ) : (
              <p className="text-sm text-fg-muted">
                {relation === "self" ? "You have not written anything yet. Colleagues see what you add here." : `${person.fullName.split(" ")[0]} has not written anything yet.`}
              </p>
            )}
            {person.skills.length > 0 && (
              <>
                <h3 className="mt-5 text-xs font-semibold uppercase tracking-wide text-fg-subtle">Skills</h3>
                <ul className="mt-2 flex flex-wrap gap-2">
                  {person.skills.map((skill) => (
                    <li key={skill}>
                      <Link
                        to={`/people?search=${encodeURIComponent(skill)}`}
                        className="inline-flex min-h-7 items-center rounded-full bg-primary-soft px-3 text-xs font-medium text-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring [overflow-wrap:anywhere]"
                      >
                        {skill}
                      </Link>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </SectionCard>

          {team?.member && (
            <SectionCard
              title="Team view"
              description="What you see as their manager. Colleagues do not."
              icon={Clock3}
              actions={<LinkButton to="/team/attendance" variant="ghost" size="sm">Team attendance</LinkButton>}
            >
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-sm text-fg-muted">Today</span>
                <StatusBadge {...dayStatusMeta(team.member.day)} />
              </div>
              {team.attendance30Days && (
                <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {[
                    ["Days recorded", team.attendance30Days.daysRecorded],
                    ["Late", team.attendance30Days.late],
                    ["Absent", team.attendance30Days.absent],
                    ["No check-out", team.attendance30Days.missingCheckout],
                  ].map(([label, value]) => (
                    <div key={label as string} className="rounded-xl bg-surface-muted p-3">
                      <dt className="text-xs text-fg-subtle">{label}</dt>
                      <dd className="mt-0.5 text-lg font-semibold tabular-nums text-fg">{value}</dd>
                    </div>
                  ))}
                </dl>
              )}
              <p className="mt-2 text-xs text-fg-subtle">Last 30 days.</p>
              {team.leave.length > 0 && (
                <ul className="mt-4 divide-y divide-line border-t border-line">
                  {team.leave.slice(0, 4).map((leave) => (
                    <li key={leave.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 py-2.5">
                      <span className="min-w-0 text-sm text-fg">
                        {leaveTypeMeta(leave.leaveType).label} · {formatDateRange(leave.startDate, leave.endDate)}
                        <span className="block text-xs text-fg-subtle">{formatLeaveDuration(leave)}</span>
                      </span>
                      <StatusBadge {...leaveStatusMeta(leave.status)} />
                    </li>
                  ))}
                </ul>
              )}
            </SectionCard>
          )}

          <ProfileGoalsCard personId={personId} isSelf={profile.relation === "self"} />

          <ProfileRecognitionCard personId={personId} fullName={profile.person.fullName} isSelf={profile.relation === "self"} />

          <SectionCard title="Timeline" icon={History}>
            {events === null ? (
              <SkeletonText lines={4} />
            ) : events.length === 0 ? (
              <p className="text-sm text-fg-muted">Nothing on the timeline yet.</p>
            ) : (
              <Timeline events={events} />
            )}
          </SectionCard>
        </div>

        <div className="space-y-6">
          {relation === "self" && (
            <SectionCard title="My HR" icon={IdCard}>
              <ul className="space-y-1 text-sm">
                {[
                  ["/employee/attendance", "My attendance", Clock3],
                  ["/employee/leave", "My leave", CalendarDays],
                  ["/employee/payroll", "My payslips", Wallet],
                ].map(([to, label, Icon]) => {
                  const LinkIcon = Icon as typeof Clock3;
                  return (
                    <li key={to as string}>
                      <Link to={to as string} className="-mx-2 flex min-h-10 items-center gap-2 rounded-lg px-2 text-fg hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
                        <LinkIcon size={16} className="text-primary" aria-hidden="true" />{label as string}
                      </Link>
                    </li>
                  );
                })}
              </ul>
              <p className="mt-3 text-xs text-fg-subtle">Only you and HR can open these.</p>
            </SectionCard>
          )}

          <SectionCard title="Reports to" icon={UsersRound}>
            <PersonList people={manager ? [manager] : []} empty="No manager is recorded." />
          </SectionCard>

          {directReports.length > 0 && (
            <SectionCard title={`Direct reports (${directReports.length})`} icon={UsersRound}>
              <PersonList people={directReports} />
            </SectionCard>
          )}

          {peers.length > 0 && (
            <SectionCard title="Works with" description="Others who share their manager." icon={UsersRound}>
              <PersonList people={peers} />
            </SectionCard>
          )}

          {chain.length > 1 && (
            <SectionCard title="Chain of command" icon={Network}>
              <ol className="space-y-1">
                {chain.map((link, index) => (
                  <li key={link.id} className="flex items-center gap-2 text-sm" style={{ paddingLeft: `${Math.min(index, 6) * 0.75}rem` }}>
                    <span aria-hidden="true" className="text-fg-subtle">{index === 0 ? "•" : "↳"}</span>
                    <Link to={`/people/${link.id}`} className="text-fg hover:text-primary hover:underline focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring [overflow-wrap:anywhere]">
                      {link.fullName}
                    </Link>
                  </li>
                ))}
              </ol>
            </SectionCard>
          )}
        </div>
      </div>
    </section>
  );
}
