import { ClipboardList } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { getApiErrorMessage } from "../../api/axios";
import { getMyReviews } from "../../api/performanceApi";
import ReviewRow from "../../components/performance/ReviewRow";
import EmptyState from "../../components/ui/EmptyState";
import ErrorState from "../../components/ui/ErrorState";
import PageHeader from "../../components/ui/PageHeader";
import SectionCard from "../../components/ui/SectionCard";
import { SkeletonText } from "../../components/ui/Skeleton";
import type { ReviewSummary } from "../../types/performance";

/** Your performance reviews: the self-review to write, and the manager's review once it is in. */
export default function ReviewsPage() {
  const [reviews, setReviews] = useState<ReviewSummary[] | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    setError("");
    getMyReviews().then((list) => setReviews(list.reviews)).catch((requestError) => setError(getApiErrorMessage(requestError, "Your reviews could not be loaded.")));
  }, []);

  useEffect(load, [load]);

  return (
    <section className="max-w-3xl space-y-6">
      <PageHeader title="My reviews" description="You write a self-review first; your manager's review follows, and you can respond to it." />
      <SectionCard>
        {error ? (
          <ErrorState title="Your reviews could not be loaded" description={error} onRetry={load} />
        ) : reviews === null ? (
          <><p className="sr-only" role="status">Loading reviews</p><SkeletonText lines={3} /></>
        ) : reviews.length === 0 ? (
          <EmptyState icon={ClipboardList} title="No reviews yet" description="When HR opens a review cycle that includes you, it appears here." />
        ) : (
          <ul className="-mx-2 divide-y divide-line">{reviews.map((review) => <li key={review.id}><ReviewRow review={review} showPerson={false} /></li>)}</ul>
        )}
      </SectionCard>
    </section>
  );
}
