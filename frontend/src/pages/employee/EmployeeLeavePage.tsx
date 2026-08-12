import { CalendarOff, CalendarPlus, CalendarRange } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { getApiErrorMessage } from "../../api/axios";
import { createLeaveRequest, getMyLeaveRequests } from "../../api/leaveApi";
import Alert from "../../components/ui/Alert";
import Button from "../../components/ui/Button";
import DataTable from "../../components/ui/DataTable";
import EmptyState from "../../components/ui/EmptyState";
import FormField from "../../components/ui/FormField";
import PageHeader from "../../components/ui/PageHeader";
import PrimaryButton from "../../components/ui/PrimaryButton";
import SectionCard from "../../components/ui/SectionCard";
import SelectInput from "../../components/ui/SelectInput";
import StatusBadge from "../../components/ui/StatusBadge";
import Tabs, { type TabItem } from "../../components/ui/Tabs";
import TextArea from "../../components/ui/TextArea";
import TextInput from "../../components/ui/TextInput";
import type {
  CreateLeaveRequestInput,
  LeaveRequest,
  LeaveType,
} from "../../types/leave";
import { formatDate, formatDateTime } from "../../utils/datetime";
import {
  calcLeaveDays,
  formatLeaveDays,
  formatLeaveDaysBetween,
} from "../../utils/leave";
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
  "Leave type",
  "Start date",
  "End date",
  "Total days",
  "Reason",
  "Status",
  "Admin comment",
  "Applied on",
];

export default function EmployeeLeavePage() {
  const [form, setForm] = useState<CreateLeaveRequestInput>(initialForm);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [leaves, setLeaves] = useState<LeaveRequest[]>([]);
  const [isLoadingLeaves, setIsLoadingLeaves] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState(APPLY_TAB);

  useEffect(() => {
    async function loadLeaveHistory() {
      try {
        const data = await getMyLeaveRequests();
        setLeaves(data);
      } catch (requestError) {
        setError(
          getApiErrorMessage(requestError, "Unable to load leave history."),
        );
      } finally {
        setIsLoadingLeaves(false);
      }
    }

    void loadLeaveHistory();
  }, []);

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
      // The new row lands in the other panel, so move to it - otherwise the
      // confirmation points at something the user cannot see.
      setActiveTab(HISTORY_TAB);
    } catch (requestError) {
      setError(
        getApiErrorMessage(requestError, "Unable to submit leave request."),
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  // Informational only. This project has no leave balance: nothing is
  // deducted, accrued, or checked against an entitlement, and this value
  // never gates submission.
  const requestedDays = calcLeaveDays(form.startDate, form.endDate);

  const tabs: TabItem[] = [
    { id: APPLY_TAB, label: "Apply for leave" },
    { id: HISTORY_TAB, label: "Leave history", count: leaves.length },
  ];

  return (
    <section className="mx-auto max-w-7xl space-y-6">
      <PageHeader
        title="My leave"
        description="Submit a leave request and review your leave history."
      />

      {/* Above the tabs on purpose: a submission made on the Apply panel
          switches to History, and the confirmation has to survive that. */}
      {error && <Alert tone="danger">{error}</Alert>}
      {success && <Alert tone="success">{success}</Alert>}

      <Tabs tabs={tabs} active={activeTab} onChange={setActiveTab} />

      {/* Both panels stay mounted so every tab's aria-controls resolves to a
          real element; `hidden` takes the inactive one out of the a11y tree. */}
      <div
        role="tabpanel"
        id={`panel-${APPLY_TAB}`}
        aria-labelledby={`tab-${APPLY_TAB}`}
        hidden={activeTab !== APPLY_TAB}
      >
        <SectionCard title="Apply for leave" icon={CalendarPlus}>
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
              <p
                className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg bg-surface-muted px-3 py-2.5 text-sm text-fg-muted"
                // Announced when the dates change, without stealing focus.
                role="status"
              >
                <CalendarRange
                  size={15}
                  className="text-primary"
                  aria-hidden="true"
                />
                Total days:{" "}
                <span className="font-semibold text-fg">
                  {formatLeaveDays(requestedDays)}
                </span>
                <span className="text-xs text-fg-subtle">
                  Every calendar day in the range, weekends and holidays
                  included.
                </span>
              </p>
            )}

            <FormField id="reason" label="Reason" required>
              <TextArea
                id="reason"
                rows={5}
                value={form.reason}
                onChange={(event) =>
                  setForm({ ...form, reason: event.target.value })
                }
                placeholder="Explain the reason for your leave request"
              />
            </FormField>

            <PrimaryButton
              type="submit"
              isLoading={isSubmitting}
              loadingLabel="Submitting..."
            >
              Submit request
            </PrimaryButton>
          </form>
        </SectionCard>
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
          minWidthClass="min-w-250"
          isLoading={isLoadingLeaves}
          loadingLabel="Loading leave history..."
          isEmpty={leaves.length === 0}
          emptyState={
            <EmptyState
              icon={CalendarOff}
              title="No leave requests found"
              description="Requests you submit will be listed here with their status and any admin comment."
              action={
                <Button
                  variant="secondary"
                  size="sm"
                  icon={CalendarPlus}
                  onClick={() => setActiveTab(APPLY_TAB)}
                >
                  Apply for leave
                </Button>
              }
            />
          }
        >
          {leaves.map((leave) => (
            <tr key={leave.id}>
              <td className="px-5 py-4">
                <StatusBadge {...leaveTypeMeta(leave.leaveType)} />
              </td>

              <td className="px-5 py-4 font-medium text-fg">
                {formatDate(leave.startDate)}
              </td>

              <td className="px-5 py-4 font-medium text-fg">
                {formatDate(leave.endDate)}
              </td>

              <td className="px-5 py-4 text-fg-muted">
                {formatLeaveDaysBetween(leave.startDate, leave.endDate)}
              </td>

              <td className="max-w-56 px-5 py-4 text-fg-muted">
                {leave.reason}
              </td>

              <td className="px-5 py-4">
                <StatusBadge {...leaveStatusMeta(leave.status)} />
              </td>

              <td className="max-w-48 px-5 py-4 text-fg-muted">
                {leave.adminComment ?? "—"}
              </td>

              <td className="px-5 py-4 text-fg-muted">
                {formatDateTime(leave.createdAt)}
              </td>
            </tr>
          ))}
        </DataTable>
      </div>
    </section>
  );
}
