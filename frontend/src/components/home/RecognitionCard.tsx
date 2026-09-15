import { ArrowRight, Award } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { resolveProfileImageUrl } from "../../api/axios";
import { getRecognition } from "../../api/recognitionApi";
import type { RecognitionItem } from "../../types/recognition";
import { cn } from "../../utils/cn";
import Avatar from "../ui/Avatar";
import HomeEmptyState from "./HomeEmptyState";
import { compactAgo } from "./homeTime";

/**
 * The latest thanks you received. Private recognition appears here only
 * because you are its receiver; the server decides what this feed holds.
 */
export default function RecognitionCard({ className }: { className?: string }) {
  const [items, setItems] = useState<RecognitionItem[] | null>(null);
  const [total, setTotal] = useState(0);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    getRecognition("received", 1, 2)
      .then((feed) => {
        setItems(feed.items);
        setTotal(feed.total);
      })
      .catch(() => setFailed(true));
  }, []);

  return (
    <section aria-labelledby="home-recognition-title" className={cn("flex flex-col rounded-card border border-line bg-surface p-5 shadow-card sm:p-6", className)}>
      <div className="flex items-center justify-between gap-3">
        <h2 id="home-recognition-title" className="text-[1.0625rem] font-semibold text-fg">Recognition</h2>
        <Link to="/recognition" className="inline-flex min-h-8 items-center gap-1.5 rounded-md text-[0.8125rem] font-medium text-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
          Recognise someone
          <ArrowRight size={14} aria-hidden="true" />
        </Link>
      </div>

      <div className="mt-3 flex flex-1 flex-col">
        {failed && <p className="text-sm text-fg-muted">Recognition could not be loaded.</p>}
        {!failed && !items && (
          <div aria-busy="true" className="space-y-4">
            {[0, 1].map((key) => <div key={key} aria-hidden="true" className="h-12 animate-pulse rounded bg-surface-muted motion-reduce:animate-none" />)}
          </div>
        )}
        {items && items.length === 0 && (
          <HomeEmptyState
            icon={Award}
            tint="amber"
            title="No recognition yet"
            description="When a colleague thanks you, it appears here - and you can thank someone any time."
          />
        )}
        {items && items.length > 0 && (
          <ul className="divide-y divide-line">
            {items.map((item) => (
              <li key={item.id} className="flex gap-3.5 py-3 first:pt-1 last:pb-0">
                <Avatar name={item.giver.fullName} src={resolveProfileImageUrl(item.giver.profileImage)} size="md" />
                <div className="min-w-0 flex-1">
                  <p className="flex items-baseline justify-between gap-3">
                    <span className="min-w-0 text-sm font-medium text-fg">{item.giver.fullName}</span>
                    <time dateTime={item.createdAt} className="shrink-0 text-[0.8125rem] text-fg-subtle">{compactAgo(item.createdAt)}</time>
                  </p>
                  <p className="text-[0.8125rem] text-primary">{item.categoryLabel}</p>
                  <p className={cn("mt-1 text-[0.8125rem] leading-5 text-fg-muted", items.length > 1 ? "line-clamp-2" : "line-clamp-4")}>{item.message}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {items && items.length > 0 && (
        <p className="mt-4 border-t border-line pt-3 text-[0.8125rem] text-fg-subtle">
          {total} received{total > items.length ? ` · showing the latest ${items.length}` : ""}
        </p>
      )}
    </section>
  );
}
