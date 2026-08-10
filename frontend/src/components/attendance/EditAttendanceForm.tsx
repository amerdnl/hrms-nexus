import { useState, type FormEvent } from "react";
import type {
  AttendanceRecord,
  AttendanceStatus,
  UpdateAttendanceInput,
} from "../../types/attendance";

type EditAttendanceFormProps = {
  record: AttendanceRecord;
  submitting: boolean;
  onSubmit: (
    attendanceId: number,
    input: UpdateAttendanceInput,
  ) => Promise<void>;
  onCancel: () => void;
};

function EditAttendanceForm({
  record,
  submitting,
  onSubmit,
  onCancel,
}: EditAttendanceFormProps) {
  const [checkInTime, setCheckInTime] = useState(
    record.checkInTime?.slice(0, 5) ?? "",
  );
  const [checkOutTime, setCheckOutTime] = useState(
    record.checkOutTime?.slice(0, 5) ?? "",
  );
  const [status, setStatus] = useState<AttendanceStatus>(record.status);
  const [adminNote, setAdminNote] = useState(record.adminNote ?? "");
  const [formError, setFormError] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError("");

    if (checkInTime && checkOutTime && checkOutTime < checkInTime) {
      setFormError("Check-out time cannot be earlier than check-in time");
      return;
    }

    await onSubmit(record.id, {
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
        className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl bg-white p-6 shadow-xl"
      >
        <div>
          <h2 className="text-xl font-bold text-slate-900">
            Correct Attendance
          </h2>

          <p className="mt-1 text-sm text-slate-500">
            Employee ID {record.employeeId} on {record.attendanceDate}
          </p>
        </div>

        {formError && (
          <div className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
            {formError}
          </div>
        )}

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
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
              placeholder="Reason for correcting this record"
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
            {submitting ? "Saving..." : "Save correction"}
          </button>
        </div>
      </form>
    </div>
  );
}

export default EditAttendanceForm;
