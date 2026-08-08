import { useEffect, useState } from "react";
import { getAllLeaveRequests, updateLeaveStatus } from "../../api/leaveApi";
import { getApiErrorMessage } from "../../api/axios";
import type { LeaveRequest } from "../../types/leave";

export default function AdminLeavePage() {
  const [leaves, setLeaves] = useState<LeaveRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadLeaves() {
      try {
        const data = await getAllLeaveRequests();
        setLeaves(data);
      } catch (error) {
        setError(getApiErrorMessage(error, "Unable to load leave requests."));
      } finally {
        setIsLoading(false);
      }
    }

    void loadLeaves();
  }, []);

  async function handleDecision(
    leaveId: number,
    status: "approved" | "rejected",
  ) {
    const adminComment = window.prompt(
      `Add an admin comment for this ${status} decision:`,
    );

    if (adminComment === null) {
      return;
    }

    try {
      const updatedLeave = await updateLeaveStatus(leaveId, {
        status,
        adminComment,
      });

      setLeaves((currentLeaves) =>
        currentLeaves.map((leave) =>
          leave.id === leaveId ? updatedLeave : leave,
        ),
      );
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
                            onClick={() =>
                              void handleDecision(leave.id, "approved")
                            }
                            className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700"
                          >
                            Approve
                          </button>

                          <button
                            type="button"
                            onClick={() =>
                              void handleDecision(leave.id, "rejected")
                            }
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
    </section>
  );
}
