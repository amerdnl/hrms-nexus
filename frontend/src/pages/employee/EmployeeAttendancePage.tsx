import axios from "axios";
import { CalendarDays, CheckCircle2, Clock, LogIn, LogOut } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import {
  checkIn,
  checkOut,
  getMyAttendanceHistory,
  getTodayAttendance,
} from "../../api/attendanceApi";
import type {
  AttendanceRecord,
  AttendanceStatus,
} from "../../types/attendance";

const statusStyles: Record<AttendanceStatus, string> = {
  present: "bg-green-100 text-green-700",
  late: "bg-amber-100 text-amber-700",
  absent: "bg-red-100 text-red-700",
  on_leave: "bg-blue-100 text-blue-700",
};

function getErrorMessage(error: unknown): string {
  if (axios.isAxiosError<{ message?: string }>(error)) {
    return error.response?.data?.message ?? "Unable to complete the request";
  }

  return "An unexpected error occurred";
}

function formatTime(time: string | null): string {
  if (!time) {
    return "Not recorded";
  }

  return time.slice(0, 5);
}

function formatDate(value: string): string {
  const text = String(value);
  const match = text.match(/(\d{4})-(\d{2})-(\d{2})/);

  if (!match) {
    return text || "—";
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  const displayDate = new Date(year, month - 1, day);

  return new Intl.DateTimeFormat("en-MY", {
    year: "numeric",
    month: "short",
    day: "2-digit",
  }).format(displayDate);
}

function EmployeeAttendancePage() {
  const [today, setToday] = useState<AttendanceRecord | null>(null);
  const [history, setHistory] = useState<AttendanceRecord[]>([]);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const loadAttendance = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const [todayRecord, historyRecords] = await Promise.all([
        getTodayAttendance(),
        getMyAttendanceHistory(startDate || undefined, endDate || undefined),
      ]);

      setToday(todayRecord);
      setHistory(historyRecords);
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate]);

  useEffect(() => {
    void loadAttendance();
  }, [loadAttendance]);

  async function handleCheckIn() {
    setActionLoading(true);
    setMessage("");
    setError("");

    try {
      const attendance = await checkIn();
      setToday(attendance);
      setMessage("Check-in recorded successfully");
      await loadAttendance();
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setActionLoading(false);
    }
  }

  async function handleCheckOut() {
    setActionLoading(true);
    setMessage("");
    setError("");

    try {
      const attendance = await checkOut();
      setToday(attendance);
      setMessage("Check-out recorded successfully");
      await loadAttendance();
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setActionLoading(false);
    }
  }

  function clearFilters() {
    setStartDate("");
    setEndDate("");
  }

  const hasCheckedIn = Boolean(today?.checkInTime);
  const hasCheckedOut = Boolean(today?.checkOutTime);

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">My Attendance</h1>
        <p className="mt-1 text-sm text-slate-600">
          Record your daily check-in and check-out.
        </p>
      </div>

      {message && (
        <div className="rounded-lg bg-green-50 px-4 py-3 text-sm text-green-700">
          {message}
        </div>
      )}

      {error && (
        <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3 text-slate-500">
            <LogIn size={20} />
            <span className="text-sm">Check-in</span>
          </div>

          <p className="mt-3 text-2xl font-semibold text-slate-900">
            {formatTime(today?.checkInTime ?? null)}
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3 text-slate-500">
            <LogOut size={20} />
            <span className="text-sm">Check-out</span>
          </div>

          <p className="mt-3 text-2xl font-semibold text-slate-900">
            {formatTime(today?.checkOutTime ?? null)}
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3 text-slate-500">
            <CheckCircle2 size={20} />
            <span className="text-sm">Status</span>
          </div>

          <div className="mt-3">
            {today ? (
              <span
                className={`rounded-full px-3 py-1 text-sm font-medium ${statusStyles[today.status]}`}
              >
                {today.status.replace("_", " ")}
              </span>
            ) : (
              <span className="text-sm text-slate-500">Not checked in</span>
            )}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-3 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <button
          type="button"
          onClick={handleCheckIn}
          disabled={loading || actionLoading || hasCheckedIn}
          className="flex items-center gap-2 rounded-lg bg-green-600 px-5 py-3 text-sm font-medium text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <LogIn size={18} />
          Check in
        </button>

        <button
          type="button"
          onClick={handleCheckOut}
          disabled={loading || actionLoading || !hasCheckedIn || hasCheckedOut}
          className="flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-3 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <LogOut size={18} />
          Check out
        </button>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 p-5">
          <div className="flex items-center gap-2">
            <CalendarDays size={20} className="text-blue-600" />

            <h2 className="font-semibold text-slate-900">Attendance History</h2>
          </div>

          <div className="mt-4 flex flex-wrap items-end gap-3">
            <label className="text-sm text-slate-600">
              Start date
              <input
                type="date"
                value={startDate}
                onChange={(event) => setStartDate(event.target.value)}
                className="mt-1 block rounded-lg border border-slate-300 px-3 py-2"
              />
            </label>

            <label className="text-sm text-slate-600">
              End date
              <input
                type="date"
                value={endDate}
                onChange={(event) => setEndDate(event.target.value)}
                className="mt-1 block rounded-lg border border-slate-300 px-3 py-2"
              />
            </label>

            <button
              type="button"
              onClick={loadAttendance}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm text-white"
            >
              Apply
            </button>

            <button
              type="button"
              onClick={clearFilters}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700"
            >
              Clear
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-175 text-left text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="px-5 py-3">Date</th>
                <th className="px-5 py-3">Check-in</th>
                <th className="px-5 py-3">Check-out</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3">Note</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td
                    colSpan={5}
                    className="px-5 py-8 text-center text-slate-500"
                  >
                    Loading attendance...
                  </td>
                </tr>
              ) : history.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    className="px-5 py-8 text-center text-slate-500"
                  >
                    No attendance records found.
                  </td>
                </tr>
              ) : (
                history.map((record) => (
                  <tr key={record.id}>
                    <td className="px-5 py-4">
                      {formatDate(record.attendanceDate)}
                    </td>

                    <td className="px-5 py-4">
                      {formatTime(record.checkInTime)}
                    </td>

                    <td className="px-5 py-4">
                      {formatTime(record.checkOutTime)}
                    </td>

                    <td className="px-5 py-4">
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-medium ${statusStyles[record.status]}`}
                      >
                        {record.status.replace("_", " ")}
                      </span>
                    </td>

                    <td className="px-5 py-4 text-slate-600">
                      {record.adminNote ?? "—"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex items-center gap-2 text-xs text-slate-500">
        <Clock size={15} />
        Attendance uses Malaysia time.
      </div>
    </section>
  );
}

export default EmployeeAttendancePage;
