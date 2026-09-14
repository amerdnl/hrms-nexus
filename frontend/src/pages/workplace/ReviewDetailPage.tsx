import axios from "axios";
import { ClipboardList, MessageSquareReply, ShieldCheck, UserRound } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { getApiErrorMessage, resolveProfileImageUrl } from "../../api/axios";
import { getReview, respondToReview, writeReview } from "../../api/performanceApi";
import ReviewForm from "../../components/performance/ReviewForm";
import { reviewStatusMeta } from "../../components/performance/reviewMeta";
import Alert from "../../components/ui/Alert";
import Avatar from "../../components/ui/Avatar";
import Button from "../../components/ui/Button";
import EmptyState from "../../components/ui/EmptyState";
import ErrorState from "../../components/ui/ErrorState";
import FormField from "../../components/ui/FormField";
import LinkButton from "../../components/ui/LinkButton";
import PageHeader from "../../components/ui/PageHeader";
import SectionCard from "../../components/ui/SectionCard";
import { SkeletonText } from "../../components/ui/Skeleton";
import StatusBadge from "../../components/ui/StatusBadge";
import TextArea from "../../components/ui/TextArea";
import type { ReviewDetail, ReviewRating } from "../../types/performance";
import { formatDate } from "../../utils/datetime";

function Written({ summary, rating }: { summary: string | null; rating: ReviewRating | null }) {
  return (
    <div className="space-y-3">
      {rating && (
        <p className="inline-flex items-baseline gap-2 rounded-xl bg-primary-soft px-3 py-1.5">
          <span className="text-lg font-bold tabular-nums text-primary">{rating.value}</span>
          <span className="text-sm font-medium text-primary">{rating.label}</span>
        </p>
      )}
      <p className="whitespace-pre-line text-sm text-fg [overflow-wrap:anywhere]">{summary}</p>
    </div>
  );
}

/**
 * One review. What appears depends on who is reading, and the server decides
 * it: the employee sees the manager's review only once it is submitted, the
 * manager sees the self-review only once that is submitted, and HR sees
 * everything - with every HR read recorded in the audit log.
 */
