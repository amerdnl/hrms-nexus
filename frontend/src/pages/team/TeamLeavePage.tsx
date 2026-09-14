import { CalendarDays, CircleCheck, Eye } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { getApiErrorMessage } from "../../api/axios";
import { getTeamLeave } from "../../api/teamApi";
import LeaveDecisionModal from "../../components/leave/LeaveDecisionModal";
import Alert from "../../components/ui/Alert";
import Avatar from "../../components/ui/Avatar";
import Button from "../../components/ui/Button";
import DataTable from "../../components/ui/DataTable";
import EmptyState from "../../components/ui/EmptyState";
import PageHeader from "../../components/ui/PageHeader";
import RecordCard from "../../components/ui/RecordCard";
import StatusBadge from "../../components/ui/StatusBadge";
import Tabs, { type TabItem } from "../../components/ui/Tabs";
import type { LeaveStatus } from "../../types/leave";
import type { TeamLeaveRequest } from "../../types/team";
import { formatDate, formatDateRange } from "../../utils/datetime";
import { formatLeaveDuration } from "../../utils/leave";
import { leaveStatusMeta, leaveTypeMeta } from "../../utils/status";

type TabId = LeaveStatus | "all";
const TAB_ORDER: TabId[] = ["pending", "approved", "rejected", "cancelled", "all"];

const headers = [
  "Team member", "Type", "Dates", "Duration", "Status", "Applied",
  <span key="action" className="sr-only">Action</span>,
];

/**
 * Leave for the manager's direct reports, pending first.
 *
 * The server returns only current reports' requests; this page cannot ask for
 * anyone else's. Decisions go through the same endpoint HR uses, which checks
 * the reporting line again at the moment of deciding.
 */
export default function TeamLeavePage() {
  const [leaves, setLeaves] = useState<TeamLeaveRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  // A link such as a notification's "?status=pending" opens on that tab.
  const [searchParams] = useSearchParams();
  const requestedTab = searchParams.get("status") as TabId | null;
  const [activeTab, setActiveTab] = useState<TabId>(
    requestedTab && TAB_ORDER.includes(requestedTab) ? requestedTab : "pending",
  );
  const [reviewing, setReviewing] = useState<TeamLeaveRequest | null>(null);

  const load = useCallback(async () => {
    setError("");
    try {
      setLeaves(await getTeamLeave());
    } catch (requestError) {
      setLeaves([]);
      setError(getApiErrorMessage(requestError, "Your team's leave could not be loaded."));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const counts = useMemo(() => {
    const result: Record<TabId, number> = { pending: 0, approved: 0, rejected: 0, cancelled: 0, all: leaves.length };
    for (const leave of leaves) result[leave.status] += 1;
    return result;
  }, [leaves]);

  const visible = activeTab === "all" ? leaves : leaves.filter((leave) => leave.status === activeTab);

  const tabs: TabItem[] = TAB_ORDER.map((id) => ({
    id,
    label: id === "all" ? "All requests" : leaveStatusMeta(id).label,
    count: counts[id],
  }));

  const actionFor = (leave: TeamLeaveRequest) =>
    leave.status === "pending" ? (
      <Button size="sm" variant="secondary" onClick={() => setReviewing(leave)}>Review</Button>
    ) : (
      <Button
        size="sm"
        variant="ghost"
        icon={Eye}
        onClick={() => setReviewing(leave)}
        aria-label={`View ${leave.employeeName}'s request`}
        title="View request"
      />
    );

  return (
    <section className="max-w-7xl space-y-6">
      <PageHeader
        title="Team leave"
        description="Decide requests from the people who report to you, and see what you have decided."
        backTo="/team"
        backLabel="Back to my team"
      />

      {notice && <Alert tone="success" onDismiss={() => setNotice("")}>{notice}</Alert>}
      {error && <Alert tone="danger" onDismiss={() => setError("")}>{error}</Alert>}

      <Tabs tabs={tabs} active={activeTab} onChange={(id) => setActiveTab(id as TabId)} />

      <div role="tabpanel" id={`panel-${activeTab}`} aria-labelledby={`tab-${activeTab}`}>
        <DataTable
          headers={headers}
          caption={`${tabs.find((tab) => tab.id === activeTab)?.label} team leave requests`}
          minWidthClass="min-w-200"
          isLoading={isLoading}
          loadingLabel="Loading your team's leave"
          isEmpty={visible.length === 0}
          emptyState={
            activeTab === "pending" ? (
              <EmptyState icon={CircleCheck} title="Nothing awaiting your decision" description="Requests from your team appear here as they are submitted." />
            ) : (
              <EmptyState icon={CalendarDays} title="No requests here" description="Your team's requests in this state appear here." />
            )
          }
          mobileCards={visible.map((leave) => (
            <RecordCard
              key={leave.id}
              leading={<Avatar name={leave.employeeName} size="md" />}
              title={leave.employeeName}
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
          {visible.map((leave) => (
            <tr key={leave.id} className="transition-colors hover:bg-surface-muted">
              <td className="px-5 py-3">
                <div className="flex items-center gap-3">
                  <Avatar name={leave.employeeName} size="sm" />
                  <div className="min-w-0">
                    <p className="font-medium text-fg [overflow-wrap:anywhere]">{leave.employeeName}</p>
                    <p className="text-xs text-fg-subtle">{leave.employeeNumber}</p>
                  </div>
                </div>
              </td>
              <td className="px-5 py-3"><StatusBadge {...leaveTypeMeta(leave.leaveType)} /></td>
              <td className="whitespace-nowrap px-5 py-3 text-fg">{formatDateRange(leave.startDate, leave.endDate)}</td>
              <td className="whitespace-nowrap px-5 py-3 text-fg-muted">{formatLeaveDuration(leave)}</td>
              <td className="px-5 py-3"><StatusBadge {...leaveStatusMeta(leave.status)} /></td>
              <td className="whitespace-nowrap px-5 py-3 text-fg-muted">{formatDate(leave.createdAt)}</td>
              <td className="px-3 py-3 text-right">{actionFor(leave)}</td>
            </tr>
          ))}
        </DataTable>
      </div>

      <LeaveDecisionModal
        leave={reviewing}
        onClose={() => setReviewing(null)}
        onDecided={(status, leave) => {
          setReviewing(null);
          setNotice(`${leave.employeeName}'s request was ${status}.`);
          void load();
        }}
      />
    </section>
  );
}
