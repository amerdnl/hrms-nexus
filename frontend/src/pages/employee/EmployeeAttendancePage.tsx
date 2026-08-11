import {
  CalendarDays,
  CalendarOff,
  Clock3,
  Filter,
  LogIn,
  LogOut,
  Timer,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  checkIn,
  checkOut,
  getMyAttendanceHistory,
  getTodayAttendance,
} from "../../api/attendanceApi";
import { getApiErrorMessage } from "../../api/axios";
import Alert from "../../components/ui/Alert";
import Button from "../../components/ui/Button";
import DataTable from "../../components/ui/DataTable";
import EmptyState from "../../components/ui/EmptyState";
import FilterPanel from "../../components/ui/FilterPanel";
import FormField from "../../components/ui/FormField";
import PageHeader from "../../components/ui/PageHeader";
import SectionCard from "../../components/ui/SectionCard";
import SelectInput from "../../components/ui/SelectInput";
import StatCard from "../../components/ui/StatCard";
import StatusBadge from "../../components/ui/StatusBadge";
import TextInput from "../../components/ui/TextInput";
import type {
  AttendanceRecord,
  AttendanceStatus,
} from "../../types/attendance";
import { calcWorkMinutes, formatWorkHours } from "../../utils/attendance";
import { formatDate, formatTime } from "../../utils/datetime";
import { attendanceStatusMeta, type StatusMeta } from "../../utils/status";

/** Ordered for the filter dropdown; the union itself has no inherent order. */
const statusOptions: AttendanceStatus[] = [
  "present",
  "late",
  "absent",
  "on_leave",
];

const notRecordedMeta: StatusMeta = {
  label: "Not recorded",
  tone: "neutral",
  icon: Clock3,
};

const tableHeaders = [
  "Date",
  "Check-in",
  "Check-out",
  "Work hours",
  "Status",
  "Note",
];

function getErrorMessage(error: unknown): string {
  return getApiErrorMessage(error, "Unable to complete the request");
}

