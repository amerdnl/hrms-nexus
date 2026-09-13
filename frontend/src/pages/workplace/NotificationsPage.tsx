import { Bell, CheckCheck } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getApiErrorMessage } from "../../api/axios";
import { getNotifications, markAllNotificationsRead, markNotificationRead } from "../../api/workplaceApi";
import { notificationIcon } from "../../components/workplace/workplaceIcons";
import Alert from "../../components/ui/Alert";
import Button from "../../components/ui/Button";
import EmptyState from "../../components/ui/EmptyState";
import ErrorState from "../../components/ui/ErrorState";
import PageHeader from "../../components/ui/PageHeader";
import SectionCard from "../../components/ui/SectionCard";
import { SkeletonText } from "../../components/ui/Skeleton";
import Tabs from "../../components/ui/Tabs";
import type { NotificationItem } from "../../types/workplace";
import { cn } from "../../utils/cn";
import { fullTimestamp, relativeTime } from "../../utils/relativeTime";

type Filter = "all" | "unread";

/**
 * Every notification the account has received, newest first, 20 at a time.
 * Read notifications are kept for 90 days and unread ones for a year.
 */
export default function NotificationsPage() {
  const [filter, setFilter] = useState<Filter>("all");
  const [items, setItems] = useState<NotificationItem[] | null>(null);
  const [nextBefore, setNextBefore] = useState<number | null>(null);
  const [unread, setUnread] = useState(0);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const navigate = useNavigate();

  const load = useCallback((which: Filter) => {
    setItems(null);
    setError("");
    getNotifications({ filter: which, limit: 20 })
      .then((page) => {
        setItems(page.items);
        setNextBefore(page.nextBefore);
        setUnread(page.unreadCount);
      })
      .catch((requestError) => setError(getApiErrorMessage(requestError, "Notifications could not be loaded.")));
  }, []);

  useEffect(() => load(filter), [filter, load]);

  async function loadMore() {
    if (nextBefore === null) return;
    setIsLoadingMore(true);
    try {
      const page = await getNotifications({ filter, before: nextBefore, limit: 20 });
      setItems((current) => [...(current ?? []), ...page.items]);
      setNextBefore(page.nextBefore);
    } catch (requestError) {
      setActionError(getApiErrorMessage(requestError, "More notifications could not be loaded."));
    } finally {
      setIsLoadingMore(false);
    }
  }

  async function open(item: NotificationItem) {
    if (!item.readAt) {
      try {
        setUnread(await markNotificationRead(item.id));
      } catch {
        // The link still works without the marker.
      }
    }
    if (item.link) navigate(item.link);
    else setItems((current) => current?.map((entry) => entry.id === item.id ? { ...entry, readAt: new Date().toISOString() } : entry) ?? null);
  }

  async function readAll() {
    setActionError("");
    try {
      await markAllNotificationsRead();
      setUnread(0);
      if (filter === "unread") setItems([]);
      else setItems((current) => current?.map((item) => ({ ...item, readAt: item.readAt ?? new Date().toISOString() })) ?? null);
    } catch (requestError) {
      setActionError(getApiErrorMessage(requestError, "Notifications could not be marked as read."));
    }
  }

  return (
    <section className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title="Notifications"
        description={unread > 0 ? `${unread} unread.` : "You are all caught up."}
        actions={unread > 0 && <Button variant="secondary" size="sm" icon={CheckCheck} onClick={() => void readAll()}>Mark all read</Button>}
      />

      {actionError && <Alert tone="danger" onDismiss={() => setActionError("")}>{actionError}</Alert>}

      <SectionCard padded={false}>
        <div className="border-b border-line px-4 pt-2 sm:px-5">
          <Tabs
            tabs={[{ id: "all", label: "All" }, { id: "unread", label: "Unread", count: unread }]}
            active={filter}
            onChange={(id) => setFilter(id as Filter)}
          />
        </div>
        <div role="tabpanel" id={`panel-${filter}`} aria-labelledby={`tab-${filter}`}>
          {error && <div className="p-5"><ErrorState title="Notifications could not be loaded" description={error} onRetry={() => load(filter)} /></div>}
          {!error && items === null && <div className="p-5"><p className="sr-only" role="status">Loading notifications</p><SkeletonText lines={5} /></div>}
          {!error && items?.length === 0 && (
            <EmptyState
              icon={Bell}
              title={filter === "unread" ? "No unread notifications" : "No notifications yet"}
              description="Leave decisions, payslips, announcements and changes to your team appear here."
            />
          )}
          {!error && items && items.length > 0 && (
            <ul className="divide-y divide-line">
              {items.map((item) => {
                const Icon = notificationIcon(item.kind);
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => void open(item)}
                      className={cn(
                        "flex w-full gap-3 px-4 py-4 text-left transition-colors hover:bg-surface-muted focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring sm:px-5",
                        !item.readAt && "bg-primary-soft/40",
                      )}
                    >
                      <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full bg-surface-muted text-fg-muted">
                        <Icon size={16} aria-hidden="true" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className={cn("block text-sm text-fg [overflow-wrap:anywhere]", !item.readAt ? "font-semibold" : "font-medium")}>
                          {!item.readAt && <span className="sr-only">Unread: </span>}
                          {item.title}
                        </span>
                        {item.body && <span className="mt-0.5 block text-sm text-fg-muted [overflow-wrap:anywhere]">{item.body}</span>}
                        <time dateTime={item.createdAt} title={fullTimestamp(item.createdAt)} className="mt-1 block text-xs text-fg-subtle">
                          {relativeTime(item.createdAt)}
                        </time>
                      </span>
                      {!item.readAt && <span aria-hidden="true" className="mt-2 h-2 w-2 shrink-0 rounded-full bg-primary" />}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {!error && nextBefore !== null && items && items.length > 0 && (
            <div className="border-t border-line p-4 text-center">
              <Button variant="ghost" size="sm" isLoading={isLoadingMore} loadingLabel="Loading…" onClick={() => void loadMore()}>
                Show older
              </Button>
            </div>
          )}
        </div>
      </SectionCard>
    </section>
  );
}
