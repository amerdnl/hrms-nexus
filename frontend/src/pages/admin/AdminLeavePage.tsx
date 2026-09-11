import { CalendarDays, CircleCheck, CircleX, Eye } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { getApiErrorMessage } from "../../api/axios";
import { getEmployeeLookup } from "../../api/employeeApi";
import { getAllLeaveRequests, updateLeaveStatus } from "../../api/leaveApi";
import EmployeeEntitlementPanel from "../../components/leave/EmployeeEntitlementPanel";
import Alert from "../../components/ui/Alert";
import Avatar from "../../components/ui/Avatar";
import Button from "../../components/ui/Button";
import DataTable from "../../components/ui/DataTable";
import DescriptionList from "../../components/ui/DescriptionList";
import EmptyState from "../../components/ui/EmptyState";
import FilterPanel from "../../components/ui/FilterPanel";
import FormField from "../../components/ui/FormField";
import { fieldDescribedBy } from "../../components/ui/fieldStyles";
import Modal from "../../components/ui/Modal";
import PageHeader from "../../components/ui/PageHeader";
import Pagination from "../../components/ui/Pagination";
import RecordCard from "../../components/ui/RecordCard";
import SecondaryButton from "../../components/ui/SecondaryButton";
import SelectInput from "../../components/ui/SelectInput";
import StatusBadge from "../../components/ui/StatusBadge";
import Tabs, { type TabItem } from "../../components/ui/Tabs";
import TextArea from "../../components/ui/TextArea";
import TextInput from "../../components/ui/TextInput";
import { useDebouncedValue } from "../../hooks/useDebouncedValue";
import type { EmployeeLookupEntry } from "../../types/employee";
import type { LeaveRequest, LeaveStatus, LeaveType } from "../../types/leave";
import {
  formatDate,
  formatDateRange,
  formatDateTime,
  toIsoDate,
} from "../../utils/datetime";
import { formatLeaveDuration } from "../../utils/leave";
import { leaveStatusMeta, leaveTypeMeta } from "../../utils/status";

const SEARCH_DEBOUNCE_MS = 350;
const PAGE_SIZE = 25;

const typeOptions: LeaveType[] = ["annual", "medical", "emergency", "unpaid"];

type TabId = LeaveStatus | "all";

/**
 * Status is a tab rather than a filter field. Pending comes first and is the
 * default, because it is the one list that asks something of the person
 * reading it; the others are records.
 */
const TAB_ORDER: TabId[] = ["pending", "approved", "rejected", "cancelled", "all"];

const tableHeaders = [
  "Employee",
  "Type",
  "Dates",
  "Duration",
  "Status",
  "Applied",
  <span key="action" className="sr-only">
    Action
  </span>,
];

