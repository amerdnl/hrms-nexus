import { Megaphone, Plus } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { getApiErrorMessage } from "../../api/axios";
import { getAnnouncements, getManagedAnnouncements } from "../../api/workplaceApi";
import Button from "../../components/ui/Button";
import EmptyState from "../../components/ui/EmptyState";
import ErrorState from "../../components/ui/ErrorState";
import LinkButton from "../../components/ui/LinkButton";
import PageHeader from "../../components/ui/PageHeader";
import SectionCard from "../../components/ui/SectionCard";
import { SkeletonText } from "../../components/ui/Skeleton";
import StatusBadge from "../../components/ui/StatusBadge";
import Tabs from "../../components/ui/Tabs";
import { useAuth } from "../../context/useAuth";
import type { Announcement, AnnouncementStatus, ManagedAnnouncement } from "../../types/workplace";
import { cn } from "../../utils/cn";
import { fullTimestamp, relativeTime } from "../../utils/relativeTime";

type Tab = "feed" | AnnouncementStatus;

function audienceLabel(item: Announcement): string {
  return item.audience === "company" ? "Everyone" : item.departmentName ?? "One department";
}

function AnnouncementRow({ item, managed }: { item: Announcement | ManagedAnnouncement; managed: boolean }) {
  const stamp = item.publishedAt ?? item.updatedAt;
  const excerpt = item.body.replace(/\s+/g, " ").trim();
  const reads = managed && "readCount" in item ? item : null;
  return (
    <li>
      <Link
        to={`/announcements/${item.id}`}
        className={cn(
          "block px-4 py-4 transition-colors hover:bg-surface-muted focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring sm:px-5",
          !managed && !item.isRead && "bg-primary-soft/40",
        )}
      >
        <div className="flex flex-wrap items-center gap-2">
          {!managed && !item.isRead && <span className="h-2 w-2 rounded-full bg-primary" aria-hidden="true" />}
          <h3 className={cn("min-w-0 flex-1 basis-48 text-base text-fg [overflow-wrap:anywhere]", !managed && !item.isRead ? "font-semibold" : "font-medium")}>
            {!managed && !item.isRead && <span className="sr-only">Unread: </span>}
            {item.title}
          </h3>
          {item.priority === "important" && <StatusBadge label="Important" tone="warning" />}
          {managed && item.status !== "published" && (
            <StatusBadge label={item.status === "draft" ? "Draft" : "Archived"} tone={item.status === "draft" ? "info" : "neutral"} />
          )}
        </div>
        <p className="mt-1 line-clamp-2 text-sm text-fg-muted [overflow-wrap:anywhere]">{excerpt}</p>
        <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-fg-subtle">
          <span>{audienceLabel(item)}</span>
          {item.authorName && <span>From {item.authorName}</span>}
          <time dateTime={stamp} title={fullTimestamp(stamp)}>
            {item.publishedAt ? relativeTime(item.publishedAt) : `Edited ${relativeTime(item.updatedAt)}`}
          </time>
          {item.expiresOn && item.status === "published" && <span>Shown until {item.expiresOn}</span>}
          {reads && item.status !== "draft" && <span>Read by {reads.readCount} of {reads.audienceSize}</span>}
        </p>
      </Link>
    </li>
  );
}

/**
 * News from HR. Everyone sees what is addressed to them; HR also sees drafts
 * and archived announcements, and how many people have read each one.
 */
export default function AnnouncementsPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [params, setParams] = useSearchParams();
  const requested = params.get("tab") as Tab | null;
  const tab: Tab = isAdmin && requested && ["draft", "published", "archived"].includes(requested) ? requested : "feed";

  const [items, setItems] = useState<Array<Announcement | ManagedAnnouncement> | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [counts, setCounts] = useState<Partial<Record<AnnouncementStatus, number>>>({});
  const [unread, setUnread] = useState(0);
  const [error, setError] = useState("");
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  const fetchPage = useCallback(async (which: Tab, pageNumber: number) => {
    if (which === "feed") {
      const feed = await getAnnouncements(pageNumber);
      setUnread(feed.unreadCount);
      return { items: feed.items as Array<Announcement | ManagedAnnouncement>, total: feed.total };
    }
    const managed = await getManagedAnnouncements(which, pageNumber);
    setCounts(managed.counts);
    return { items: managed.items as Array<Announcement | ManagedAnnouncement>, total: managed.total };
  }, []);

  const load = useCallback(() => {
    setItems(null);
    setError("");
    setPage(1);
    fetchPage(tab, 1)
      .then((result) => {
        setItems(result.items);
        setTotal(result.total);
      })
      .catch((requestError) => setError(getApiErrorMessage(requestError, "Announcements could not be loaded.")));
    if (isAdmin && tab === "feed") getManagedAnnouncements("all").then((managed) => setCounts(managed.counts)).catch(() => undefined);
  }, [tab, fetchPage, isAdmin]);

  useEffect(load, [load]);

  async function loadMore() {
    setIsLoadingMore(true);
    try {
      const result = await fetchPage(tab, page + 1);
      setItems((current) => [...(current ?? []), ...result.items]);
      setPage(page + 1);
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, "More announcements could not be loaded."));
    } finally {
      setIsLoadingMore(false);
    }
  }

  const tabs = [
    { id: "feed", label: "Current" },
    { id: "draft", label: "Drafts", count: counts.draft ?? 0 },
    { id: "archived", label: "Archived", count: counts.archived ?? 0 },
  ];

  return (
    <section className="max-w-3xl space-y-6">
      <PageHeader
        title="Announcements"
        description={isAdmin
          ? "Write to the whole company or one department. Colleagues only see what is addressed to them."
          : unread > 0 ? `${unread} you have not opened yet.` : "News from HR."}
        actions={isAdmin && <LinkButton to="/admin/announcements/new" icon={Plus}>New announcement</LinkButton>}
      />

      <SectionCard padded={false}>
        {isAdmin && (
          <div className="border-b border-line px-4 pt-2 sm:px-5">
            <Tabs tabs={tabs} active={tab} onChange={(id) => setParams(id === "feed" ? {} : { tab: id }, { replace: true })} />
          </div>
        )}
        <div {...(isAdmin ? { role: "tabpanel", id: `panel-${tab}`, "aria-labelledby": `tab-${tab}` } : {})}>
          {error && <div className="p-5"><ErrorState title="Announcements could not be loaded" description={error} onRetry={load} /></div>}
          {!error && items === null && <div className="p-5"><p className="sr-only" role="status">Loading announcements</p><SkeletonText lines={6} /></div>}
          {!error && items?.length === 0 && (
            <EmptyState
              icon={Megaphone}
              title={tab === "draft" ? "No drafts" : tab === "archived" ? "Nothing archived" : "No announcements yet"}
              description={tab === "feed" ? "When HR publishes news for you, it appears here." : undefined}
            />
          )}
          {!error && items && items.length > 0 && (
            <ul className="divide-y divide-line">
              {items.map((item) => <AnnouncementRow key={item.id} item={item} managed={tab !== "feed"} />)}
            </ul>
          )}
          {!error && items && items.length < total && (
            <div className="border-t border-line p-4 text-center">
              <Button variant="ghost" size="sm" isLoading={isLoadingMore} loadingLabel="Loading…" onClick={() => void loadMore()}>Show more</Button>
            </div>
          )}
        </div>
      </SectionCard>
    </section>
  );
}
