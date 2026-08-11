import { Pencil } from "lucide-react";
import { useState, type FormEvent } from "react";
import type {
  AttendanceRecord,
  AttendanceStatus,
  UpdateAttendanceInput,
} from "../../types/attendance";
import { formatDate } from "../../utils/datetime";
import { attendanceStatusMeta } from "../../utils/status";
import Alert from "../ui/Alert";
import FormField from "../ui/FormField";
import Modal from "../ui/Modal";
import PrimaryButton from "../ui/PrimaryButton";
import SecondaryButton from "../ui/SecondaryButton";
import SelectInput from "../ui/SelectInput";
import TextArea from "../ui/TextArea";
import TextInput from "../ui/TextInput";

type EditAttendanceFormProps = {
  record: AttendanceRecord;
  submitting: boolean;
  onSubmit: (
    attendanceId: number,
    input: UpdateAttendanceInput,
  ) => Promise<void>;
  onCancel: () => void;
};

const statusOptions: AttendanceStatus[] = [
  "present",
  "late",
  "absent",
  "on_leave",
];

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
    // Mounted per record by the parent, so the initial values above are read
    // fresh for each correction rather than going stale between rows.
    <Modal
      isOpen
      onClose={onCancel}
      title="Correct attendance"
      description={`Employee ID ${record.employeeId} on ${formatDate(record.attendanceDate)}`}
      icon={<Pencil size={20} />}
      size="lg"
      isDismissDisabled={submitting}
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        {formError && <Alert tone="danger">{formError}</Alert>}

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField id="edit-check-in" label="Check-in time">
            <TextInput
              id="edit-check-in"
              type="time"
              value={checkInTime}
              onChange={(event) => setCheckInTime(event.target.value)}
            />
          </FormField>

          <FormField id="edit-check-out" label="Check-out time">
            <TextInput
              id="edit-check-out"
              type="time"
              value={checkOutTime}
              onChange={(event) => setCheckOutTime(event.target.value)}
            />
          </FormField>

          <FormField id="edit-status" label="Status">
            <SelectInput
              id="edit-status"
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
            id="edit-note"
            label="Admin note"
            className="sm:col-span-2"
          >
            <TextArea
              id="edit-note"
              rows={3}
              value={adminNote}
              onChange={(event) => setAdminNote(event.target.value)}
              placeholder="Reason for correcting this record"
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
            Save correction
          </PrimaryButton>
        </div>
      </form>
    </Modal>
  );
}

export default EditAttendanceForm;
