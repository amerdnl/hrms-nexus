import { ArrowRight, Megaphone } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getAnnouncements } from "../../api/workplaceApi";
import type { Announcement, AnnouncementFeed } from "../../types/workplace";
import { cn } from "../../utils/cn";
import HomeEmptyState from "./HomeEmptyState";
import { compactAgo } from "./homeTime";

/** The latest announcements addressed to you, unread marked, with the feed's own unread and total counts. */
export default function UpdatesCard({ className }: { className?: string }) {
  const [feed, setFeed] = useState<AnnouncementFeed | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    getAnnouncements(1, 3).then(setFeed).catch(() => setFailed(true));
  }, []);

  const items: Announcement[] = feed?.items ?? [];

  return (
    <section aria-labelledby="home-updates-title" className={cn("flex flex-col rounded-card border border-line bg-surface p-5 shadow-card sm:p-6", className)}>
      <div className="flex items-center justify-between gap-3">
        <h2 id="home-updates-title" className="text-[1.0625rem] font-semibold text-fg">Company updates</h2>
        <Link to="/announcements" className="inline-flex min-h-8 items-center gap-1.5 rounded-md text-[0.8125rem] font-medium text-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
          View all
          <ArrowRight size={14} aria-hidden="true" />
        </Link>
      </div>

      <div className="mt-3 flex flex-1 flex-col">
        {failed && <p className="text-sm text-fg-muted">Announcements could not be loaded.</p>}
        {!failed && !feed && (
          <div aria-busy="true" className="space-y-4">
            {[0, 1, 2].map((key) => <div key={key} aria-hidden="true" className="h-8 animate-pulse rounded bg-surface-muted motion-reduce:animate-none" />)}
          </div>
        )}
        {feed && items.length === 0 && (
          <HomeEmptyState
            icon={Megaphone}
            tint="violet"
            title="No announcements yet"
            description="News from HR for the company or your department appears here."
          />
        )}
        {feed && items.length > 0 && (
          <ul className="divide-y divide-line">
            {items.map((item) => (
              <li key={item.id}>
                <Link to={`/announcements/${item.id}`} className="-mx-2 flex items-start gap-3.5 rounded-lg px-2 py-2 transition-colors hover:bg-surface-muted focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring">
                  <span
                    aria-hidden="true"
                    className={cn("mt-0.5 grid size-9 shrink-0 place-items-center rounded-full", item.priority === "important" ? "bg-danger-soft text-danger-fg" : "bg-surface-muted text-fg")}
                  >
                    <Megaphone size={16} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className={cn("line-clamp-2 text-sm leading-5 text-fg", !item.isRead && "font-semibold")}>
                      {!item.isRead && <span className="sr-only">Unread: </span>}
                      {item.title}
                    </span>
                    <span className="mt-0.5 block text-xs leading-4 text-fg-subtle">
                      {item.priority === "important" ? "Important" : item.departmentName ?? "Company-wide"}
                      {item.publishedAt && <> · <time dateTime={item.publishedAt}>{compactAgo(item.publishedAt)}</time></>}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      {feed && items.length > 0 && (
        <p className="mt-4 border-t border-line pt-3 text-[0.8125rem] text-fg-subtle">
          {feed.unreadCount > 0 ? `${feed.unreadCount} unread` : "All read"} · {feed.total} in all
        </p>
      )}
    </section>
  );
}
