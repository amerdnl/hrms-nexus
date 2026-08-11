import { CalendarDays, Pencil, Plus, Search, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import {
  createManualAttendance,
  getAllAttendance,
  getAttendanceStatistics,
  updateAttendance,
} from "../../api/attendanceApi";
import { getApiErrorMessage } from "../../api/axios";
import AttendanceStatsCards from "../../components/attendance/AttendanceStatsCards";
import EditAttendanceForm from "../../components/attendance/EditAttendanceForm";
import ManualAttendanceForm from "../../components/attendance/ManualAttendanceForm";
import type {
  AttendanceFilters,
  AttendanceRecord,
  AttendanceStatistics,
  AttendanceStatus,
  ManualAttendanceInput,
  UpdateAttendanceInput,
} from "../../types/attendance";
import {
  formatDate,
  formatTime,
  getMalaysiaDate,
} from "../../utils/datetime";

const emptyStatistics: AttendanceStatistics = {
  total: 0,
  present: 0,
  late: 0,
  absent: 0,
  onLeave: 0,
};

const statusStyles: Record<AttendanceStatus, string> = {
  present: "bg-green-100 text-green-700",
  late: "bg-amber-100 text-amber-700",
  absent: "bg-red-100 text-red-700",
  on_leave: "bg-blue-100 text-blue-700",
};

function getErrorMessage(error: unknown): string {
  return getApiErrorMessage(error, "Unable to complete the request");
}

function AdminAttendancePage() {
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [statistics, setStatistics] =
    useState<AttendanceStatistics>(emptyStatistics);

  const [employeeId, setEmployeeId] = useState("");
  const [status, setStatus] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [statisticsDate, setStatisticsDate] = useState(getMalaysiaDate());
  const [activeFilters, setActiveFilters] = useState<AttendanceFilters>({});

  const [showManualForm, setShowManualForm] = useState(false);
  const [editingRecord, setEditingRecord] = useState<AttendanceRecord | null>(
    null,
  );

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const [attendanceRecords, attendanceStatistics] = await Promise.all([
        getAllAttendance(activeFilters),
        getAttendanceStatistics(statisticsDate),
      ]);

      setRecords(attendanceRecords);
      setStatistics(attendanceStatistics);
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setLoading(false);
    }
  }, [activeFilters, statisticsDate]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  function applyFilters() {
    const filters: AttendanceFilters = {};

    if (employeeId) {
      const parsedEmployeeId = Number(employeeId);

      if (!Number.isInteger(parsedEmployeeId) || parsedEmployeeId <= 0) {
        setError("Enter a valid employee ID");
        return;
      }

      filters.employeeId = parsedEmployeeId;
    }

    if (status) {
      filters.status = status as AttendanceStatus;
    }

    if (startDate) {
      filters.startDate = startDate;
    }

    if (endDate) {
      filters.endDate = endDate;
    }

    if (startDate && endDate && endDate < startDate) {
      setError("End date cannot be earlier than start date");
      return;
    }

    setError("");
    setActiveFilters(filters);
  }

  function clearFilters() {
    setEmployeeId("");
    setStatus("");
    setStartDate("");
    setEndDate("");
    setActiveFilters({});
  }

  async function handleManualSubmit(input: ManualAttendanceInput) {
    setSubmitting(true);
    setError("");
    setMessage("");

    try {
      await createManualAttendance(input);
      setShowManualForm(false);
      setMessage("Manual attendance created successfully");
      await loadData();
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleUpdate(
    attendanceId: number,
    input: UpdateAttendanceInput,
  ) {
    setSubmitting(true);
    setError("");
    setMessage("");

    try {
      await updateAttendance(attendanceId, input);
      setEditingRecord(null);
      setMessage("Attendance corrected successfully");
      await loadData();
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            Attendance Management
          </h1>

          <p className="mt-1 text-sm text-slate-600">
            Monitor, create and correct employee attendance.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowManualForm(true)}
          className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700"
        >
          <Plus size={18} />
          Add manual attendance
        </button>
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

      <div>
        <label className="mb-2 block text-sm font-medium text-slate-700">
          Statistics date
        </label>

        <input
          type="date"
          value={statisticsDate}
          onChange={(event) => setStatisticsDate(event.target.value)}
          className="rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-500"
        />
      </div>

      <AttendanceStatsCards statistics={statistics} loading={loading} />

      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-2">
          <Search size={19} className="text-blue-600" />
          <h2 className="font-semibold text-slate-900">Filter records</h2>
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <label className="text-sm text-slate-600">
            Employee ID
            <input
              type="number"
              min="1"
              value={employeeId}
              onChange={(event) => setEmployeeId(event.target.value)}
              className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2.5 outline-none focus:border-blue-500"
              placeholder="Example: 15"
            />
          </label>

          <label className="text-sm text-slate-600">
            Status
            <select
              value={status}
              onChange={(event) => setStatus(event.target.value)}
              className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2.5 outline-none focus:border-blue-500"
            >
              <option value="">All statuses</option>
              <option value="present">Present</option>
              <option value="late">Late</option>
              <option value="absent">Absent</option>
              <option value="on_leave">On leave</option>
            </select>
          </label>

          <label className="text-sm text-slate-600">
            Start date
            <input
              type="date"
              value={startDate}
              onChange={(event) => setStartDate(event.target.value)}
              className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2.5 outline-none focus:border-blue-500"
            />
          </label>

          <label className="text-sm text-slate-600">
            End date
            <input
              type="date"
              value={endDate}
              onChange={(event) => setEndDate(event.target.value)}
              className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2.5 outline-none focus:border-blue-500"
            />
          </label>
        </div>

        <div className="mt-4 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={applyFilters}
            className="flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white"
          >
            <Search size={17} />
            Apply filters
          </button>

          <button
            type="button"
            onClick={clearFilters}
            className="flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700"
          >
            <X size={17} />
            Clear
          </button>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center gap-2 border-b border-slate-200 p-5">
          <CalendarDays size={20} className="text-blue-600" />
          <h2 className="font-semibold text-slate-900">Attendance records</h2>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-225 text-left text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="px-5 py-3">Employee ID</th>
                <th className="px-5 py-3">Date</th>
                <th className="px-5 py-3">Check-in</th>
                <th className="px-5 py-3">Check-out</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3">Source</th>
                <th className="px-5 py-3">Note</th>
                <th className="px-5 py-3">Action</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td
                    colSpan={8}
                    className="px-5 py-10 text-center text-slate-500"
                  >
                    Loading attendance records...
                  </td>
                </tr>
              ) : records.length === 0 ? (
                <tr>
                  <td
                    colSpan={8}
                    className="px-5 py-10 text-center text-slate-500"
                  >
                    No attendance records found.
                  </td>
                </tr>
              ) : (
                records.map((record) => (
                  <tr key={record.id}>
                    <td className="px-5 py-4 font-medium text-slate-900">
                      {record.employeeId}
                    </td>

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
                        className={`rounded-full px-2.5 py-1 text-xs font-medium capitalize ${statusStyles[record.status]}`}
                      >
                        {record.status.replace("_", " ")}
                      </span>
                    </td>

                    <td className="px-5 py-4">
                      {record.isManual ? "Manual" : "Employee"}
                    </td>

                    <td className="max-w-60 truncate px-5 py-4 text-slate-600">
                      {record.adminNote ?? "—"}
                    </td>

                    <td className="px-5 py-4">
                      <button
                        type="button"
                        onClick={() => setEditingRecord(record)}
                        className="flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
                      >
                        <Pencil size={15} />
                        Correct
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showManualForm && (
        <ManualAttendanceForm
          submitting={submitting}
          onSubmit={handleManualSubmit}
          onCancel={() => setShowManualForm(false)}
        />
      )}

      {editingRecord && (
        <EditAttendanceForm
          record={editingRecord}
          submitting={submitting}
          onSubmit={handleUpdate}
          onCancel={() => setEditingRecord(null)}
        />
      )}
    </section>
  );
}

export default AdminAttendancePage;