function EmployeeAttendancePage() {
  const [today, setToday] = useState<AttendanceRecord | null>(null);
  const [history, setHistory] = useState<AttendanceRecord[]>([]);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [statusFilter, setStatusFilter] = useState<AttendanceStatus | "">("");
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
    setStatusFilter("");
  }

  const hasCheckedIn = Boolean(today?.checkInTime);
  const hasCheckedOut = Boolean(today?.checkOutTime);

  // The date range is applied by the API; the status is applied here, over the
  // rows already returned. Keeping it client-side means changing it costs no
  // request and cannot disagree with the range the server filtered on.
  const visibleHistory = useMemo(
    () =>
      statusFilter
        ? history.filter((record) => record.status === statusFilter)
        : history,
    [history, statusFilter],
  );

  const activeFilterCount = [startDate, endDate, statusFilter].filter(
    Boolean,
  ).length;

  const todayMeta = today ? attendanceStatusMeta(today.status) : notRecordedMeta;
  const todayWorkMinutes = calcWorkMinutes(
    today?.checkInTime,
    today?.checkOutTime,
  );

  return (
    <section className="mx-auto max-w-7xl space-y-6">
      <PageHeader
        title="My attendance"
        description="Record your daily check-in and check-out."
      />

      {message && <Alert tone="success">{message}</Alert>}
      {error && <Alert tone="danger">{error}</Alert>}

      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Check-in"
          value={formatTime(today?.checkInTime)}
          icon={LogIn}
          tone={hasCheckedIn ? "success" : "neutral"}
          hint={hasCheckedIn ? "Recorded today" : "Not recorded yet"}
        />

        <StatCard
          label="Check-out"
          value={formatTime(today?.checkOutTime)}
          icon={LogOut}
          tone={hasCheckedOut ? "success" : "neutral"}
          hint={hasCheckedOut ? "Recorded today" : "Not recorded yet"}
        />

        <StatCard
          label="Work hours"
          value={formatWorkHours(todayWorkMinutes)}
          icon={Timer}
          tone={todayWorkMinutes === null ? "neutral" : "info"}
          hint={workHoursHint(hasCheckedIn, hasCheckedOut, todayWorkMinutes)}
        />

        <StatCard
          label="Status"
          value={todayMeta.label}
          icon={todayMeta.icon}
          tone={todayMeta.tone}
          hint={today ? "Today's record" : "Nothing recorded today"}
        />
      </div>

      <SectionCard
        title="Record today's attendance"
        description="Attendance uses Malaysia time."
        icon={Clock3}
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
          <Button
            icon={LogIn}
            onClick={handleCheckIn}
            disabled={loading || actionLoading || hasCheckedIn}
          >
            Check in
          </Button>

          <Button
            icon={LogOut}
            onClick={handleCheckOut}
            disabled={loading || actionLoading || !hasCheckedIn || hasCheckedOut}
          >
            Check out
          </Button>
        </div>
      </SectionCard>

      <FilterPanel
        columns={3}
        activeCount={activeFilterCount}
        isBusy={loading}
        onApply={() => void loadAttendance()}
        onClear={clearFilters}
      >
        <FormField id="attendance-start" label="Start date">
          <TextInput
            id="attendance-start"
            type="date"
            value={startDate}
            onChange={(event) => setStartDate(event.target.value)}
          />
        </FormField>

        <FormField id="attendance-end" label="End date">
          <TextInput
            id="attendance-end"
            type="date"
            value={endDate}
            onChange={(event) => setEndDate(event.target.value)}
          />
        </FormField>

        <FormField id="attendance-status" label="Status">
          <SelectInput
            id="attendance-status"
            value={statusFilter}
            onChange={(event) =>
              setStatusFilter(event.target.value as AttendanceStatus | "")
            }
          >
            <option value="">All statuses</option>
            {statusOptions.map((status) => (
              <option key={status} value={status}>
                {attendanceStatusMeta(status).label}
              </option>
            ))}
          </SelectInput>
        </FormField>
      </FilterPanel>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-base font-semibold text-fg">
            <CalendarDays size={18} className="text-primary" aria-hidden="true" />
            Attendance history
          </h2>

          {!loading && (
            <p className="text-sm text-fg-muted">
              {statusFilter
                ? `${visibleHistory.length} of ${history.length} records`
                : `${history.length} records`}
            </p>
          )}
        </div>

        <DataTable
          headers={tableHeaders}
          caption="Your attendance records for the selected date range"
          minWidthClass="min-w-200"
          isLoading={loading}
          loadingLabel="Loading attendance..."
          isEmpty={visibleHistory.length === 0}
          emptyState={
            history.length === 0 ? (
              <EmptyState
                icon={CalendarOff}
                title="No attendance records found"
                description="Nothing was recorded in this date range. Try widening it, or clear the dates to see everything."
              />
            ) : (
              <EmptyState
                icon={Filter}
                title={`No ${attendanceStatusMeta(statusFilter as AttendanceStatus).label.toLowerCase()} records found`}
                description={`This date range has ${history.length} record${history.length === 1 ? "" : "s"}, but none with that status.`}
                action={
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setStatusFilter("")}
                  >
                    Show all statuses
                  </Button>
                }
              />
            )
          }
        >
          {visibleHistory.map((record) => (
            <tr key={record.id}>
              <td className="px-5 py-4 font-medium text-fg">
                {formatDate(record.attendanceDate)}
              </td>

              <td className="px-5 py-4 text-fg-muted">
                {formatTime(record.checkInTime)}
              </td>

              <td className="px-5 py-4 text-fg-muted">
                {formatTime(record.checkOutTime)}
              </td>

              <td className="px-5 py-4 text-fg-muted">
                {formatWorkHours(
                  calcWorkMinutes(record.checkInTime, record.checkOutTime),
                )}
              </td>

              <td className="px-5 py-4">
                <StatusBadge {...attendanceStatusMeta(record.status)} />
              </td>

              <td className="max-w-60 truncate px-5 py-4 text-fg-muted">
                {record.adminNote ?? "—"}
              </td>
            </tr>
          ))}
        </DataTable>
      </section>
    </section>
  );
}

/**
 * Explains an em dash rather than leaving it ambiguous: "no check-out yet" and
 * "the recorded times do not make sense" both render as "—", and only the hint
 * tells them apart.
 */
function workHoursHint(
  hasCheckedIn: boolean,
  hasCheckedOut: boolean,
  minutes: number | null,
): string {
  if (!hasCheckedIn) return "Check in to start the day";
  if (!hasCheckedOut) return "Check out to see the total";
  if (minutes === null) return "Recorded times cannot be totalled";

  return "No break deducted";
}

export default EmployeeAttendancePage;
