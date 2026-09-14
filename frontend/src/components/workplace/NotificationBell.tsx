import { Bell, CheckCheck } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  getNotifications,
  getUnreadCount,
  markAllNotificationsRead,
  markNotificationRead,
} from "../../api/workplaceApi";
import type { NotificationItem } from "../../types/workplace";
import { cn } from "../../utils/cn";
import { fullTimestamp, relativeTime } from "../../utils/relativeTime";
import { SkeletonText } from "../ui/Skeleton";
import { notificationIcon } from "./workplaceIcons";

const POLL_MS = 60_000;

/**
 * The header bell: an unread count, and the latest notifications a click away.
 *
 * The count refreshes on every navigation, every minute while the tab is
 * visible, and when the tab comes back into view - no sockets, and nothing
 * polled while nobody is looking. Opening an entry marks it read and follows
 * its link; the destination page checks access again, so the link is only
 * ever a pointer.
 */
export default function NotificationBell() {
  const [count, setCount] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const [items, setItems] = useState<NotificationItem[] | null>(null);
  const [failed, setFailed] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const { pathname } = useLocation();
  const navigate = useNavigate();

  const refreshCount = useCallback(() => {
    getUnreadCount().then(setCount).catch(() => {
      // A missed badge refresh is not worth an error; the next one will try again.
    });
  }, []);

  useEffect(() => {
    refreshCount();
    setIsOpen(false);
  }, [pathname, refreshCount]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") refreshCount();
    };
    const timer = window.setInterval(onVisible, POLL_MS);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refreshCount]);

  useEffect(() => {
    if (!isOpen) return;
    setItems(null);
    setFailed(false);
    getNotifications({ limit: 8 })
      .then((page) => {
        setItems(page.items);
        setCount(page.unreadCount);
      })
      .catch(() => setFailed(true));
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onPointer = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!panelRef.current?.contains(target) && !buttonRef.current?.contains(target)) setIsOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [isOpen]);

  async function open(item: NotificationItem) {
    if (!item.readAt) {
      try {
        setCount(await markNotificationRead(item.id));
      } catch {
        // Following the link still matters more than the read marker.
      }
    }
    setIsOpen(false);
    if (item.link) navigate(item.link);
  }

  async function readAll() {
    try {
      await markAllNotificationsRead();
      setCount(0);
      const stamp = new Date().toISOString();
      setItems((current) => current?.map((item) => ({ ...item, readAt: item.readAt ?? stamp })) ?? null);
    } catch {
      setFailed(true);
    }
  }

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setIsOpen((value) => !value)}
        aria-expanded={isOpen}
        aria-controls={panelId}
        aria-label={count > 0 ? `Notifications, ${count} unread` : "Notifications"}
        className="relative grid size-10 place-items-center rounded-xl text-fg transition-colors hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        <Bell size={20} aria-hidden="true" />
        {/* The reference's unread dot: present or absent, a shape cue rather
            than a colour one. The count itself is in the button's name and at
            the top of the panel. */}
        {count > 0 && (
          <span
            aria-hidden="true"
            className="absolute right-2 top-2 size-2.5 rounded-full bg-[#dc2626] ring-2 ring-header"
          />
        )}
      </button>

      {isOpen && (
        <div
          ref={panelRef}
          id={panelId}
          role="region"
          aria-label="Recent notifications"
          className="fixed inset-x-3 top-[4.25rem] z-40 overflow-hidden rounded-card border border-line bg-surface shadow-card sm:absolute sm:inset-x-auto sm:right-0 sm:top-12 sm:w-96"
        >
          <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
            <p className="text-sm font-semibold text-fg">Notifications</p>
            {count > 0 && (
              <button
                type="button"
                onClick={() => void readAll()}
                className="inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2 text-xs font-semibold text-primary hover:bg-primary-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                <CheckCheck size={14} aria-hidden="true" />
                Mark all read
              </button>
            )}
          </div>

          <div className="max-h-[min(28rem,65vh)] overflow-y-auto">
            {failed && <p className="px-4 py-6 text-sm text-fg-muted">Notifications could not be loaded. Try again in a moment.</p>}
            {!failed && items === null && <div className="p-4"><SkeletonText lines={4} /></div>}
            {!failed && items?.length === 0 && (
              <p className="px-4 py-8 text-center text-sm text-fg-muted">You are all caught up.</p>
            )}
            {!failed && items && items.length > 0 && (
              <ul className="divide-y divide-line">
                {items.map((item) => {
                  const Icon = notificationIcon(item.kind);
                  return (
                    <li key={item.id}>
                      <button
                        type="button"
                        onClick={() => void open(item)}
                        className={cn(
                          "flex w-full gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-muted focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring",
                          !item.readAt && "bg-primary-soft/40",
                        )}
                      >
                        <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-surface-muted text-fg-muted">
                          <Icon size={15} aria-hidden="true" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-medium text-fg [overflow-wrap:anywhere]">
                            {!item.readAt && <span className="sr-only">Unread: </span>}
                            {item.title}
                          </span>
                          {item.body && <span className="mt-0.5 block text-xs text-fg-muted [overflow-wrap:anywhere]">{item.body}</span>}
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
          </div>

          <div className="border-t border-line px-4 py-2.5">
            <Link
              to="/notifications"
              className="inline-flex min-h-9 items-center text-sm font-semibold text-primary hover:underline focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              See all notifications
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
