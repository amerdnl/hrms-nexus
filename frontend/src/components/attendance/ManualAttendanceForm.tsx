import { useState, type FormEvent } from "react";
import type {
  AttendanceStatus,
  ManualAttendanceInput,
} from "../../types/attendance";

type ManualAttendanceFormProps = {
  submitting: boolean;
  onSubmit: (input: ManualAttendanceInput) => Promise<void>;
  onCancel: () => void;
};

function ManualAttendanceForm({
  submitting,
  onSubmit,
  onCancel,
}: ManualAttendanceFormProps) {
  const [employeeId, setEmployeeId] = useState("");
  const [attendanceDate, setAttendanceDate] = useState("");
  const [checkInTime, setCheckInTime] = useState("");
  const [checkOutTime, setCheckOutTime] = useState("");
  const [status, setStatus] = useState<AttendanceStatus>("present");
  const [adminNote, setAdminNote] = useState("");
  const [formError, setFormError] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError("");

    const parsedEmployeeId = Number(employeeId);

    if (!Number.isInteger(parsedEmployeeId) || parsedEmployeeId <= 0) {
      setFormError("Enter a valid employee ID");
      return;
    }

    if (!attendanceDate) {
      setFormError("Select an attendance date");
      return;
    }

    if (checkInTime && checkOutTime && checkOutTime < checkInTime) {
      setFormError("Check-out time cannot be earlier than check-in time");
      return;
    }

    await onSubmit({
      employeeId: parsedEmployeeId,
      attendanceDate,
      checkInTime: checkInTime || null,
      checkOutTime: checkOutTime || null,
      status,
      adminNote: adminNote.trim() || null,
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 px-4">
      <form
        onSubmit={handleSubmit}
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 shadow-xl"
      >
        <div>
          <h2 className="text-xl font-bold text-slate-900">
            Add Manual Attendance
          </h2>

          <p className="mt-1 text-sm text-slate-500">
            Create a record when an employee cannot record attendance.
          </p>
        </div>

        {formError && (
          <div className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
            {formError}
          </div>
        )}

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-medium text-slate-700">
            Employee ID
            <input
              type="number"
              min="1"
              value={employeeId}
              onChange={(event) => setEmployeeId(event.target.value)}
              className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 outline-none focus:border-blue-500"
              required
            />
          </label>

          <label className="text-sm font-medium text-slate-700">
            Attendance date
            <input
              type="date"
              value={attendanceDate}
              onChange={(event) => setAttendanceDate(event.target.value)}
              className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 outline-none focus:border-blue-500"
              required
            />
          </label>

          <label className="text-sm font-medium text-slate-700">
            Check-in time
            <input
              type="time"
              value={checkInTime}
              onChange={(event) => setCheckInTime(event.target.value)}
              className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 outline-none focus:border-blue-500"
            />
          </label>

          <label className="text-sm font-medium text-slate-700">
            Check-out time
            <input
              type="time"
              value={checkOutTime}
              onChange={(event) => setCheckOutTime(event.target.value)}
              className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 outline-none focus:border-blue-500"
            />
          </label>

          <label className="text-sm font-medium text-slate-700">
            Status
            <select
              value={status}
              onChange={(event) =>
                setStatus(event.target.value as AttendanceStatus)
              }
              className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 outline-none focus:border-blue-500"
            >
              <option value="present">Present</option>
              <option value="late">Late</option>
              <option value="absent">Absent</option>
              <option value="on_leave">On leave</option>
            </select>
          </label>

          <label className="text-sm font-medium text-slate-700 sm:col-span-2">
            Admin note
            <textarea
              value={adminNote}
              onChange={(event) => setAdminNote(event.target.value)}
              rows={3}
              className="mt-1.5 w-full resize-none rounded-lg border border-slate-300 px-3 py-2.5 outline-none focus:border-blue-500"
              placeholder="Explain why this record was entered manually"
            />
          </label>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 disabled:opacity-50"
          >
            Cancel
          </button>

          <button
            type="submit"
            disabled={submitting}
            className="rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {submitting ? "Saving..." : "Save attendance"}
          </button>
        </div>
      </form>
    </div>
  );
}

export default ManualAttendanceForm;