export default function AdminLeavePage() {
  const [leaves, setLeaves] = useState<LeaveRequest[]>([]);
  const [employees, setEmployees] = useState<EmployeeLookupEntry[]>([]);
  const [directoryFailed, setDirectoryFailed] = useState(false);

  // Isolated from the request list: if the directory fails, only the balance
  // panel is unavailable and leave review still works.
  useEffect(() => {
    getEmployeeLookup().then(setEmployees).catch(() => setDirectoryFailed(true));
  }, []);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [activeTab, setActiveTab] = useState<TabId>("pending");

  // Server-side filter: the API already implements it.
  const [employeeFilter, setEmployeeFilter] = useState("");

  // Client-side filters, applied over the rows the API returned.
  const [typeFilter, setTypeFilter] = useState("");
  const [rangeStart, setRangeStart] = useState("");
  const [rangeEnd, setRangeEnd] = useState("");

  const [page, setPage] = useState(1);

  const [reviewLeave, setReviewLeave] = useState<LeaveRequest | null>(null);
  const [adminComment, setAdminComment] = useState("");
  const [pendingDecision, setPendingDecision] = useState<
    "approved" | "rejected" | null
  >(null);

  // The employee filter is a server query, so it is debounced: without this
  // every keystroke fires a request against an endpoint with no pagination.
  const debouncedEmployeeFilter = useDebouncedValue(
    employeeFilter,
    SEARCH_DEBOUNCE_MS,
  );

  /*
   * Status is applied client-side now, not sent to the server. The endpoint is
   * unpaginated either way, so the rows are the same; fetching every status
   * once is what lets each tab show an accurate count. Sending the status
   * would have made every tab but the open one read zero.
   */
  useEffect(() => {
    async function loadLeaves() {
      setIsLoading(true);

      try {
        const data = await getAllLeaveRequests({
          employee: debouncedEmployeeFilter || undefined,
        });
        setLeaves(data);
      } catch (requestError) {
        setError(
          getApiErrorMessage(requestError, "Unable to load leave requests."),
        );
      } finally {
        setIsLoading(false);
      }
    }

    void loadLeaves();
  }, [debouncedEmployeeFilter]);

  /**
   * Type and date-range filtering, client-side.
   *
   * The range uses OVERLAP, not containment: a request counts if any part of
   * it falls inside the window. Containment would hide a two-week leave from
   * someone filtering a single week, which is the opposite of useful.
   *
   * Comparison is lexicographic on "YYYY-MM-DD", which is exactly correct for
   * that format and avoids Date parsing entirely.
   */
  const filteredLeaves = useMemo(
    () =>
      leaves.filter((leave) => {
        if (typeFilter && leave.leaveType !== typeFilter) return false;

        if (rangeStart || rangeEnd) {
          const leaveStart = toIsoDate(leave.startDate);
          const leaveEnd = toIsoDate(leave.endDate);

          // An unparseable date cannot be placed in the window. Excluding it
          // is deliberate: toIsoDate returns "", which sorts below every real
          // date and would otherwise satisfy `leaveStart <= rangeEnd` and make
          // the row match every window.
          if (!leaveStart || !leaveEnd) return false;

          if (rangeStart && leaveEnd < rangeStart) return false;
          if (rangeEnd && leaveStart > rangeEnd) return false;
        }

        return true;
      }),
    [leaves, typeFilter, rangeStart, rangeEnd],
  );

  // Counted after the other filters and before the tab, so every tab's badge
  // agrees with what that tab will show when opened.
  const statusCounts = useMemo(() => {
    const counts: Record<TabId, number> = {
      pending: 0,
      approved: 0,
      rejected: 0,
      cancelled: 0,
      all: filteredLeaves.length,
    };
    for (const leave of filteredLeaves) counts[leave.status] += 1;
    return counts;
  }, [filteredLeaves]);

  const tabLeaves = useMemo(
    () =>
      activeTab === "all"
        ? filteredLeaves
        : filteredLeaves.filter((leave) => leave.status === activeTab),
    [filteredLeaves, activeTab],
  );

  useEffect(() => {
    setPage(1);
  }, [activeTab, debouncedEmployeeFilter, typeFilter, rangeStart, rangeEnd]);

  const pageCount = Math.max(1, Math.ceil(tabLeaves.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);

  const pageLeaves = useMemo(
    () => tabLeaves.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE),
    [tabLeaves, safePage],
  );

  const activeFilterCount = [employeeFilter, typeFilter, rangeStart, rangeEnd].filter(
    Boolean,
  ).length;

  function clearFilters() {
    setEmployeeFilter("");
    setTypeFilter("");
    setRangeStart("");
    setRangeEnd("");
  }

  function openReview(leave: LeaveRequest) {
    setReviewLeave(leave);
    setAdminComment("");
    setNotice("");
  }

  function closeReview() {
    if (pendingDecision) return;
    setReviewLeave(null);
    setAdminComment("");
  }

  /*
   * One panel for reading and deciding. It used to be two dialogs - details,
   * then a separate confirmation - which meant the decision was made on a
   * second screen after the request had been closed. The request, its reason,
   * its duration and the comment box are now all on screen at the moment
   * Approve or Reject is pressed. Same endpoint, same payload.
   */
  async function decide(status: "approved" | "rejected") {
    if (!reviewLeave) return;

    try {
      setPendingDecision(status);
      setError("");

      const updatedLeave = await updateLeaveStatus(reviewLeave.id, {
        status,
        adminComment,
      });

      setLeaves((currentLeaves) =>
        currentLeaves.map((leave) =>
          leave.id === reviewLeave.id ? updatedLeave : leave,
        ),
      );

      setNotice(
        `${reviewLeave.employeeName ?? "The"} request was ${status === "approved" ? "approved" : "rejected"}.`,
      );
      setReviewLeave(null);
      setAdminComment("");
    } catch (requestError) {
      setError(
        getApiErrorMessage(requestError, "Unable to update leave request."),
      );
    } finally {
      setPendingDecision(null);
    }
  }

  const tabs: TabItem[] = TAB_ORDER.map((id) => ({
    id,
    label: id === "all" ? "All requests" : leaveStatusMeta(id).label,
    count: statusCounts[id],
  }));

  const actionFor = (leave: LeaveRequest) =>
    leave.status === "pending" ? (
      <Button size="sm" variant="secondary" onClick={() => openReview(leave)}>
        Review
      </Button>
    ) : (
      <Button
        size="sm"
        variant="ghost"
        icon={Eye}
        onClick={() => openReview(leave)}
        aria-label={`View request from ${leave.employeeName ?? "employee"}`}
        title="View request"
      />
    );

  const emptyForTab =
    activeFilterCount > 0 ? (
      <EmptyState
        icon={CalendarDays}
        title="No requests match these filters"
        description="Adjust or clear the filters to see more."
        action={
          <Button variant="secondary" size="sm" onClick={clearFilters}>
            Clear filters
          </Button>
        }
      />
    ) : activeTab === "pending" ? (
      <EmptyState
        icon={CircleCheck}
        title="Nothing awaiting a decision"
        description="New requests appear here as employees submit them."
        action={
          statusCounts.all > 0 ? (
            <Button variant="secondary" size="sm" onClick={() => setActiveTab("all")}>
              View all requests
            </Button>
          ) : undefined
        }
      />
    ) : (
      <EmptyState
        icon={CalendarDays}
        title={
          activeTab === "all"
            ? "No leave requests yet"
            : `No ${leaveStatusMeta(activeTab).label.toLowerCase()} requests`
        }
        description="Requests submitted by employees appear here."
      />
    );

  return (
    <section className="mx-auto max-w-7xl space-y-6">
      <PageHeader
        title="Leave"
        description="Review requests, then manage each employee's entitlements."
      />

      {notice && <Alert tone="success" onDismiss={() => setNotice("")}>{notice}</Alert>}
      {error && <Alert tone="danger" onDismiss={() => setError("")}>{error}</Alert>}

      <FilterPanel
        title="Filter requests"
        columns={4}
        activeCount={activeFilterCount}
        onClear={clearFilters}
      >
        <FormField id="leave-employee" label="Employee" hint="Searches as you type.">
          <TextInput
            id="leave-employee"
            aria-describedby={fieldDescribedBy("leave-employee", { hint: true })}
            type="search"
            value={employeeFilter}
            onChange={(event) => setEmployeeFilter(event.target.value)}
            placeholder="Search employee name"
          />
        </FormField>

        <FormField id="leave-type" label="Leave type">
          <SelectInput
            id="leave-type"
            value={typeFilter}
            onChange={(event) => setTypeFilter(event.target.value)}
          >
            <option value="">All types</option>
            {typeOptions.map((option) => (
              <option key={option} value={option}>
                {leaveTypeMeta(option).label}
              </option>
            ))}
          </SelectInput>
        </FormField>

        <FormField id="leave-range-start" label="From">
          <TextInput
            id="leave-range-start"
            type="date"
            value={rangeStart}
            onChange={(event) => setRangeStart(event.target.value)}
          />
        </FormField>

        <FormField
          id="leave-range-end"
          label="To"
          hint="Matches any leave overlapping this window."
        >
          <TextInput
            id="leave-range-end"
            aria-describedby={fieldDescribedBy("leave-range-end", { hint: true })}
            type="date"
            value={rangeEnd}
            onChange={(event) => setRangeEnd(event.target.value)}
          />
        </FormField>
      </FilterPanel>

      <section className="space-y-4">
        <Tabs
          tabs={tabs}
          active={activeTab}
          onChange={(id) => setActiveTab(id as TabId)}
        />

        <div
          role="tabpanel"
          id={`panel-${activeTab}`}
          aria-labelledby={`tab-${activeTab}`}
          className="space-y-3"
        >
          <DataTable
            headers={tableHeaders}
            caption={`${tabs.find((tab) => tab.id === activeTab)?.label} leave requests`}
            minWidthClass="min-w-200"
            isLoading={isLoading}
            loadingLabel="Loading leave requests"
            isEmpty={pageLeaves.length === 0}
            emptyState={emptyForTab}
            mobileCards={pageLeaves.map((leave) => (
              <RecordCard
                key={leave.id}
                leading={<Avatar name={leave.employeeName ?? "Employee"} size="md" />}
                title={leave.employeeName ?? "Unknown employee"}
                subtitle={formatDateRange(leave.startDate, leave.endDate)}
                badge={<StatusBadge {...leaveStatusMeta(leave.status)} />}
                meta={[
                  { label: "Type", value: leaveTypeMeta(leave.leaveType).label },
                  { label: "Duration", value: formatLeaveDuration(leave) },
                ]}
                actions={actionFor(leave)}
              />
            ))}
          >
            {pageLeaves.map((leave) => (
              <tr key={leave.id} className="transition-colors hover:bg-surface-muted">
                <td className="px-3 py-3">
                  <div className="flex items-center gap-3">
                    <Avatar name={leave.employeeName ?? "Employee"} size="sm" />
                    <div className="min-w-0 max-w-44">
                      <p className="truncate font-medium text-fg" title={leave.employeeName}>
                        {leave.employeeName ?? "—"}
                      </p>
                      <p className="mt-0.5 truncate text-xs text-fg-subtle">
                        {leave.departmentName ?? "No department"}
                      </p>
                    </div>
                  </div>
                </td>

                <td className="px-3 py-3">
                  <StatusBadge {...leaveTypeMeta(leave.leaveType)} />
                </td>

                <td className="whitespace-nowrap px-3 py-3 text-fg">
                  {formatDateRange(leave.startDate, leave.endDate)}
                </td>

                <td className="whitespace-nowrap px-3 py-3 text-fg-muted">
                  {formatLeaveDuration(leave)}
                </td>

                <td className="px-3 py-3">
                  <StatusBadge {...leaveStatusMeta(leave.status)} />
                </td>

                <td className="whitespace-nowrap px-3 py-3 text-fg-muted">
                  {formatDate(leave.createdAt)}
                </td>

                <td className="px-2 py-3 text-right">{actionFor(leave)}</td>
              </tr>
            ))}
          </DataTable>

          <Pagination
            page={safePage}
            pageSize={PAGE_SIZE}
            totalItems={tabLeaves.length}
            onPageChange={setPage}
            className="rounded-card border border-line bg-surface shadow-card"
          />
        </div>
      </section>

      {/* Balances are a separate job from review - adjusting what someone is
          entitled to rather than deciding one request - so they sit below the
          queue instead of above it, where they used to push every request
          down the page behind an empty "Select an employee" box. */}
      <EmployeeEntitlementPanel employees={employees} directoryFailed={directoryFailed} />

      <Modal
        isOpen={reviewLeave !== null}
        onClose={closeReview}
        title={reviewLeave?.status === "pending" ? "Review leave request" : "Leave request"}
        description={
          reviewLeave?.status === "pending"
            ? "Your comment is saved with the decision and is visible to the employee."
            : undefined
        }
        size="lg"
        isDismissDisabled={pendingDecision !== null}
      >
        {reviewLeave && (
          <div className="mt-5 space-y-5">
            <div className="flex items-center gap-3 rounded-xl bg-surface-muted p-4">
              <Avatar name={reviewLeave.employeeName ?? "Employee"} size="lg" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold text-fg">
                  {reviewLeave.employeeName ?? "Unknown employee"}
                </p>
                <p className="truncate text-sm text-fg-muted">
                  {reviewLeave.departmentName ?? "No department"}
                </p>
              </div>
              <StatusBadge {...leaveStatusMeta(reviewLeave.status)} />
            </div>

            <DescriptionList
              items={[
                {
                  label: "Leave type",
                  value: <StatusBadge {...leaveTypeMeta(reviewLeave.leaveType)} />,
                },
                { label: "Duration", value: formatLeaveDuration(reviewLeave) },
                {
                  label: "Dates",
                  value: formatDateRange(reviewLeave.startDate, reviewLeave.endDate),
                },
                { label: "Applied", value: formatDateTime(reviewLeave.createdAt) },
                { label: "Reason", value: reviewLeave.reason, wide: true },
                ...(reviewLeave.status !== "pending"
                  ? [
                      { label: "Reviewed", value: reviewLeave.reviewedAt ? formatDateTime(reviewLeave.reviewedAt) : null },
                      { label: "Admin comment", value: reviewLeave.adminComment, wide: true },
                    ]
                  : []),
              ]}
            />

            {reviewLeave.status === "pending" ? (
              <>
                <FormField id="admin-comment" label="Comment for the employee">
                  <TextArea
                    id="admin-comment"
                    rows={3}
                    value={adminComment}
                    onChange={(event) => setAdminComment(event.target.value)}
                    placeholder="Optional"
                    disabled={pendingDecision !== null}
                  />
                </FormField>

                <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                  <SecondaryButton onClick={closeReview} disabled={pendingDecision !== null}>
                    Cancel
                  </SecondaryButton>
                  <Button
                    variant="danger"
                    icon={CircleX}
                    onClick={() => void decide("rejected")}
                    isLoading={pendingDecision === "rejected"}
                    loadingLabel="Rejecting..."
                    disabled={pendingDecision === "approved"}
                  >
                    Reject
                  </Button>
                  <Button
                    icon={CircleCheck}
                    onClick={() => void decide("approved")}
                    isLoading={pendingDecision === "approved"}
                    loadingLabel="Approving..."
                    disabled={pendingDecision === "rejected"}
                  >
                    Approve
                  </Button>
                </div>
              </>
            ) : (
              <div className="flex justify-end">
                <SecondaryButton onClick={closeReview}>Close</SecondaryButton>
              </div>
            )}
          </div>
        )}
      </Modal>
    </section>
  );
}
