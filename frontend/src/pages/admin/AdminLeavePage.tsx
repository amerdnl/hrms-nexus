import { useEffect, useState } from "react";
import { getAllLeaveRequests, updateLeaveStatus } from "../../api/leaveApi";
import { getApiErrorMessage } from "../../api/axios";
import type { LeaveRequest } from "../../types/leave";

export default function AdminLeavePage() {
  const [leaves, setLeaves] = useState<LeaveRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [employeeFilter, setEmployeeFilter] = useState("");
  const [dateFilter, setDateFilter] = useState("");
  const [selectedLeave, setSelectedLeave] = useState<LeaveRequest | null>(null);
  const [decisionStatus, setDecisionStatus] = useState<
    "approved" | "rejected" | null
  >(null);
  const [adminComment, setAdminComment] = useState("");

  useEffect(() => {
    async function loadLeaves() {
      try {
        const data = await getAllLeaveRequests({
          status: statusFilter || undefined,
          employee: employeeFilter || undefined,
          date: dateFilter || undefined,
        });
        setLeaves(data);
      } catch (error) {
        setError(getApiErrorMessage(error, "Unable to load leave requests."));
      } finally {
        setIsLoading(false);
      }
    }

    void loadLeaves();
  }, [statusFilter, employeeFilter, dateFilter]);

  function openDecision(leave: LeaveRequest, status: "approved" | "rejected") {
    setSelectedLeave(leave);
    setDecisionStatus(status);
    setAdminComment("");
  }

  async function confirmDecision() {
    if (!selectedLeave || !decisionStatus) {
      return;
    }

    try {
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
    } catch (error) {
      setError(getApiErrorMessage(error, "Unable to update leave request."));
    }
  }

  return (
    <section className="mx-auto max-w-7xl">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-slate-900">
          Leave Management
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          Review and manage employee leave requests.
        </p>
      </div>

      {error && (
        <div className="mb-4 rounded-lg bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="mb-6 grid gap-4 rounded-xl bg-white p-4 shadow-sm md:grid-cols-3">
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">
            Status
          </label>

          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="">All</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
          </select>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">
            Employee
          </label>

          <input
            type="text"
            value={employeeFilter}
            onChange={(event) => setEmployeeFilter(event.target.value)}
            placeholder="Search employee name"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">
            Date
          </label>

          <input
            type="date"
            value={dateFilter}
            onChange={(event) => setDateFilter(event.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
      </div>

      <div className="overflow-hidden rounded-xl bg-white shadow-sm">
        {isLoading ? (
          <p className="p-6 text-sm text-slate-500">
            Loading leave requests...
          </p>
        ) : leaves.length === 0 ? (
          <p className="p-6 text-sm text-slate-500">No leave requests found.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-600">
                    Employee
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-600">
                    Department
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-600">
                    Type
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-600">
                    Dates
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-600">
                    Reason
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-600">
                    Status
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-slate-600">
                    Actions
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100">
                {leaves.map((leave) => (
                  <tr key={leave.id}>
                    <td className="px-4 py-4 text-sm text-slate-900">
                      {leave.employeeName ?? "-"}
                    </td>

                    <td className="px-4 py-4 text-sm text-slate-600">
                      {leave.departmentName ?? "-"}
                    </td>

                    <td className="px-4 py-4 text-sm capitalize text-slate-600">
                      {leave.leaveType}
                    </td>

                    <td className="px-4 py-4 text-sm text-slate-600">
                      {leave.startDate.slice(0, 10)}
                      {" → "}
                      {leave.endDate.slice(0, 10)}
                    </td>

                    <td className="max-w-xs px-4 py-4 text-sm text-slate-600">
                      {leave.reason}
                    </td>

                    <td className="px-4 py-4 text-sm capitalize text-slate-600">
                      {leave.status}
                    </td>

                    <td className="px-4 py-4">
                      {leave.status === "pending" ? (
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => openDecision(leave, "approved")}
                            className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700"
                          >
                            Approve
                          </button>

                          <button
                            type="button"
                            onClick={() => openDecision(leave, "rejected")}
                            className="rounded-lg bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700"
                          >
                            Reject
                          </button>
                        </div>
                      ) : (
                        <span className="text-sm text-slate-500">Reviewed</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {selectedLeave && decisionStatus && (
        <div className="mt-6 rounded-xl bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">
            {decisionStatus === "approved" ? "Approve" : "Reject"} Leave Request
          </h2>

          <div className="mt-4 space-y-2 text-sm text-slate-600">
            <p>
              <span className="font-medium text-slate-900">Employee:</span>{" "}
              {selectedLeave.employeeName ?? "-"}
            </p>

            <p>
              <span className="font-medium text-slate-900">Leave Type:</span>{" "}
              {selectedLeave.leaveType}
            </p>

            <p>
              <span className="font-medium text-slate-900">Dates:</span>{" "}
              {selectedLeave.startDate.slice(0, 10)} →{" "}
              {selectedLeave.endDate.slice(0, 10)}
            </p>

            <p>
              <span className="font-medium text-slate-900">Reason:</span>{" "}
              {selectedLeave.reason}
            </p>
          </div>

          <div className="mt-4">
            <label className="mb-1 block text-sm font-medium text-slate-700">
              Admin Comment
            </label>

            <textarea
              value={adminComment}
              onChange={(event) => setAdminComment(event.target.value)}
              rows={3}
              placeholder="Add a comment"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>

          <div className="mt-4 flex gap-3">
            <button
              type="button"
              onClick={() => void confirmDecision()}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white"
            >
              Confirm
            </button>

            <button
              type="button"
              onClick={() => {
                setSelectedLeave(null);
                setDecisionStatus(null);
                setAdminComment("");
              }}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
