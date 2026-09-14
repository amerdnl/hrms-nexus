import { ClipboardList } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { getApiErrorMessage } from "../../api/axios";
import { getTeamReviews } from "../../api/performanceApi";
import ReviewRow from "../../components/performance/ReviewRow";
import EmptyState from "../../components/ui/EmptyState";
import ErrorState from "../../components/ui/ErrorState";
import PageHeader from "../../components/ui/PageHeader";
import SectionCard from "../../components/ui/SectionCard";
import { SkeletonText } from "../../components/ui/Skeleton";
import type { ReviewSummary } from "../../types/performance";

/**
 * Reviews for the people who report to you now, by cycle. Their self-review
 * becomes readable when they submit it; yours is written after that.
 */
export default function TeamReviewsPage() {
  const [reviews, setReviews] = useState<ReviewSummary[] | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    setError("");
    getTeamReviews().then((list) => setReviews(list.reviews)).catch((requestError) => setError(getApiErrorMessage(requestError, "Team reviews could not be loaded.")));
  }, []);

  useEffect(load, [load]);

  const cycles = [...new Map((reviews ?? []).map((review) => [review.cycle.id, review.cycle])).values()];

  return (
    <section className="mx-auto max-w-3xl space-y-6">
      <PageHeader title="Team reviews" description="Write each review after the self-review arrives." />
      {error ? (
        <SectionCard><ErrorState title="Team reviews could not be loaded" description={error} onRetry={load} /></SectionCard>
      ) : reviews === null ? (
        <SectionCard><p className="sr-only" role="status">Loading team reviews</p><SkeletonText lines={4} /></SectionCard>
      ) : reviews.length === 0 ? (
        <SectionCard><EmptyState icon={ClipboardList} title="No team reviews" description="When HR opens a cycle, your reports' reviews appear here." /></SectionCard>
      ) : (
        cycles.map((cycle) => {
          const inCycle = reviews.filter((review) => review.cycle.id === cycle.id);
          const waiting = inCycle.filter((review) => review.status === "pending_manager").length;
          return (
            <SectionCard key={cycle.id} title={cycle.name} icon={ClipboardList}
              description={cycle.status === "open" ? (waiting === 0 ? "Nothing waiting on you." : `${waiting} waiting for your review.`) : "Closed."}>
              <ul className="-mx-2 divide-y divide-line">{inCycle.map((review) => <li key={review.id}><ReviewRow review={review} showPerson /></li>)}</ul>
            </SectionCard>
          );
        })
      )}
    </section>
  );
}
