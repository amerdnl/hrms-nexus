import { CalendarDays, CalendarOff, ChartPie, Filter } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  getMyAttendanceHistory,
  getTodayAttendance,
} from "../../api/attendanceApi";
import { getApiErrorMessage } from "../../api/axios";
import Alert from "../../components/ui/Alert";
import Button from "../../components/ui/Button";
import TodayAttendanceCard from "../../components/attendance/TodayAttendanceCard";
import VerifiedClockPanel from "../../components/attendance/VerifiedClockPanel";
import DataTable from "../../components/ui/DataTable";
import EmptyState from "../../components/ui/EmptyState";
import FilterPanel from "../../components/ui/FilterPanel";
import FormField from "../../components/ui/FormField";
import PageHeader from "../../components/ui/PageHeader";
import Pagination from "../../components/ui/Pagination";
import RecordCard from "../../components/ui/RecordCard";
import SectionCard from "../../components/ui/SectionCard";
import SegmentedBar, { type BarSegment } from "../../components/ui/SegmentedBar";
import SelectInput from "../../components/ui/SelectInput";
import { SkeletonText } from "../../components/ui/Skeleton";
import StatusBadge from "../../components/ui/StatusBadge";
import TextInput from "../../components/ui/TextInput";
import type {
  AttendanceRecord,
  AttendanceStatus,
} from "../../types/attendance";
import { calcWorkMinutes, formatWorkHours } from "../../utils/attendance";
import { formatDate, formatDateRange, formatTime } from "../../utils/datetime";
import { attendanceStatusMeta } from "../../utils/status";

/** Ordered for the filter dropdown; the union itself has no inherent order. */
const statusOptions: AttendanceStatus[] = [
  "present",
  "late",
  "absent",
  "on_leave",
];

const PAGE_SIZE = 20;

const tableHeaders = ["Date", "Time", "Worked", "Status", "Note"];

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
  const [clockMode, setClockMode] = useState<"check-in" | "check-out" | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);

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

  async function handleRecorded(record: AttendanceRecord) {
    setToday(record);
    setMessage(
      clockMode === "check-in"
        ? "Check-in verified and recorded"
        : "Check-out verified and recorded",
    );
    setError("");
    setClockMode(null);
    await loadAttendance();
  }

  function clearFilters() {
    setStartDate("");
    setEndDate("");
    setStatusFilter("");
  }

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

  const rangeLabel =
    startDate && endDate
      ? formatDateRange(startDate, endDate)
      : startDate
        ? `From ${formatDate(startDate)}`
        : endDate
          ? `Up to ${formatDate(endDate)}`
          : "All records";

  useEffect(() => {
    setPage(1);
  }, [statusFilter, history]);

  const pageCount = Math.max(1, Math.ceil(visibleHistory.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const pageRecords = visibleHistory.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  // A tally of the records the server returned for this range - counting, not
  // re-deciding: each record's status is exactly as recorded.
  const rangeSegments: BarSegment[] = (["present", "late", "on_leave", "absent"] as const).map((key) => ({
    key,
    value: history.filter((record) => record.status === key).length,
    ...attendanceStatusMeta(key),
  }));

  return (
    <section className="max-w-6xl space-y-6">
      <PageHeader
        title="My attendance"
        description="Check in and out with the office QR code, and see your record."
      />

      {message && <Alert tone="success" onDismiss={() => setMessage("")}>{message}</Alert>}
      {error && <Alert tone="danger" onDismiss={() => setError("")}>{error}</Alert>}

      <div className="grid items-start gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <TodayAttendanceCard
            // The record's own date when there is one - it is the company date
            // the server stamped. With no record there is no date to show, and
            // guessing one from a fixed zone would disagree with the company's.
            dateLabel={today ? formatDate(today.attendanceDate) : undefined}
            status={today?.status ?? null}
            checkInTime={today?.checkInTime}
            checkOutTime={today?.checkOutTime}
            verificationStatus={today?.verification?.verificationStatus ?? null}
            correctedByHr={today?.verification?.correctedByHr ?? false}
            lateMinutes={today?.verification?.lateMinutes ?? null}
            actionsDisabled={loading || clockMode !== null}
            onStart={(mode) => { setClockMode(mode); setMessage(""); setError(""); }}
          />

          {clockMode && (
            <VerifiedClockPanel
              mode={clockMode}
              onRecorded={(record) => void handleRecorded(record)}
              onCancel={() => setClockMode(null)}
            />
          )}
        </div>

        <SectionCard title="This range" description={rangeLabel} icon={ChartPie}>
          {loading ? (
            <SkeletonText lines={5} />
          ) : history.length === 0 ? (
            <EmptyState icon={CalendarOff} title="Nothing recorded" description="No records in this range." className="py-6" />
          ) : (
            <SegmentedBar title="Your records in this range by status" unit="days recorded" segments={rangeSegments} />
          )}
        </SectionCard>
      </div>

      <FilterPanel
        title="Filter history"
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
            History
          </h2>

          {!loading && (
            <p className="text-sm text-fg-muted">
              <span className="font-semibold text-fg">{visibleHistory.length}</span>
              {statusFilter ? ` of ${history.length}` : ""} records
            </p>
          )}
        </div>

        <DataTable
          headers={tableHeaders}
          caption="Your attendance records for the selected date range"
          minWidthClass="min-w-160"
          isLoading={loading}
          loadingLabel="Loading attendance"
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
          mobileCards={pageRecords.map((record) => (
            <RecordCard
              key={record.id}
              title={formatDate(record.attendanceDate)}
              subtitle={`${formatTime(record.checkInTime)} – ${formatTime(record.checkOutTime)}`}
              badge={<StatusBadge {...attendanceStatusMeta(record.status)} />}
              meta={[
                { label: "Worked", value: formatWorkHours(calcWorkMinutes(record.checkInTime, record.checkOutTime)) },
                ...(record.adminNote ? [{ label: "Note", value: record.adminNote }] : []),
              ]}
            />
          ))}
        >
          {pageRecords.map((record) => (
            <tr key={record.id} className="transition-colors hover:bg-surface-muted">
              <td className="px-5 py-3 font-medium text-fg">
                {formatDate(record.attendanceDate)}
              </td>

              <td className="whitespace-nowrap px-5 py-3 tabular-nums text-fg">
                {formatTime(record.checkInTime)}
                <span className="mx-1.5 text-fg-subtle" aria-hidden="true">→</span>
                <span className="sr-only"> to </span>
                {formatTime(record.checkOutTime)}
              </td>

              <td className="px-5 py-3 tabular-nums text-fg-muted">
                {formatWorkHours(calcWorkMinutes(record.checkInTime, record.checkOutTime))}
              </td>

              <td className="px-5 py-3">
                <StatusBadge {...attendanceStatusMeta(record.status)} />
              </td>

              <td className="max-w-60 truncate px-5 py-3 text-fg-muted" title={record.adminNote ?? undefined}>
                {record.adminNote ?? "—"}
              </td>
            </tr>
          ))}
        </DataTable>

        <Pagination
          page={safePage}
          pageSize={PAGE_SIZE}
          totalItems={visibleHistory.length}
          onPageChange={setPage}
          className="rounded-card border border-line bg-surface shadow-card"
        />
      </section>
    </section>
  );
}

export default EmployeeAttendancePage;
