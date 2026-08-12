import { CalendarPlus } from "lucide-react";
import { useState, type FormEvent } from "react";
import type {
  AttendanceStatus,
  ManualAttendanceInput,
} from "../../types/attendance";
import { attendanceStatusMeta } from "../../utils/status";
import Alert from "../ui/Alert";
import FormField from "../ui/FormField";
import Modal from "../ui/Modal";
import PrimaryButton from "../ui/PrimaryButton";
import SecondaryButton from "../ui/SecondaryButton";
import SelectInput from "../ui/SelectInput";
import TextArea from "../ui/TextArea";
import TextInput from "../ui/TextInput";

type ManualAttendanceFormProps = {
  submitting: boolean;
  onSubmit: (input: ManualAttendanceInput) => Promise<void>;
  onCancel: () => void;
};

const statusOptions: AttendanceStatus[] = [
  "present",
  "late",
  "absent",
  "on_leave",
];

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
    // The parent mounts this only while open, which is what keeps the fields
    // fresh on every open without a reset effect.
    <Modal
      isOpen
      onClose={onCancel}
      title="Add manual attendance"
      description="Create a record when an employee cannot record attendance."
      icon={<CalendarPlus size={22} />}
      size="lg"
      isDismissDisabled={submitting}
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        {formError && <Alert tone="danger">{formError}</Alert>}

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField id="manual-employee-id" label="Employee ID" required>
            <TextInput
              id="manual-employee-id"
              type="number"
              min="1"
              value={employeeId}
              onChange={(event) => setEmployeeId(event.target.value)}
              required
            />
          </FormField>

          <FormField id="manual-date" label="Attendance date" required>
            <TextInput
              id="manual-date"
              type="date"
              value={attendanceDate}
              onChange={(event) => setAttendanceDate(event.target.value)}
              required
            />
          </FormField>

          <FormField id="manual-check-in" label="Check-in time">
            <TextInput
              id="manual-check-in"
              type="time"
              value={checkInTime}
              onChange={(event) => setCheckInTime(event.target.value)}
            />
          </FormField>

          <FormField id="manual-check-out" label="Check-out time">
            <TextInput
              id="manual-check-out"
              type="time"
              value={checkOutTime}
              onChange={(event) => setCheckOutTime(event.target.value)}
            />
          </FormField>

          <FormField id="manual-status" label="Status">
            <SelectInput
              id="manual-status"
              value={status}
              onChange={(event) =>
                setStatus(event.target.value as AttendanceStatus)
              }
            >
              {statusOptions.map((option) => (
                <option key={option} value={option}>
                  {attendanceStatusMeta(option).label}
                </option>
              ))}
            </SelectInput>
          </FormField>

          <FormField
            id="manual-note"
            label="Admin note"
            className="sm:col-span-2"
          >
            <TextArea
              id="manual-note"
              rows={3}
              value={adminNote}
              onChange={(event) => setAdminNote(event.target.value)}
              placeholder="Explain why this record was entered manually"
            />
          </FormField>
        </div>

        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <SecondaryButton onClick={onCancel} disabled={submitting}>
            Cancel
          </SecondaryButton>

          <PrimaryButton
            type="submit"
            isLoading={submitting}
            loadingLabel="Saving..."
          >
            Save attendance
          </PrimaryButton>
        </div>
      </form>
    </Modal>
  );
}

export default ManualAttendanceForm;