export default function ReviewDetailPage() {
  const { id } = useParams();
  const reviewId = Number(id);
  const [review, setReview] = useState<ReviewDetail | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "missing" | "failed">("loading");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [actionError, setActionError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [response, setResponse] = useState("");

  const load = useCallback(() => {
    if (!Number.isSafeInteger(reviewId) || reviewId <= 0) {
      setState("missing");
      return;
    }
    getReview(reviewId)
      .then((found) => { setReview(found); setState("ready"); })
      .catch((requestError) => {
        if (axios.isAxiosError(requestError) && requestError.response?.status === 404) setState("missing");
        else { setError(getApiErrorMessage(requestError, "This review could not be loaded.")); setState("failed"); }
      });
  }, [reviewId]);

  useEffect(load, [load]);

  async function save(side: "self" | "manager", summary: string | null, rating: number | null, submit: boolean) {
    setBusy(true);
    setActionError("");
    setFieldErrors({});
    try {
      setNotice(await writeReview(reviewId, side, { summary, rating, submit }));
      load();
    } catch (requestError) {
      if (axios.isAxiosError(requestError) && requestError.response?.data?.errors) setFieldErrors(requestError.response.data.errors as Record<string, string>);
      setActionError(getApiErrorMessage(requestError, "The review could not be saved."));
    } finally {
      setBusy(false);
    }
  }

  async function sendResponse() {
    setBusy(true);
    setActionError("");
    try {
      await respondToReview(reviewId, response);
      setNotice("Response saved.");
      load();
    } catch (requestError) {
      setActionError(getApiErrorMessage(requestError, "Your response could not be saved."));
    } finally {
      setBusy(false);
    }
  }

  if (state === "missing" || state === "failed") {
    return (
      <section className="max-w-3xl space-y-6">
        <PageHeader title="Review" backTo="/reviews" backLabel="My reviews" />
        <SectionCard>
          {state === "missing"
            ? <EmptyState icon={ClipboardList} title="This review is not available" description="Reviews are read only by the person, their manager and HR." action={<LinkButton to="/reviews" variant="secondary">My reviews</LinkButton>} />
            : <ErrorState title="This review could not be loaded" description={error} onRetry={load} />}
        </SectionCard>
      </section>
    );
  }
  if (!review) {
    return <section className="max-w-3xl space-y-6"><SectionCard><p className="sr-only" role="status">Loading the review</p><SkeletonText lines={8} /></SectionCard></section>;
  }

  const meta = reviewStatusMeta(review.status);
  const isEmployee = review.role === "employee";
  const back = isEmployee ? "/reviews" : review.role === "manager" ? "/team/reviews" : `/admin/performance/cycles/${review.cycle.id}`;
  const firstName = review.employee.fullName.split(" ")[0];

  return (
    <section className="max-w-3xl space-y-6">
      <PageHeader
        title={isEmployee ? `${review.cycle.name} review` : `${review.cycle.name}: ${review.employee.fullName}`}
        description={`${formatDate(review.cycle.periodStart)} – ${formatDate(review.cycle.periodEnd)}`}
        backTo={back}
        backLabel="Back"
      />
      {review.role === "hr" && (
        <Alert tone="info">
          <span className="inline-flex items-center gap-2"><ShieldCheck size={16} aria-hidden="true" />Review content is private. HR's reading of it is recorded in the audit log.</span>
        </Alert>
      )}
      {notice && <Alert tone="success" onDismiss={() => setNotice("")}>{notice}</Alert>}
      {actionError && <Alert tone="danger" onDismiss={() => setActionError("")}>{actionError}</Alert>}

      <SectionCard>
        <div className="flex flex-wrap items-center gap-3">
          <Avatar name={review.employee.fullName} src={resolveProfileImageUrl(review.employee.profileImage)} size="md" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-fg [overflow-wrap:anywhere]">{review.employee.fullName}</p>
            <p className="text-xs text-fg-subtle [overflow-wrap:anywhere]">
              {[review.employee.jobTitle, review.employee.managerName ? `Reviewed by ${review.employee.managerName}` : "No manager: HR reviews"].filter(Boolean).join(" · ")}
            </p>
          </div>
          <div className="flex flex-col items-end gap-1">
            <StatusBadge label={meta.label} tone={meta.tone} />
            {review.cycle.status === "open" && review.dueOn && (
              <span className={review.overdue ? "text-xs font-semibold text-danger-fg" : "text-xs text-fg-subtle"}>{review.overdue ? "Past due " : "Due "}{formatDate(review.dueOn)}</span>
            )}
            {review.cycle.status === "closed" && <span className="text-xs text-fg-subtle">Cycle closed</span>}
          </div>
        </div>
      </SectionCard>

      <SectionCard title={isEmployee ? "Your self-review" : `${firstName}'s self-review`} icon={UserRound}>
        {review.can.writeSelf ? (
          <ReviewForm
            idPrefix="self"
            label="How did the period go?"
            initialSummary={review.content.self?.summary ?? null}
            initialRating={review.content.self?.rating?.value ?? null}
            scale={review.ratingScale}
            busy={busy}
            errors={fieldErrors}
            onSave={(summary, rating, submit) => void save("self", summary, rating, submit)}
            submitWarning="Your manager will be able to read it, and it cannot be changed afterwards."
          />
        ) : review.selfSubmittedAt && review.content.self ? (
          <Written summary={review.content.self.summary} rating={review.content.self.rating} />
        ) : (
          <p className="text-sm text-fg-muted">{isEmployee ? "The cycle is closed." : `Not submitted yet. You can read it once ${firstName} submits it.`}</p>
        )}
      </SectionCard>

      <SectionCard title={review.role === "manager" ? "Your review" : "Manager's review"} icon={ClipboardList}>
        {review.can.writeManager ? (
          <ReviewForm
            idPrefix="manager"
            label={`Your review of ${firstName}`}
            initialSummary={review.content.manager?.summary ?? null}
            initialRating={review.content.manager?.rating?.value ?? null}
            scale={review.ratingScale}
            busy={busy}
            errors={fieldErrors}
            onSave={(summary, rating, submit) => void save("manager", summary, rating, submit)}
            submitWarning={`${firstName} will be told it is ready to read, and it cannot be changed afterwards.`}
          />
        ) : review.managerSubmittedAt && review.content.manager ? (
          <Written summary={review.content.manager.summary} rating={review.content.manager.rating} />
        ) : (
          <p className="text-sm text-fg-muted">
            {review.status === "pending_self" ? "Written after the self-review is submitted." : isEmployee ? "Your manager has not submitted it yet." : "Not submitted."}
          </p>
        )}
      </SectionCard>

      {(review.status === "completed") && (
        <SectionCard title={isEmployee ? "Your response" : `${firstName}'s response`} icon={MessageSquareReply}>
          {review.can.respond ? (
            <div className="space-y-3">
              <FormField id="review-response" label="Anything you want on record" hint={`Optional. ${response.length} of 2000 characters. It cannot be changed once saved.`}>
                <TextArea id="review-response" rows={4} maxLength={2000} value={response} onChange={(e) => setResponse(e.target.value)} />
              </FormField>
              <div className="flex justify-end">
                <Button icon={MessageSquareReply} disabled={busy || !response.trim()} onClick={() => void sendResponse()}>Save response</Button>
              </div>
            </div>
          ) : review.content.response ? (
            <p className="whitespace-pre-line text-sm text-fg [overflow-wrap:anywhere]">{review.content.response}</p>
          ) : (
            <p className="text-sm text-fg-muted">No response.</p>
          )}
        </SectionCard>
      )}
    </section>
  );
}
