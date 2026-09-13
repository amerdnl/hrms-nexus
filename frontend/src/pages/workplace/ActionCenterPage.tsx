import { Bell, CalendarRange, CircleCheck, Hourglass, Inbox } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getApiErrorMessage } from "../../api/axios";
import { getActionCenter } from "../../api/workplaceApi";
import ActionList from "../../components/workplace/ActionList";
import { notificationIcon } from "../../components/workplace/workplaceIcons";
import EmptyState from "../../components/ui/EmptyState";
import ErrorState from "../../components/ui/ErrorState";
import LinkButton from "../../components/ui/LinkButton";
import PageHeader from "../../components/ui/PageHeader";
import SectionCard from "../../components/ui/SectionCard";
import { SkeletonText } from "../../components/ui/Skeleton";
import type { ActionCenter } from "../../types/workplace";
import { fullTimestamp, relativeTime } from "../../utils/relativeTime";

/**
 * Work waiting for you, computed by the server from the same records the
 * destination pages use. Resolving the record is what clears an item, so
 * nothing here can be stale for longer than a reload.
 */
export default function ActionCenterPage() {
  const [data, setData] = useState<ActionCenter | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    setError("");
    getActionCenter()
      .then(setData)
      .catch((requestError) => setError(getApiErrorMessage(requestError, "The Action Center could not be loaded.")));
  }, []);

  useEffect(load, [load]);

  if (error) {
    return (
      <section className="mx-auto max-w-4xl space-y-6">
        <PageHeader title="Action Center" description="Work waiting for you." />
        <SectionCard><ErrorState title="The Action Center could not be loaded" description={error} onRetry={load} /></SectionCard>
      </section>
    );
  }

  return (
    <section className="mx-auto max-w-4xl space-y-6">
      <PageHeader
        title="Action Center"
        description={data
          ? data.counts.requiresAction === 0
            ? "Nothing needs you right now."
            : `${data.counts.requiresAction} ${data.counts.requiresAction === 1 ? "thing needs" : "things need"} you.`
          : "Work waiting for you."}
      />

      {!data ? (
        <>
          <SectionCard><p className="sr-only" role="status">Loading the Action Center</p><SkeletonText lines={4} /></SectionCard>
          <SectionCard><SkeletonText lines={3} /></SectionCard>
        </>
      ) : (
        <>
          <SectionCard title="Needs you" icon={Inbox} description="Decisions and reading only you can do.">
            <ActionList
              items={data.requiresAction}
              today={data.today}
              emptyIcon={CircleCheck}
              emptyTitle="You are all caught up"
              emptyDescription="New requests and important announcements appear here."
            />
          </SectionCard>

          <div className="grid items-start gap-6 lg:grid-cols-2">
            <SectionCard title="Coming up" icon={CalendarRange} description="The next two weeks.">
              <ActionList items={data.upcoming} today={data.today} emptyIcon={CalendarRange} emptyTitle="A quiet fortnight" emptyDescription="No leave, holidays or events in the next 14 days." />
            </SectionCard>
            <SectionCard title="Waiting on others" icon={Hourglass} description="Yours, with someone else to act.">
              <ActionList items={data.waiting} today={data.today} emptyIcon={Hourglass} emptyTitle="Nothing waiting" />
            </SectionCard>
          </div>

          <SectionCard
            title="Recent notifications"
            icon={Bell}
            actions={<LinkButton to="/notifications" variant="ghost" size="sm">See all</LinkButton>}
          >
            {data.recent.length === 0 ? (
              <EmptyState icon={Bell} title="No notifications yet" className="py-8" />
            ) : (
              <ul className="-mx-2 divide-y divide-line">
                {data.recent.map((item) => {
                  const Icon = notificationIcon(item.kind);
                  const body = (
                    <>
                      <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-surface-muted text-fg-muted">
                        <Icon size={15} aria-hidden="true" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium text-fg [overflow-wrap:anywhere]">
                          {!item.readAt && <span className="sr-only">Unread: </span>}{item.title}
                        </span>
                        <time dateTime={item.createdAt} title={fullTimestamp(item.createdAt)} className="block text-xs text-fg-subtle">
                          {relativeTime(item.createdAt)}
                        </time>
                      </span>
                    </>
                  );
                  return (
                    <li key={item.id}>
                      {item.link ? (
                        <Link to={item.link} className="flex gap-3 rounded-lg px-2 py-2.5 hover:bg-surface-muted focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring">{body}</Link>
                      ) : (
                        <div className="flex gap-3 px-2 py-2.5">{body}</div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </SectionCard>
        </>
      )}
    </section>
  );
}
