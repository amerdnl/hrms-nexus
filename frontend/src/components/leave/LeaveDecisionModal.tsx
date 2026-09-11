import { CircleCheck, CircleX } from "lucide-react";
import { useState } from "react";
import { getApiErrorMessage } from "../../api/axios";
import { updateLeaveStatus } from "../../api/leaveApi";
import type { TeamLeaveRequest } from "../../types/team";
import { formatDateRange, formatDateTime } from "../../utils/datetime";
import { formatLeaveDuration } from "../../utils/leave";
import { leaveStatusMeta, leaveTypeMeta } from "../../utils/status";
import Alert from "../ui/Alert";
import Avatar from "../ui/Avatar";
import Button from "../ui/Button";
import DescriptionList from "../ui/DescriptionList";
import FormField from "../ui/FormField";
import Modal from "../ui/Modal";
import SecondaryButton from "../ui/SecondaryButton";
import StatusBadge from "../ui/StatusBadge";
import TextArea from "../ui/TextArea";

interface LeaveDecisionModalProps {
  leave: TeamLeaveRequest | null;
  onClose: () => void;
  /** Called after a decision is saved, with the outcome, so the caller can reload. */
  onDecided: (status: "approved" | "rejected", leave: TeamLeaveRequest) => void;
}

/**
 * A manager's decision on one request from their team.
 *
 * The same endpoint HR uses. The server decides whether this manager may decide
 * this request - a current direct report, never their own - so a request that
 * moved to another team while this dialog was open is refused there, and the
 * refusal is shown here rather than guessed at in advance.
 */
export default function LeaveDecisionModal({ leave, onClose, onDecided }: LeaveDecisionModalProps) {
  const [comment, setComment] = useState("");
  const [pending, setPending] = useState<"approved" | "rejected" | null>(null);
  const [error, setError] = useState("");

  function close() {
    if (pending) return;
    setComment("");
    setError("");
    onClose();
  }

  async function decide(status: "approved" | "rejected") {
    if (!leave) return;
    setPending(status);
    setError("");
    try {
      await updateLeaveStatus(leave.id, { status, adminComment: comment });
      setComment("");
      onDecided(status, leave);
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, "The decision could not be saved."));
    } finally {
      setPending(null);
    }
  }

  const isPending = leave?.status === "pending";
  const exceeds = leave && isPending && leave.availableDays !== null && leave.workingDays !== null
    && leave.workingDays > leave.availableDays;

  return (
    <Modal
      isOpen={leave !== null}
      onClose={close}
      title={isPending ? "Review leave request" : "Leave request"}
      description={isPending ? "Your comment is saved with the decision and shown to your team member." : undefined}
      size="lg"
      isDismissDisabled={pending !== null}
    >
      {leave && (
        <div className="mt-5 space-y-5">
          <div className="flex items-center gap-3 rounded-xl bg-surface-muted p-4">
            <Avatar name={leave.employeeName} size="lg" />
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-fg [overflow-wrap:anywhere]">{leave.employeeName}</p>
              <p className="text-sm text-fg-muted">{leave.employeeNumber}</p>
            </div>
            <StatusBadge {...leaveStatusMeta(leave.status)} />
          </div>

          <DescriptionList
            items={[
              { label: "Leave type", value: <StatusBadge {...leaveTypeMeta(leave.leaveType)} /> },
              { label: "Duration", value: formatLeaveDuration(leave) },
              { label: "Dates", value: formatDateRange(leave.startDate, leave.endDate) },
              { label: "Applied", value: formatDateTime(leave.createdAt) },
              ...(isPending && leave.availableDays !== null
                ? [{ label: "Available for this request", value: `${leave.availableDays} working day${leave.availableDays === 1 ? "" : "s"}` }]
                : []),
              { label: "Reason", value: leave.reason, wide: true },
              ...(!isPending
                ? [
                    { label: "Decided", value: leave.reviewedAt ? formatDateTime(leave.reviewedAt) : null },
                    { label: "Comment", value: leave.adminComment, wide: true },
                  ]
                : []),
            ]}
          />

          {exceeds && (
            <Alert tone="warning">
              This request is longer than the balance available for it. Approving it will be refused.
            </Alert>
          )}
          {error && <Alert tone="danger">{error}</Alert>}

          {isPending ? (
            <>
              <FormField id="manager-comment" label="Comment for your team member">
                <TextArea
                  id="manager-comment"
                  rows={3}
                  value={comment}
                  onChange={(event) => setComment(event.target.value)}
                  placeholder="Optional"
                  disabled={pending !== null}
                />
              </FormField>
              <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                <SecondaryButton onClick={close} disabled={pending !== null}>Cancel</SecondaryButton>
                <Button
                  variant="danger"
                  icon={CircleX}
                  onClick={() => void decide("rejected")}
                  isLoading={pending === "rejected"}
                  loadingLabel="Rejecting..."
                  disabled={pending === "approved"}
                >
                  Reject
                </Button>
                <Button
                  icon={CircleCheck}
                  onClick={() => void decide("approved")}
                  isLoading={pending === "approved"}
                  loadingLabel="Approving..."
                  disabled={pending === "rejected"}
                >
                  Approve
                </Button>
              </div>
            </>
          ) : (
            <div className="flex justify-end">
              <SecondaryButton onClick={close}>Close</SecondaryButton>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
