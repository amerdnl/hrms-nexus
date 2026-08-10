import { useEffect, useState, type FormEvent } from "react";
import type {
  CreateLeaveRequestInput,
  LeaveRequest,
  LeaveType,
} from "../../types/leave";
import { createLeaveRequest, getMyLeaveRequests } from "../../api/leaveApi";
import { getApiErrorMessage } from "../../api/axios";

const initialForm: CreateLeaveRequestInput = {
  leaveType: "annual",
  startDate: "",
  endDate: "",
  reason: "",
};

export default function EmployeeLeavePage() {
  const [form, setForm] = useState<CreateLeaveRequestInput>(initialForm);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [leaves, setLeaves] = useState<LeaveRequest[]>([]);
  const [isLoadingLeaves, setIsLoadingLeaves] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    async function loadLeaveHistory() {
      try {
        const data = await getMyLeaveRequests();
        setLeaves(data);
      } catch (error) {
        setError(getApiErrorMessage(error, "Unable to load leave history."));
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

      await new Promise((resolve) => setTimeout(resolve, 1500));

      const newLeave = await createLeaveRequest(form);

      setLeaves((currentLeaves) => [newLeave, ...currentLeaves]);
      setSuccess("Leave request submitted successfully.");
      setForm(initialForm);
    } catch (error) {
      setError(getApiErrorMessage(error, "Unable to submit leave request."));
    } finally {
      setIsSubmitting(false);
    }
  }

  function getStatusClasses(status: LeaveRequest["status"]) {
    if (status === "approved") {
      return "bg-emerald-100 text-emerald-700";
    }

    if (status === "rejected") {
      return "bg-red-100 text-red-700";
    }

    return "bg-amber-100 text-amber-700";
  }

  return (
    <section className="mx-auto max-w-4xl">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">My Leave</h1>

        <p className="mt-1 text-sm text-slate-600">
          Submit a leave request and review your leave history.
        </p>
      </header>

      {/* Apply Leave Card */}
      <div className="rounded-xl bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">
          Apply for Leave
        </h2>

        <form className="mt-6 space-y-5" onSubmit={handleSubmit}>
          <div>
            <label
              htmlFor="leaveType"
              className="mb-1 block text-sm font-medium text-slate-700"
            >
              Leave type
            </label>

            <select
              id="leaveType"
              value={form.leaveType}
              onChange={(event) =>
                setForm({
                  ...form,
                  leaveType: event.target.value as LeaveType,
                })
              }
              className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-blue-500"
            >
              <option value="annual">Annual leave</option>
              <option value="medical">Medical leave</option>
              <option value="emergency">Emergency leave</option>
              <option value="unpaid">Unpaid leave</option>
            </select>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label
                htmlFor="startDate"
                className="mb-1 block text-sm font-medium text-slate-700"
              >
                Start date
              </label>

              <input
                id="startDate"
                type="date"
                value={form.startDate}
                onChange={(event) =>
                  setForm({
                    ...form,
                    startDate: event.target.value,
                  })
                }
                className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label
                htmlFor="endDate"
                className="mb-1 block text-sm font-medium text-slate-700"
              >
                End date
              </label>

              <input
                id="endDate"
                type="date"
                value={form.endDate}
                onChange={(event) =>
                  setForm({
                    ...form,
                    endDate: event.target.value,
                  })
                }
                className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-blue-500"
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="reason"
              className="mb-1 block text-sm font-medium text-slate-700"
            >
              Reason
            </label>

            <textarea
              id="reason"
              rows={5}
              value={form.reason}
              onChange={(event) =>
                setForm({
                  ...form,
                  reason: event.target.value,
                })
              }
              placeholder="Explain the reason for your leave request"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-blue-500"
            />
          </div>

          {error && (
            <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
              {error}
            </p>
          )}

          {success && (
            <p className="rounded-lg bg-green-50 p-3 text-sm text-green-700">
              {success}
            </p>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="rounded-lg bg-blue-600 px-4 py-2 font-medium text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSubmitting ? "Submitting..." : "Submit request"}
          </button>
        </form>
      </div>

      {/* Leave History Card */}
      <div className="mt-6 rounded-xl bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Leave History</h2>

        {isLoadingLeaves ? (
          <p className="mt-4 text-sm text-slate-500">
            Loading leave history...
          </p>
        ) : leaves.length === 0 ? (
          <p className="mt-4 text-sm text-slate-500">
            No leave requests found.
          </p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 text-slate-600">
                <tr>
                  <th className="px-3 py-3">Leave Type</th>
                  <th className="px-3 py-3">Start Date</th>
                  <th className="px-3 py-3">End Date</th>
                  <th>Reason</th>
                  <th className="px-3 py-3">Status</th>
                  <th className="px-3 py-3">Admin Comment</th>
                  <th className="px-3 py-3">Submitted</th>
                </tr>
              </thead>

              <tbody>
                {leaves.map((leave) => (
                  <tr key={leave.id} className="border-b border-slate-100">
                    <td className="px-3 py-3 capitalize">{leave.leaveType}</td>

                    <td className="px-3 py-3">
                      {new Date(leave.startDate).toLocaleDateString()}
                    </td>

                    <td className="px-3 py-3">
                      {new Date(leave.endDate).toLocaleDateString()}
                    </td>

                    <td>{leave.reason}</td>

                    <td className="px-4 py-4 text-sm">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium capitalize ${getStatusClasses(
                          leave.status,
                        )}`}
                      >
                        {leave.status}
                      </span>
                    </td>

                    <td className="px-3 py-3">{leave.adminComment ?? "-"}</td>

                    <td className="px-3 py-3">
                      {new Date(leave.createdAt).toLocaleDateString()}
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
