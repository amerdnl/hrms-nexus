import { CalendarOff, CalendarPlus, CalendarRange, Send } from "lucide-react";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { getApiErrorMessage } from "../../api/axios";
import {
  cancelLeaveRequest,
  createLeaveRequest,
  getMyLeaveBalances,
  getMyLeaveRequests,
} from "../../api/leaveApi";
import Alert from "../../components/ui/Alert";
import Button from "../../components/ui/Button";
import DataTable from "../../components/ui/DataTable";
import EmptyState from "../../components/ui/EmptyState";
import FormField from "../../components/ui/FormField";
import PageHeader from "../../components/ui/PageHeader";
import RecordCard from "../../components/ui/RecordCard";
import PrimaryButton from "../../components/ui/PrimaryButton";
import SectionCard from "../../components/ui/SectionCard";
import LeaveBalanceCards from "../../components/leave/LeaveBalanceCards";
import SelectInput from "../../components/ui/SelectInput";
import { SkeletonText } from "../../components/ui/Skeleton";
import StatusBadge from "../../components/ui/StatusBadge";
import Tabs, { type TabItem } from "../../components/ui/Tabs";
import TextArea from "../../components/ui/TextArea";
import TextInput from "../../components/ui/TextInput";
import type {
  CreateLeaveRequestInput,
  LeaveBalance,
  LeaveRequest,
  LeaveType,
} from "../../types/leave";
import { formatDate, formatDateRange } from "../../utils/datetime";
import { calcLeaveDays, countWorkingDays, describeWorkingWeek, formatLeaveDuration } from "../../utils/leave";
import { getCalendarConfig } from "../../api/workplaceApi";
import { leaveStatusMeta, leaveTypeMeta } from "../../utils/status";

const initialForm: CreateLeaveRequestInput = {
  leaveType: "annual",
  startDate: "",
  endDate: "",
  reason: "",
};

/** Dropdown order, preserved from the original markup. */
const leaveTypes: LeaveType[] = ["annual", "medical", "emergency", "unpaid"];

const APPLY_TAB = "apply";
const HISTORY_TAB = "history";

const tableHeaders = [
  "Leave",
  "Dates",
  "Duration",
  "Status",
  "Comment",
  "Applied",
  <span key="action" className="sr-only">Action</span>,
];

/**
 * Turns a rejected submission into something actionable.
 *
 * The server names the exact problem per field in `errors`; showing only the
 * summary ("Check the highlighted leave details") leaves the employee guessing.
 */
function describeLeaveError(error: unknown, fallback: string): string {
  const details = (error as { response?: { data?: { errors?: Record<string, string> } } })
    .response?.data?.errors;

  const summary = getApiErrorMessage(error, fallback);
  if (!details || typeof details !== "object") return summary;

  const messages = Object.values(details).filter((value): value is string => typeof value === "string");
  return messages.length > 0 ? messages.join(" ") : summary;
}

