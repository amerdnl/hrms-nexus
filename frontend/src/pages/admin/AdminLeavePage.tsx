import { CalendarDays, CircleCheck, CircleX, Eye } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { getApiErrorMessage } from "../../api/axios";
import { getAllLeaveRequests, updateLeaveStatus } from "../../api/leaveApi";
import Alert from "../../components/ui/Alert";
import Button from "../../components/ui/Button";
import DataTable from "../../components/ui/DataTable";
import EmptyState from "../../components/ui/EmptyState";
import FilterPanel from "../../components/ui/FilterPanel";
import FormField from "../../components/ui/FormField";
import { fieldDescribedBy } from "../../components/ui/fieldStyles";
import Modal from "../../components/ui/Modal";
import { getEmployeeLookup } from "../../api/employeeApi";
import EmployeeEntitlementPanel from "../../components/leave/EmployeeEntitlementPanel";
import PageHeader from "../../components/ui/PageHeader";
import Pagination from "../../components/ui/Pagination";
import SecondaryButton from "../../components/ui/SecondaryButton";
import SelectInput from "../../components/ui/SelectInput";
import StatusBadge from "../../components/ui/StatusBadge";
import TextArea from "../../components/ui/TextArea";
import TextInput from "../../components/ui/TextInput";
import { useDebouncedValue } from "../../hooks/useDebouncedValue";
import type { EmployeeLookupEntry } from "../../types/employee";
import type { LeaveRequest, LeaveStatus, LeaveType } from "../../types/leave";
import { formatDate, formatDateTime, toIsoDate } from "../../utils/datetime";
import { formatLeaveDaysBetween } from "../../utils/leave";
import { leaveStatusMeta, leaveTypeMeta } from "../../utils/status";

const SEARCH_DEBOUNCE_MS = 350;
const PAGE_SIZE = 25;

const statusOptions: LeaveStatus[] = ["pending", "approved", "rejected"];
const typeOptions: LeaveType[] = ["annual", "medical", "emergency", "unpaid"];

