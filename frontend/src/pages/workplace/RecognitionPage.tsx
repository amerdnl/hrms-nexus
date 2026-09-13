import { Award, Plus } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { getApiErrorMessage } from "../../api/axios";
import { getRecognition, setRecognitionHidden } from "../../api/recognitionApi";
import GiveRecognitionDialog from "../../components/recognition/GiveRecognitionDialog";
import RecognitionEntry from "../../components/recognition/RecognitionEntry";
import Alert from "../../components/ui/Alert";
import Button from "../../components/ui/Button";
import EmptyState from "../../components/ui/EmptyState";
import ErrorState from "../../components/ui/ErrorState";
import PageHeader from "../../components/ui/PageHeader";
import SectionCard from "../../components/ui/SectionCard";
import { SkeletonText } from "../../components/ui/Skeleton";
import Tabs from "../../components/ui/Tabs";
import { useAuth } from "../../context/useAuth";
import type { RecognitionFeed, RecognitionItem, RecognitionView } from "../../types/recognition";

/**
 * Recognition across the company, and what you received and gave. HR also has
 * a moderation view with private and hidden recognition, and can hide abuse.
 * Deliberately not an endless social feed: short thank-yous, limited per day.
 */
export default function RecognitionPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const hasRecord = user?.employeeId !== null && user?.employeeId !== undefined;
  const [params, setParams] = useSearchParams();

  const tabs = [
    { id: "company", label: "Company" },
    ...(hasRecord ? [{ id: "received", label: "Received" }, { id: "given", label: "Given" }] : []),
    ...(isAdmin ? [{ id: "all", label: "Moderation" }] : []),
  ];
  const requested = params.get("view");
  const view = (tabs.some((tab) => tab.id === requested) ? requested : "company") as RecognitionView;

  const [feed, setFeed] = useState<RecognitionFeed | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [isGiving, setIsGiving] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  const load = useCallback(() => {
    setFeed(null);
    setError("");
    getRecognition(view)
      .then(setFeed)
      .catch((requestError) => setError(getApiErrorMessage(requestError, "Recognition could not be loaded.")));
  }, [view]);

  useEffect(load, [load]);

  async function moderate(item: RecognitionItem, hidden: boolean) {
    setBusyId(item.id);
    try {
      await setRecognitionHidden(item.id, hidden);
      setNotice(hidden ? "Hidden from everyone but HR." : "Visible again.");
      setFeed((current) => current && { ...current, items: current.items.map((entry) => (entry.id === item.id ? { ...entry, hidden } : entry)) });
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, "That could not be changed."));
    } finally {
      setBusyId(null);
    }
  }

  async function loadMore() {
    if (!feed) return;
    setIsLoadingMore(true);
    try {
      const next = await getRecognition(view, feed.page + 1);
      setFeed({ ...next, items: [...feed.items, ...next.items] });
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, "More recognition could not be loaded."));
    } finally {
      setIsLoadingMore(false);
    }
  }

  const remaining = feed?.givenToday !== null && feed?.givenToday !== undefined ? feed.dailyLimit - feed.givenToday : null;

  return (
    <section className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title="Recognition"
        description="Thank-yous between colleagues, in their own words."
        actions={hasRecord && (
          <Button icon={Plus} onClick={() => setIsGiving(true)} disabled={remaining === 0}>
            Recognise someone
          </Button>
        )}
      />
      {remaining !== null && (
        <p className="-mt-3 text-sm text-fg-muted">{remaining === 0 ? "You have given all five recognitions for today." : `You can give ${remaining} more today.`}</p>
      )}
      {notice && <Alert tone="success" onDismiss={() => setNotice("")}>{notice}</Alert>}

      <SectionCard padded={false}>
        <div className="border-b border-line px-4 pt-2 sm:px-5">
          <Tabs tabs={tabs} active={view} onChange={(id) => setParams(id === "company" ? {} : { view: id }, { replace: true })} />
        </div>
        <div role="tabpanel" id={`panel-${view}`} aria-labelledby={`tab-${view}`} className="px-4 sm:px-5">
          {error ? (
            <div className="py-5"><ErrorState title="Recognition could not be loaded" description={error} onRetry={load} /></div>
          ) : feed === null ? (
            <div className="py-5"><p className="sr-only" role="status">Loading recognition</p><SkeletonText lines={6} /></div>
          ) : feed.items.length === 0 ? (
            <EmptyState
              icon={Award}
              title={view === "received" ? "Nothing received yet" : view === "given" ? "You have not recognised anyone yet" : "No recognition yet"}
              description={view === "given" || view === "company" ? "Thank a colleague for something specific they did." : undefined}
            />
          ) : (
            <ul className="divide-y divide-line">
              {feed.items.map((item) => (
                <li key={item.id}>
                  <RecognitionEntry item={item} onModerate={view === "all" ? (entry, hidden) => void moderate(entry, hidden) : undefined} busy={busyId === item.id} />
                </li>
              ))}
            </ul>
          )}
          {feed && feed.items.length < feed.total && (
            <div className="border-t border-line py-4 text-center">
              <Button variant="ghost" size="sm" isLoading={isLoadingMore} loadingLabel="Loading…" onClick={() => void loadMore()}>Show more</Button>
            </div>
          )}
        </div>
      </SectionCard>

      <GiveRecognitionDialog
        isOpen={isGiving}
        onClose={() => setIsGiving(false)}
        onGiven={(message) => {
          setIsGiving(false);
          setNotice(message);
          load();
        }}
      />
    </section>
  );
}
