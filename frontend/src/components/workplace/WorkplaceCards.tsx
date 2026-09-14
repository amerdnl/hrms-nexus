import { CircleCheck, Inbox, Megaphone } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getActionCenter, getAnnouncements } from "../../api/workplaceApi";
import type { ActionCenter, Announcement } from "../../types/workplace";
import { cn } from "../../utils/cn";
import { relativeTime } from "../../utils/relativeTime";
import LinkButton from "../ui/LinkButton";
import SectionCard from "../ui/SectionCard";
import { SkeletonText } from "../ui/Skeleton";
import StatusBadge from "../ui/StatusBadge";
import ActionList from "./ActionList";

/** The top of the Action Center, on a dashboard. */
export function ActionSummaryCard({ className }: { className?: string }) {
  const [data, setData] = useState<ActionCenter | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    getActionCenter().then(setData).catch(() => setFailed(true));
  }, []);

  const count = data?.counts.requiresAction ?? 0;
  return (
    <SectionCard
      title="Needs you"
      description={data ? (count === 0 ? "Nothing waiting on you." : `${count} ${count === 1 ? "item" : "items"} in your Action Center.`) : undefined}
      icon={Inbox}
      className={className}
      actions={<LinkButton to="/actions" variant="link" size="sm">Action Center</LinkButton>}
    >
      {failed ? (
        <p className="text-sm text-fg-muted">The Action Center could not be loaded.</p>
      ) : !data ? (
        <SkeletonText lines={3} />
      ) : (
        <ActionList
          items={data.requiresAction.slice(0, 4)}
          today={data.today}
          emptyIcon={CircleCheck}
          emptyTitle="You are all caught up"
        />
      )}
    </SectionCard>
  );
}

/** The latest three announcements addressed to you. */
export function AnnouncementsCard({ className }: { className?: string }) {
  const [items, setItems] = useState<Announcement[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    getAnnouncements(1, 3).then((feed) => setItems(feed.items)).catch(() => setFailed(true));
  }, []);

  return (
    <SectionCard
      title="Announcements"
      icon={Megaphone}
      className={className}
      actions={<LinkButton to="/announcements" variant="link" size="sm">All</LinkButton>}
    >
      {failed ? (
        <p className="text-sm text-fg-muted">Announcements could not be loaded.</p>
      ) : !items ? (
        <SkeletonText lines={3} />
      ) : items.length === 0 ? (
        <p className="text-sm text-fg-muted">No announcements yet.</p>
      ) : (
        <ul className="-mx-2 divide-y divide-line">
          {items.map((item) => (
            <li key={item.id}>
              <Link
                to={`/announcements/${item.id}`}
                className="block rounded-lg px-2 py-2.5 hover:bg-surface-muted focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
              >
                <span className="flex items-center gap-2">
                  {!item.isRead && <span className="h-2 w-2 shrink-0 rounded-full bg-primary" aria-hidden="true" />}
                  <span className={cn("min-w-0 flex-1 text-sm text-fg [overflow-wrap:anywhere]", !item.isRead ? "font-semibold" : "font-medium")}>
                    {!item.isRead && <span className="sr-only">Unread: </span>}{item.title}
                  </span>
                  {item.priority === "important" && <StatusBadge label="Important" tone="warning" />}
                </span>
                {item.publishedAt && <span className="mt-0.5 block text-xs text-fg-subtle">{relativeTime(item.publishedAt)}</span>}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}
