import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getAdminDashboard } from "../../api/dashboardApi";
import { getApiErrorMessage } from "../../api/axios";
import type { AdminDashboardData } from "../../types/dashboard";

export default function AdminDashboardPage() {
  const [dashboard, setDashboard] = useState<AdminDashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadDashboard() {
      try {
        const data = await getAdminDashboard();
        setDashboard(data);
      } catch (error) {
        setError(getApiErrorMessage(error, "Unable to load admin dashboard."));
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
          Admin Dashboard
        </h1>

        <p className="mt-1 text-sm text-slate-600">
          Overview of employees, attendance, and leave activity.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Total Employees</p>
          <p className="mt-2 text-3xl font-semibold text-slate-900">
            {dashboard.totalEmployees}
          </p>
        </div>

        <div className="rounded-xl bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Active Employees</p>
          <p className="mt-2 text-3xl font-semibold text-slate-900">
            {dashboard.activeEmployees}
          </p>
        </div>

        <div className="rounded-xl bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Departments</p>
          <p className="mt-2 text-3xl font-semibold text-slate-900">
            {dashboard.departments}
          </p>
        </div>

        <div className="rounded-xl bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Pending Leaves</p>
          <p className="mt-2 text-3xl font-semibold text-slate-900">
            {dashboard.pendingLeaves}
          </p>

          <Link
            to="/admin/leave"
            className="mt-3 inline-block text-sm font-medium text-blue-600 hover:text-blue-700"
          >
            Review leaves
          </Link>
        </div>
      </div>

      <div className="mt-6 rounded-xl bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">
          Today's Attendance
        </h2>

        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-lg bg-slate-50 p-4">
            <p className="text-sm text-slate-500">Present</p>
            <p className="mt-1 text-2xl font-semibold text-slate-900">
              {dashboard.attendanceToday.present}
            </p>
          </div>

          <div className="rounded-lg bg-slate-50 p-4">
            <p className="text-sm text-slate-500">Late</p>
            <p className="mt-1 text-2xl font-semibold text-slate-900">
              {dashboard.attendanceToday.late}
            </p>
          </div>

          <div className="rounded-lg bg-slate-50 p-4">
            <p className="text-sm text-slate-500">Absent</p>
            <p className="mt-1 text-2xl font-semibold text-slate-900">
              {dashboard.attendanceToday.absent}
            </p>
          </div>

          <div className="rounded-lg bg-slate-50 p-4">
            <p className="text-sm text-slate-500">On Leave</p>
            <p className="mt-1 text-2xl font-semibold text-slate-900">
              {dashboard.attendanceToday.onLeave}
            </p>
          </div>
        </div>

        <Link
          to="/admin/attendance"
          className="mt-4 inline-block text-sm font-medium text-blue-600 hover:text-blue-700"
        >
          View attendance
        </Link>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="rounded-xl bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">
            Recent Employees
          </h2>

          {dashboard.recentEmployees.length === 0 ? (
            <p className="mt-4 text-sm text-slate-500">No employees found.</p>
          ) : (
            <div className="mt-4 space-y-3">
              {dashboard.recentEmployees.map((employee) => (
                <div
                  key={employee.id}
                  className="border-b border-slate-100 pb-3"
                >
                  <p className="text-sm font-medium text-slate-900">
                    {employee.fullName}
                  </p>

                  <p className="text-xs text-slate-500">
                    {employee.employeeNumber}
                    {employee.jobTitle ? ` · ${employee.jobTitle}` : ""}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

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
                  className="border-b border-slate-100 pb-3"
                >
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-slate-900">
                      {attendance.employeeName}
                    </p>

                    <span className="text-xs capitalize text-slate-500">
                      {attendance.status}
                    </span>
                  </div>

                  <p className="mt-1 text-xs text-slate-500">
                    {attendance.attendanceDate.slice(0, 10)}
                  </p>
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
                    <p className="text-sm font-medium text-slate-900">
                      {leave.employeeName ?? "-"}
                    </p>

                    <span className="text-xs capitalize text-slate-500">
                      {leave.status}
                    </span>
                  </div>

                  <p className="mt-1 text-xs capitalize text-slate-500">
                    {leave.leaveType} · {leave.startDate.slice(0, 10)} →{" "}
                    {leave.endDate.slice(0, 10)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
