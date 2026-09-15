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
import { fieldDescribedBy } from "../ui/fieldStyles";
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

/** The server's bounds, checked here only to answer sooner; the server decides. */
const REASON_MIN_LENGTH = 5;
const REASON_MAX_LENGTH = 300;

function EditAttendanceForm({
  record,
  submitting,
  onSubmit,
  onCancel,
}: EditAttendanceFormProps) {
  // At minute precision, as the time inputs show them. A value is only sent
  // when it differs from these, so saving a check-out change cannot quietly
  // rewrite a scanned 08:03:12 check-in to 08:03:00.
  const initialCheckIn = record.checkInTime?.slice(0, 5) ?? "";
  const initialCheckOut = record.checkOutTime?.slice(0, 5) ?? "";

  const [checkInTime, setCheckInTime] = useState(initialCheckIn);
  const [checkOutTime, setCheckOutTime] = useState(initialCheckOut);
  const [status, setStatus] = useState<AttendanceStatus>(record.status);
  const [reason, setReason] = useState("");
  const [formError, setFormError] = useState("");

  const verified =
    record.verification?.verificationMethod === "QR_LOCATION" &&
    !record.verification.correctedByHr;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError("");

    const input: UpdateAttendanceInput = { reason: reason.trim() };
    if (checkInTime !== initialCheckIn) input.checkInTime = checkInTime || null;
    if (checkOutTime !== initialCheckOut) input.checkOutTime = checkOutTime || null;
    if (status !== record.status) input.status = status;

    if (
      input.checkInTime === undefined &&
      input.checkOutTime === undefined &&
      input.status === undefined
    ) {
      setFormError("Change the check-in time, check-out time or status. A reason on its own is not a correction.");
      return;
    }

    if (checkInTime && checkOutTime && checkOutTime < checkInTime) {
      setFormError("Check-out time cannot be earlier than check-in time");
      return;
    }

    if (input.reason.length < REASON_MIN_LENGTH) {
      setFormError(`Give a reason for this correction, at least ${REASON_MIN_LENGTH} characters.`);
      return;
    }

    await onSubmit(record.id, input);
  }

  const currentNote = record.adminNote
    ? record.adminNote.length > 80 ? `${record.adminNote.slice(0, 80)}…` : record.adminNote
    : null;

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

        {verified && (
          <p className="text-sm text-fg-muted">
            This record was verified by the office QR code and location. Once
            corrected it shows as <span className="font-medium text-fg">Corrected by HR</span>,
            and where it was first verified stays on the record.
          </p>
        )}

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
            id="edit-reason"
            label="Reason for correction"
            required
            hint={`Kept in the audit log with the values before and after, and shown to the employee as the record's note${currentNote ? `, replacing "${currentNote}"` : ""}.`}
            className="sm:col-span-2"
          >
            <TextArea
              id="edit-reason"
              rows={3}
              value={reason}
              maxLength={REASON_MAX_LENGTH}
              aria-required="true"
              aria-describedby={fieldDescribedBy("edit-reason", { hint: true })}
              onChange={(event) => setReason(event.target.value)}
              placeholder="For example: forgot to check out; confirmed with their manager"
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