export default function EmployeeLeavePage() {
  const [form, setForm] = useState<CreateLeaveRequestInput>(initialForm);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [leaves, setLeaves] = useState<LeaveRequest[]>([]);
  const [isLoadingLeaves, setIsLoadingLeaves] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState(APPLY_TAB);
  const [balances, setBalances] = useState<LeaveBalance[]>([]);
  const [leaveYear, setLeaveYear] = useState(new Date().getFullYear());
  const [isLoadingBalances, setIsLoadingBalances] = useState(true);
  const [balancesFailed, setBalancesFailed] = useState(false);
  const [cancellingId, setCancellingId] = useState<number | null>(null);
  // The company's working week, holidays and today: the same ones the server
  // uses to count a request and to decide whether it has started.
  const [calendar, setCalendar] = useState<{ today: string; workingDays: number[] | null; holidays: Array<{ date: string; name: string }> } | null>(null);

  useEffect(() => {
    getCalendarConfig().then(setCalendar).catch(() => setCalendar(null));
  }, []);

  const reload = useCallback(async () => {
    try {
      setLeaves(await getMyLeaveRequests());
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, "Unable to load leave history."));
    } finally {
      setIsLoadingLeaves(false);
    }

    // Balances are loaded separately: if they fail the page still works and the
    // server remains the authority when a request is submitted.
    try {
      const result = await getMyLeaveBalances();
      setBalances(result.balances);
      setLeaveYear(result.leaveYear);
      setBalancesFailed(false);
    } catch {
      setBalancesFailed(true);
    } finally {
      setIsLoadingBalances(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function handleCancel(id: number) {
    setError("");
    setSuccess("");
    setCancellingId(id);

    try {
      await cancelLeaveRequest(id);
      setSuccess("Leave request cancelled. Those days are available again.");
      await reload();
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, "Unable to cancel that request."));
    } finally {
      setCancellingId(null);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setError("");
    setSuccess("");

    if (!form.startDate || !form.endDate || !form.reason.trim()) {
      setError("Please complete all required fields.");
      return;
    }

    if (form.startDate > form.endDate) {
      setError("Start date cannot be after the end date.");
      return;
    }

    try {
      setIsSubmitting(true);

      const newLeave = await createLeaveRequest(form);

      setLeaves((currentLeaves) => [newLeave, ...currentLeaves]);
      setSuccess("Leave request submitted successfully.");
      setForm(initialForm);
      void reload();
      // The new row lands in the other panel, so move to it - otherwise the
      // confirmation points at something the user cannot see.
      setActiveTab(HISTORY_TAB);
    } catch (requestError) {
      setError(describeLeaveError(requestError, "Unable to submit leave request."));
    } finally {
      setIsSubmitting(false);
    }
  }

  // The balance is charged WORKING days, counted from the company's working
  // week. V3 exposes that week (and only that, with holidays and today) to
  // every account, so the preview counts exactly as the server will. Without
  // it the page falls back to the calendar span and says so.
  const requestedDays = calcLeaveDays(form.startDate, form.endDate);
  const workingDaysInRange = calendar?.workingDays ? countWorkingDays(form.startDate, form.endDate, calendar.workingDays) : null;
  const holidaysInRange = calendar && form.startDate && form.endDate
    ? calendar.holidays.filter((holiday) => holiday.date >= form.startDate && holiday.date <= form.endDate)
    : [];
  const selectedBalance = balances.find((balance) => balance.leaveType === form.leaveType) ?? null;

  const tabs: TabItem[] = [
    { id: APPLY_TAB, label: "Request leave" },
    { id: HISTORY_TAB, label: "My requests", count: leaves.length },
  ];

  const canCancel = (leave: LeaveRequest) =>
    // Only leave that has not started can be withdrawn; anything else needs an
    // administrator correction, so no button is offered. The server enforces
    // the same rule and refuses otherwise.
    // "Started" is judged by the company's today, as the server judges it -
    // not by the browser's clock or its UTC date.
    (leave.status === "pending" || leave.status === "approved") &&
    leave.startDate > (calendar?.today ?? new Date().toISOString().slice(0, 10));

  const cancelButton = (leave: LeaveRequest) =>
    canCancel(leave) ? (
      <Button
        variant="danger-ghost"
        size="sm"
        isLoading={cancellingId === leave.id}
        loadingLabel="Cancelling..."
        onClick={() => void handleCancel(leave.id)}
        aria-label={`Cancel ${leaveTypeMeta(leave.leaveType).label.toLowerCase()} leave from ${formatDate(leave.startDate)}`}
      >
        Cancel
      </Button>
    ) : null;

  return (
    <section className="max-w-6xl space-y-6">
      <PageHeader
        title="My leave"
        description="Check your balances, request time off and follow each request."
      />

      {/* Above the tabs on purpose: a submission made on the Apply panel
          switches to History, and the confirmation has to survive that. */}
      {error && <Alert tone="danger" onDismiss={() => setError("")}>{error}</Alert>}
      {success && <Alert tone="success" onDismiss={() => setSuccess("")}>{success}</Alert>}

      <SectionCard title="Your balances" icon={CalendarRange}>
        <LeaveBalanceCards
          balances={balances}
          leaveYear={leaveYear}
          isLoading={isLoadingBalances}
          failed={balancesFailed}
        />
      </SectionCard>

      <Tabs tabs={tabs} active={activeTab} onChange={setActiveTab} />

      {/* Both panels stay mounted so every tab's aria-controls resolves to a
          real element; `hidden` takes the inactive one out of the a11y tree. */}
      <div
        role="tabpanel"
        id={`panel-${APPLY_TAB}`}
        aria-labelledby={`tab-${APPLY_TAB}`}
        hidden={activeTab !== APPLY_TAB}
      >
        <div className="grid items-start gap-6 lg:grid-cols-3">
          <SectionCard className="lg:col-span-2" title="Request time off" icon={CalendarPlus}>
            <form className="space-y-5" onSubmit={handleSubmit}>
              <FormField id="leaveType" label="Leave type" required>
                <SelectInput
                  id="leaveType"
                  value={form.leaveType}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      leaveType: event.target.value as LeaveType,
                    })
                  }
                >
                  {leaveTypes.map((leaveType) => (
                    <option key={leaveType} value={leaveType}>
                      {leaveTypeMeta(leaveType).label} leave
                    </option>
                  ))}
                </SelectInput>
              </FormField>

              <div className="grid gap-4 sm:grid-cols-2">
                <FormField id="startDate" label="Start date" required>
                  <TextInput
                    id="startDate"
                    type="date"
                    value={form.startDate}
                    onChange={(event) =>
                      setForm({ ...form, startDate: event.target.value })
                    }
                  />
                </FormField>

                <FormField id="endDate" label="End date" required>
                  <TextInput
                    id="endDate"
                    type="date"
                    value={form.endDate}
                    onChange={(event) =>
                      setForm({ ...form, endDate: event.target.value })
                    }
                  />
                </FormField>
              </div>

              {requestedDays !== null && (
                <div
                  className="flex items-start gap-3 rounded-xl bg-primary-soft p-4"
                  // Announced when the dates change, without stealing focus.
                  role="status"
                >
                  <CalendarRange size={18} className="mt-0.5 shrink-0 text-primary" aria-hidden="true" />
                  <div>
                    <p className="text-sm font-semibold text-fg">
                      {formatDateRange(form.startDate, form.endDate)} ·{" "}
                      {workingDaysInRange !== null
                        ? `${workingDaysInRange} working day${workingDaysInRange === 1 ? "" : "s"}`
                        : `${requestedDays} calendar day${requestedDays === 1 ? "" : "s"}`}
                    </p>
                    <p className="mt-0.5 text-xs text-fg-muted">
                      {workingDaysInRange === null
                        ? "Your balance is charged only the working days in this range, counted from your company\u2019s working week when you submit."
                        : workingDaysInRange === 0
                          ? "There are no working days in this range, so there is no leave to request."
                          : `Counted from your company\u2019s working week (${describeWorkingWeek(calendar!.workingDays!)}), exactly as your balance will be charged.`}
                      {holidaysInRange.length > 0 && workingDaysInRange !== null && (
                        ` Includes ${holidaysInRange.map((holiday) => holiday.name).join(", ")}: company holidays inside a leave range are still counted.`
                      )}
                    </p>
                  </div>
                </div>
              )}

              <FormField id="reason" label="Reason" required>
                <TextArea
                  id="reason"
                  rows={4}
                  value={form.reason}
                  onChange={(event) =>
                    setForm({ ...form, reason: event.target.value })
                  }
                  placeholder="Explain the reason for your leave request"
                />
              </FormField>

              <div className="flex justify-end border-t border-line pt-5">
                <PrimaryButton
                  type="submit"
                  icon={Send}
                  isLoading={isSubmitting}
                  loadingLabel="Submitting..."
                >
                  Submit request
                </PrimaryButton>
              </div>
            </form>
          </SectionCard>

          <SectionCard title={`${leaveTypeMeta(form.leaveType).label} leave`} icon={leaveTypeMeta(form.leaveType).icon}>
            {balancesFailed ? (
              <p className="text-sm text-fg-muted">
                Your balance could not be loaded. You can still apply; the server
                checks your balance when you submit.
              </p>
            ) : isLoadingBalances ? (
              <SkeletonText lines={3} />
            ) : selectedBalance?.deductsBalance ? (
              <>
                <p className="text-xs font-medium text-fg-muted">You can request now</p>
                <p className="mt-1 text-3xl font-bold tracking-tight text-fg">
                  {selectedBalance.availableDays}
                  <span className="ml-1.5 text-sm font-medium text-fg-muted">working days</span>
                </p>
                <p className="mt-2 text-xs text-fg-subtle">
                  {selectedBalance.remainingDays} of {selectedBalance.entitledDays} left
                  {selectedBalance.pendingDays > 0 ? `, ${selectedBalance.pendingDays} awaiting approval` : ""}.
                </p>
              </>
            ) : selectedBalance ? (
              <p className="text-sm text-fg-muted">
                No balance limit. {selectedBalance.isPaid ? "This leave is paid." : "Unpaid, so it reduces pay."}
              </p>
            ) : (
              <p className="text-sm text-fg-muted">This leave type has no active policy.</p>
            )}
          </SectionCard>
        </div>
      </div>

      <div
        role="tabpanel"
        id={`panel-${HISTORY_TAB}`}
        aria-labelledby={`tab-${HISTORY_TAB}`}
        hidden={activeTab !== HISTORY_TAB}
      >
        <DataTable
          headers={tableHeaders}
          caption="Your leave requests"
          minWidthClass="min-w-200"
          isLoading={isLoadingLeaves}
          loadingLabel="Loading leave history"
          isEmpty={leaves.length === 0}
          emptyState={
            <EmptyState
              icon={CalendarOff}
              title="No leave requests yet"
              description="Requests you submit are listed here with their status and any comment from your administrator."
              action={
                <Button
                  variant="secondary"
                  size="sm"
                  icon={CalendarPlus}
                  onClick={() => setActiveTab(APPLY_TAB)}
                >
                  Request time off
                </Button>
              }
            />
          }
          mobileCards={leaves.map((leave) => (
            <RecordCard
              key={leave.id}
              leading={<LeaveTypeTile leaveType={leave.leaveType} />}
              title={`${leaveTypeMeta(leave.leaveType).label} leave`}
              subtitle={formatDateRange(leave.startDate, leave.endDate)}
              badge={<StatusBadge {...leaveStatusMeta(leave.status)} />}
              meta={[
                { label: "Duration", value: formatLeaveDuration(leave) },
                { label: "Applied", value: formatDate(leave.createdAt) },
                ...(leave.adminComment ? [{ label: "Comment", value: leave.adminComment }] : []),
              ]}
              actions={cancelButton(leave) ?? undefined}
            />
          ))}
        >
          {leaves.map((leave) => (
            <tr key={leave.id} className="align-top transition-colors hover:bg-surface-muted">
              <td className="px-5 py-3">
                <StatusBadge {...leaveTypeMeta(leave.leaveType)} />
                <p className="mt-1.5 max-w-56 text-xs text-fg-muted">{leave.reason}</p>
              </td>

              <td className="whitespace-nowrap px-5 py-3 font-medium text-fg">
                {formatDateRange(leave.startDate, leave.endDate)}
              </td>

              {/* The server's snapshot, in working days; older records that
                  predate it say "calendar days" so the two are never confused. */}
              <td className="whitespace-nowrap px-5 py-3 text-fg-muted">
                {formatLeaveDuration(leave)}
              </td>

              <td className="px-5 py-3">
                <StatusBadge {...leaveStatusMeta(leave.status)} />
              </td>

              <td className="max-w-52 px-5 py-3 text-fg-muted">
                {leave.adminComment ?? "—"}
              </td>

              <td className="whitespace-nowrap px-5 py-3 text-fg-muted">
                {formatDate(leave.createdAt)}
              </td>

              <td className="px-3 py-3 text-right">{cancelButton(leave) ?? <span className="text-fg-subtle">—</span>}</td>
            </tr>
          ))}
        </DataTable>
      </div>
    </section>
  );
}

function LeaveTypeTile({ leaveType }: { leaveType: LeaveType }) {
  const Icon = leaveTypeMeta(leaveType).icon;
  return (
    <span className="grid h-10 w-10 place-items-center rounded-xl bg-surface-muted text-primary" aria-hidden="true">
      <Icon size={18} />
    </span>
  );
}