const tableHeaders = [
  "Employee",
  "Type",
  "Dates",
  "Duration",
  "Reason",
  "Status",
  "Applied on",
  "Actions",
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

  // Server-side filters: the API already implements these.
  const [statusFilter, setStatusFilter] = useState("");
  const [employeeFilter, setEmployeeFilter] = useState("");

  // Client-side filters, applied over the rows the API returned.
  const [typeFilter, setTypeFilter] = useState("");
  const [rangeStart, setRangeStart] = useState("");
  const [rangeEnd, setRangeEnd] = useState("");

  const [page, setPage] = useState(1);

  const [selectedLeave, setSelectedLeave] = useState<LeaveRequest | null>(null);

  const [decisionStatus, setDecisionStatus] = useState<
    "approved" | "rejected" | null
  >(null);

  const [isUpdatingDecision, setIsUpdatingDecision] = useState(false);

  const [adminComment, setAdminComment] = useState("");

  const [detailsLeave, setDetailsLeave] = useState<LeaveRequest | null>(null);

  // The employee filter is a server query, so it is debounced: without this
  // every keystroke fires a request against an endpoint with no pagination.
  const debouncedEmployeeFilter = useDebouncedValue(
    employeeFilter,
    SEARCH_DEBOUNCE_MS,
  );

  useEffect(() => {
    async function loadLeaves() {
      setIsLoading(true);

      try {
        const data = await getAllLeaveRequests({
          status: statusFilter || undefined,
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
  }, [statusFilter, debouncedEmployeeFilter]);

  /**
   * Type and date-range filtering, client-side.
   *
   * The range uses OVERLAP, not containment: a request counts if any part of
   * it falls inside the window. Containment would hide a two-week leave from
   * someone filtering a single week, which is the opposite of useful. This
   * also generalises what the API's single-date filter already does
   * (`$date BETWEEN start_date AND end_date`) from one day to a window.
   *
   * Comparison is lexicographic on "YYYY-MM-DD", which is exactly correct for
   * that format and avoids Date parsing entirely.
   */
  const visibleLeaves = useMemo(
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

  // Every count on the page is derived from the final filtered array, so the
  // badges can never disagree with the rows below them.
  const statusCounts = useMemo(() => {
    const counts: Record<LeaveStatus, number> = {
      pending: 0,
      approved: 0,
      rejected: 0,
      cancelled: 0,
    };

    for (const leave of visibleLeaves) {
      counts[leave.status] += 1;
    }

    return counts;
  }, [visibleLeaves]);

  useEffect(() => {
    setPage(1);
  }, [statusFilter, debouncedEmployeeFilter, typeFilter, rangeStart, rangeEnd]);

  const pageCount = Math.max(1, Math.ceil(visibleLeaves.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);

  const pageLeaves = useMemo(
    () => visibleLeaves.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE),
    [visibleLeaves, safePage],
  );

  const activeFilterCount = [
    statusFilter,
    employeeFilter,
    typeFilter,
    rangeStart,
    rangeEnd,
  ].filter(Boolean).length;

  function clearFilters() {
    setStatusFilter("");
    setEmployeeFilter("");
    setTypeFilter("");
    setRangeStart("");
    setRangeEnd("");
  }

  function openDecision(leave: LeaveRequest, status: "approved" | "rejected") {
    setSelectedLeave(leave);
    setDecisionStatus(status);
    setAdminComment("");
  }

  function closeDecision() {
    if (isUpdatingDecision) return;

    setSelectedLeave(null);
    setDecisionStatus(null);
    setAdminComment("");
  }

  async function confirmDecision() {
    if (!selectedLeave || !decisionStatus) {
      return;
    }

    try {
      setIsUpdatingDecision(true);

      const updatedLeave = await updateLeaveStatus(selectedLeave.id, {
        status: decisionStatus,
        adminComment,
      });

      setLeaves((currentLeaves) =>
        currentLeaves.map((leave) =>
          leave.id === selectedLeave.id ? updatedLeave : leave,
        ),
      );

      setSelectedLeave(null);
      setDecisionStatus(null);
      setAdminComment("");
    } catch (requestError) {
      setError(
        getApiErrorMessage(requestError, "Unable to update leave request."),
      );
    } finally {
      setIsUpdatingDecision(false);
    }
  }

  const isDecisionOpen = Boolean(selectedLeave && decisionStatus);

  return (
    <section className="mx-auto max-w-7xl space-y-6">
      <PageHeader
        title="Leave management"
        description="Review and manage employee leave requests."
      />

      {error && <Alert tone="danger">{error}</Alert>}

      <EmployeeEntitlementPanel employees={employees} directoryFailed={directoryFailed} />

      <FilterPanel
        columns={3}
        activeCount={activeFilterCount}
        onClear={clearFilters}
      >
        <FormField id="leave-status" label="Status">
          <SelectInput
            id="leave-status"
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
          >
            <option value="">All statuses</option>
            {statusOptions.map((option) => (
              <option key={option} value={option}>
                {leaveStatusMeta(option).label}
              </option>
            ))}
          </SelectInput>
        </FormField>

        <FormField
          id="leave-employee"
          label="Employee"
          hint="Searches as you type."
        >
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

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-base font-semibold text-fg">
            <CalendarDays size={18} className="text-primary" aria-hidden="true" />
            Leave requests
          </h2>

          {!isLoading && visibleLeaves.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              {statusOptions.map((option) => {
                const meta = leaveStatusMeta(option);

                return (
                  <StatusBadge
                    key={option}
                    {...meta}
                    label={`${meta.label}: ${statusCounts[option]}`}
                  />
                );
              })}

              <p className="text-sm text-fg-muted">
                <span className="font-semibold text-fg">
                  {visibleLeaves.length}
                </span>{" "}
                total
              </p>
            </div>
          )}
        </div>

        <DataTable
          headers={tableHeaders}
          caption="Leave requests matching the current filters"
          minWidthClass="min-w-275"
          isLoading={isLoading}
          loadingLabel="Loading leave requests..."
          isEmpty={pageLeaves.length === 0}
          emptyState={
            activeFilterCount > 0 ? (
              <EmptyState
                icon={CalendarDays}
                title="No requests match these filters"
                description="There are leave requests in the system, but none match the current combination."
                action={
                  <Button variant="secondary" size="sm" onClick={clearFilters}>
                    Clear all filters
                  </Button>
                }
              />
            ) : (
              <EmptyState
                icon={CalendarDays}
                title="No leave requests yet"
                description="Requests submitted by employees will appear here for review."
              />
            )
          }
        >
          {pageLeaves.map((leave) => (
            <tr key={leave.id}>
              <td className="px-5 py-4">
                <p className="font-medium text-fg">
                  {leave.employeeName ?? "—"}
                </p>
                <p className="mt-0.5 text-xs text-fg-subtle">
                  {leave.departmentName ?? "No department"}
                </p>
              </td>

              <td className="px-5 py-4">
                <StatusBadge {...leaveTypeMeta(leave.leaveType)} />
              </td>

              <td className="px-5 py-4 text-fg-muted">
                {formatDate(leave.startDate)} &rarr; {formatDate(leave.endDate)}
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

              <td className="px-5 py-4 text-fg-muted">
                {formatDateTime(leave.createdAt)}
              </td>

              <td className="px-5 py-4">
                {/* One action per row. Approve and Reject live inside the
                    details modal, so a decision is always made with the reason
                    and dates on screen rather than from a truncated row. */}
                <Button
                  variant="secondary"
                  size="sm"
                  icon={Eye}
                  onClick={() => setDetailsLeave(leave)}
                >
                  View
                </Button>
              </td>
            </tr>
          ))}
        </DataTable>

        <Pagination
          page={safePage}
          pageSize={PAGE_SIZE}
          totalItems={visibleLeaves.length}
          onPageChange={setPage}
          className="mt-3 rounded-card border border-line bg-surface shadow-card"
        />
      </section>

      <Modal
        isOpen={isDecisionOpen}
        onClose={closeDecision}
        title={
          decisionStatus === "approved"
            ? "Approve leave request"
            : "Reject leave request"
        }
        description="The comment is saved with the decision and is visible to the employee."
        icon={
          decisionStatus === "approved" ? (
            <CircleCheck size={22} />
          ) : (
            <CircleX size={22} />
          )
        }
        tone={decisionStatus === "rejected" ? "danger" : "primary"}
        size="lg"
        isDismissDisabled={isUpdatingDecision}
      >
        {selectedLeave && (
          <div className="space-y-5">
            <LeaveSummary leave={selectedLeave} />

            <FormField id="admin-comment" label="Admin comment">
              <TextArea
                id="admin-comment"
                rows={3}
                value={adminComment}
                onChange={(event) => setAdminComment(event.target.value)}
                placeholder="Add a comment"
              />
            </FormField>

            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <SecondaryButton
                onClick={closeDecision}
                disabled={isUpdatingDecision}
              >
                Cancel
              </SecondaryButton>

              <Button
                variant={decisionStatus === "rejected" ? "danger" : "primary"}
                onClick={() => void confirmDecision()}
                isLoading={isUpdatingDecision}
                loadingLabel="Updating..."
              >
                Confirm
              </Button>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        isOpen={detailsLeave !== null}
        onClose={() => setDetailsLeave(null)}
        title="Leave request details"
        icon={<Eye size={22} />}
        size="lg"
      >
        {detailsLeave && (
          <div className="space-y-5">
            <LeaveSummary leave={detailsLeave} showReason={false} />

            <dl className="grid gap-4 sm:grid-cols-2">
              <Detail label="Status">
                <StatusBadge {...leaveStatusMeta(detailsLeave.status)} />
              </Detail>

              <Detail label="Applied on">
                {formatDateTime(detailsLeave.createdAt)}
              </Detail>

              <Detail label="Reviewed on">
                {formatDateTime(detailsLeave.reviewedAt)}
              </Detail>

              <Detail label="Department">
                {detailsLeave.departmentName ?? "No department"}
              </Detail>

              <Detail label="Reason" className="sm:col-span-2">
                {detailsLeave.reason}
              </Detail>

              <Detail label="Admin comment" className="sm:col-span-2">
                {detailsLeave.adminComment ?? "—"}
              </Detail>
            </dl>

            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <SecondaryButton onClick={() => setDetailsLeave(null)}>
                Close
              </SecondaryButton>

              {detailsLeave.status === "pending" && (
                <>
                  <Button
                    icon={CircleCheck}
                    onClick={() => {
                      const leave = detailsLeave;
                      setDetailsLeave(null);
                      openDecision(leave, "approved");
                    }}
                  >
                    Approve
                  </Button>

                  <Button
                    variant="danger"
                    icon={CircleX}
                    onClick={() => {
                      const leave = detailsLeave;
                      setDetailsLeave(null);
                      openDecision(leave, "rejected");
                    }}
                  >
                    Reject
                  </Button>
                </>
              )}
            </div>
          </div>
        )}
      </Modal>
    </section>
  );
}

function LeaveSummary({
  leave,
  showReason = true,
}: {
  leave: LeaveRequest;
  showReason?: boolean;
}) {
  return (
    <div className="rounded-lg border border-line bg-surface-muted p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-semibold text-fg">{leave.employeeName ?? "—"}</p>
        <StatusBadge {...leaveTypeMeta(leave.leaveType)} />
      </div>

      <p className="mt-2 text-sm text-fg-muted">
        {formatDate(leave.startDate)} &rarr; {formatDate(leave.endDate)} ·{" "}
        {formatLeaveDaysBetween(leave.startDate, leave.endDate)}
      </p>

      {showReason && (
        <p className="mt-2 text-sm text-fg-muted">{leave.reason}</p>
      )}
    </div>
  );
}

function Detail({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={className}>
      <dt className="text-xs font-semibold uppercase tracking-wide text-fg-subtle">
        {label}
      </dt>
      <dd className="mt-1 text-sm text-fg">{children}</dd>
    </div>
  );
}
