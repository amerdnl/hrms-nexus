import { ArrowRight, Megaphone } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getAnnouncements } from "../../api/workplaceApi";
import type { Announcement } from "../../types/workplace";
import { cn } from "../../utils/cn";
import { compactAgo } from "./homeTime";

/** The latest announcements addressed to you, unread first to catch the eye. */
export default function UpdatesCard({ className }: { className?: string }) {
  const [items, setItems] = useState<Announcement[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    getAnnouncements(1, 3).then((feed) => setItems(feed.items)).catch(() => setFailed(true));
  }, []);

  return (
    <section aria-labelledby="home-updates-title" className={cn("flex flex-col rounded-card border border-line bg-surface p-5 shadow-card sm:p-6", className)}>
      <div className="flex items-center justify-between gap-3">
        <h2 id="home-updates-title" className="text-[1.0625rem] font-semibold text-fg">Company updates</h2>
        <Link to="/announcements" className="inline-flex min-h-8 items-center gap-1.5 rounded-md text-[0.8125rem] font-medium text-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
          View all
          <ArrowRight size={14} aria-hidden="true" />
        </Link>
      </div>

      <div className="mt-3 flex-1">
        {failed && <p className="text-sm text-fg-muted">Announcements could not be loaded.</p>}
        {!failed && !items && (
          <div aria-busy="true" className="space-y-4">
            {[0, 1, 2].map((key) => <div key={key} aria-hidden="true" className="h-8 animate-pulse rounded bg-surface-muted motion-reduce:animate-none" />)}
          </div>
        )}
        {items && items.length === 0 && <p className="py-2 text-sm text-fg-muted">No announcements yet.</p>}
        {items && items.length > 0 && (
          <ul className="divide-y divide-line">
            {items.map((item) => (
              <li key={item.id}>
                <Link to={`/announcements/${item.id}`} className="-mx-2 flex items-center gap-4 rounded-lg px-2 py-2.5 transition-colors hover:bg-surface-muted focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring">
                  <span
                    aria-hidden="true"
                    className={cn("grid size-9 shrink-0 place-items-center rounded-full", item.priority === "important" ? "bg-danger-soft text-danger-fg" : "bg-surface-muted text-fg")}
                  >
                    <Megaphone size={16} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className={cn("block truncate text-sm text-fg", !item.isRead && "font-semibold")}>
                      {!item.isRead && <span className="sr-only">Unread: </span>}
                      {item.title}
                    </span>
                    <span className="block truncate text-[0.8125rem] text-fg-subtle">
                      {item.priority === "important" ? "Important" : item.departmentName ?? "Company-wide"}
                    </span>
                  </span>
                  {item.publishedAt && <time dateTime={item.publishedAt} className="shrink-0 text-[0.8125rem] text-fg-subtle">{compactAgo(item.publishedAt)}</time>}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
