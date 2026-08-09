import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getEmployeeDashboard } from "../../api/dashboardApi";
import { getApiErrorMessage } from "../../api/axios";
import type { EmployeeDashboardData } from "../../types/dashboard";

export default function EmployeeDashboardPage() {
  const [dashboard, setDashboard] = useState<EmployeeDashboardData | null>(
    null,
  );
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadDashboard() {
      try {
        const data = await getEmployeeDashboard();
        setDashboard(data);
      } catch (error) {
        setError(
          getApiErrorMessage(error, "Unable to load employee dashboard."),
        );
      } finally {
        setIsLoading(false);
      }
    }

    void loadDashboard();
  }, []);

  if (isLoading) {
    return <p className="text-sm text-slate-500">Loading dashboard...</p>;
  }

  if (error) {
    return (
      <div className="rounded-lg bg-red-50 p-4 text-sm text-red-700">
        {error}
      </div>
    );
  }

  if (!dashboard) {
    return null;
  }

  return (
    <section className="mx-auto max-w-7xl">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-slate-900">
          Welcome, {dashboard.employee.fullName}
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          {dashboard.employee.jobTitle ?? "Employee"} ·{" "}
          {dashboard.employee.departmentName ?? "No department"}
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-xl bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Today's Attendance</p>

          <p className="mt-2 text-xl font-semibold capitalize text-slate-900">
            {dashboard.todayAttendance?.status ?? "Not recorded"}
          </p>

          <div className="mt-3 text-sm text-slate-600">
            <p>Check in: {dashboard.todayAttendance?.checkInTime ?? "-"}</p>

            <p>Check out: {dashboard.todayAttendance?.checkOutTime ?? "-"}</p>
          </div>
        </div>

        <div className="rounded-xl bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Pending Leave Requests</p>

          <p className="mt-2 text-3xl font-semibold text-slate-900">
            {dashboard.pendingLeaves}
          </p>

          <Link
            to="/employee/leave"
            className="mt-4 inline-block text-sm font-medium text-blue-600 hover:text-blue-700"
          >
            View leave
          </Link>
        </div>

        <div className="rounded-xl bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Quick Links</p>

          <div className="mt-3 flex flex-col gap-2 text-sm">
            <Link
              to="/employee/attendance"
              className="font-medium text-blue-600 hover:text-blue-700"
            >
              Attendance
            </Link>

            <Link
              to="/employee/leave"
              className="font-medium text-blue-600 hover:text-blue-700"
            >
              Apply Leave
            </Link>

            <Link
              to="/employee/profile"
              className="font-medium text-blue-600 hover:text-blue-700"
            >
              My Profile
            </Link>
          </div>
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">
            Recent Attendance
          </h2>

          {dashboard.recentAttendance.length === 0 ? (
            <p className="mt-4 text-sm text-slate-500">
              No attendance records found.
            </p>
          ) : (
            <div className="mt-4 space-y-3">
              {dashboard.recentAttendance.map((attendance) => (
                <div
                  key={attendance.id}
                  className="flex items-center justify-between border-b border-slate-100 pb-3"
                >
                  <div>
                    <p className="text-sm font-medium text-slate-900">
                      {attendance.attendanceDate.slice(0, 10)}
                    </p>

                    <p className="text-xs text-slate-500">
                      {attendance.checkInTime ?? "-"} →{" "}
                      {attendance.checkOutTime ?? "-"}
                    </p>
                  </div>

                  <span className="text-sm capitalize text-slate-600">
                    {attendance.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-xl bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">
            Recent Leave Requests
          </h2>

          {dashboard.recentLeaves.length === 0 ? (
            <p className="mt-4 text-sm text-slate-500">
              No leave requests found.
            </p>
          ) : (
            <div className="mt-4 space-y-3">
              {dashboard.recentLeaves.map((leave) => (
                <div key={leave.id} className="border-b border-slate-100 pb-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium capitalize text-slate-900">
                      {leave.leaveType}
                    </p>

                    <span className="text-sm capitalize text-slate-600">
                      {leave.status}
                    </span>
                  </div>

                  <p className="mt-1 text-xs text-slate-500">
                    {leave.startDate.slice(0, 10)} →{" "}
                    {leave.endDate.slice(0, 10)}
                  </p>

                  {leave.adminComment && (
                    <p className="mt-1 text-xs text-slate-500">
                      Admin: {leave.adminComment}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
