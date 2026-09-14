import { CalendarDays, ChartPie, Pencil, Plus, ShieldCheck } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  createManualAttendance,
  getAllAttendance,
  getAttendanceStatistics,
  updateAttendance,
} from "../../api/attendanceApi";
import { getApiErrorMessage } from "../../api/axios";
import { getCompanySettings } from "../../api/companySettingsApi";
import { getDepartments, type Department } from "../../api/departmentApi";
import { getEmployeeLookup } from "../../api/employeeApi";
import EditAttendanceForm from "../../components/attendance/EditAttendanceForm";
import ManualAttendanceForm from "../../components/attendance/ManualAttendanceForm";
import OfficeQrDisplay from "../../components/attendance/OfficeQrDisplay";
import Alert from "../../components/ui/Alert";
import Avatar from "../../components/ui/Avatar";
import Button from "../../components/ui/Button";
import DataTable from "../../components/ui/DataTable";
import DonutChart, {
  type DonutSegment,
} from "../../components/ui/DonutChart";
import EmptyState from "../../components/ui/EmptyState";
import FilterPanel from "../../components/ui/FilterPanel";
import FormField from "../../components/ui/FormField";
import { fieldDescribedBy } from "../../components/ui/fieldStyles";
import PageHeader from "../../components/ui/PageHeader";
import Pagination from "../../components/ui/Pagination";
import PrimaryButton from "../../components/ui/PrimaryButton";
import RecordCard from "../../components/ui/RecordCard";
import SectionCard from "../../components/ui/SectionCard";
import SelectInput from "../../components/ui/SelectInput";
import Skeleton, { SkeletonText } from "../../components/ui/Skeleton";
import StatusBadge from "../../components/ui/StatusBadge";
import TextInput from "../../components/ui/TextInput";
import type {
  AttendanceFilters,
  AttendanceRecord,
  AttendanceStatistics,
  AttendanceStatus,
  ManualAttendanceInput,
  UpdateAttendanceInput,
} from "../../types/attendance";
import type { EmployeeLookupEntry } from "../../types/employee";
import { formatDate, formatTime, getDateInZone, getMalaysiaDate } from "../../utils/datetime";
import { formatWorkHoursBetween } from "../../utils/attendance";
import { attendanceStatusMeta } from "../../utils/status";

const emptyStatistics: AttendanceStatistics = {
  total: 0,
  present: 0,
  late: 0,
  absent: 0,
  onLeave: 0,
};

const statusOptions: AttendanceStatus[] = [
  "present",
  "late",
  "absent",
  "on_leave",
];

const PAGE_SIZE = 25;

const tableHeaders = [
  "Employee",
  "Date",
  "Time",
  "Hours",
  "Status",
  "Source",
  <span key="action" className="sr-only">
    Action
  </span>,
];

/**
 * First and last day of the month containing `today`, as "YYYY-MM-DD".
 *
 * `/attendance` has no pagination, so an unscoped first load would pull every
 * record ever written. Defaulting to this month keeps the initial request
 * bounded; the admin can still clear the dates to see everything.
 */
function monthRangeOf(today: string): { startDate: string; endDate: string } {
  const month = today.slice(0, 7);
  const [year, monthNumber] = today.split("-").map(Number);

  // Day 0 of the *next* month is the last day of this one, computed in UTC so
  // no local DST boundary can shift it.
  const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();

  return {
    startDate: `${month}-01`,
    endDate: `${month}-${String(lastDay).padStart(2, "0")}`,
  };
}

const methodLabels: Record<string, string> = {
  QR_LOCATION: "QR + location",
  ADMIN_OVERRIDE: "Admin override",
  REMOTE_APPROVED: "Remote approved",
  FIELD_WORK: "Field work",
};

/** Records predating verification have no method; they are simply older. */
function sourceLabel(record: AttendanceRecord): string {
  const method = record.verification?.verificationMethod;
  if (method) return methodLabels[method] ?? method;
  return record.isManual ? "Manual" : "Employee";
}

function getErrorMessage(error: unknown): string {
  return getApiErrorMessage(error, "Unable to complete the request");
}

function AdminAttendancePage() {
  /*
   * The company's own date, in its Company Settings timezone - the zone the
   * server uses to decide which day a record belongs to. This page used to
   * default its overview date and its records month from a fixed Malaysia
   * date, so for a company on any other zone it could open on the wrong day.
   * Null until known; nothing loads before then, so the first request is
   * already for the right day. If settings cannot be read, the previous
   * Malaysia default is used rather than blocking the page.
   */
  const [companyToday, setCompanyToday] = useState<string | null>(null);

  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [statistics, setStatistics] =
    useState<AttendanceStatistics>(emptyStatistics);

  const [employeeId, setEmployeeId] = useState("");
  const [status, setStatus] = useState("");
  const [department, setDepartment] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [statisticsDate, setStatisticsDate] = useState("");

  // Committed filters. `activeFilters` is what reaches the API; the department
  // is applied client-side because /attendance has no department parameter.
  const [activeFilters, setActiveFilters] = useState<AttendanceFilters>({});

  useEffect(() => {
    let cancelled = false;
    getCompanySettings()
      .then((settings) => getDateInZone(settings.timezone))
      .catch(() => getMalaysiaDate())
      .then((today) => {
        if (cancelled) return;
        const range = monthRangeOf(today);
        setStartDate(range.startDate);
        setEndDate(range.endDate);
        setActiveFilters(range);
        setStatisticsDate(today);
        setCompanyToday(today);
      });
    return () => { cancelled = true; };
  }, []);
  const [activeDepartment, setActiveDepartment] = useState("");

  const [employees, setEmployees] = useState<EmployeeLookupEntry[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [directoryFailed, setDirectoryFailed] = useState(false);

  const [page, setPage] = useState(1);

  const [showManualForm, setShowManualForm] = useState(false);
  const [editingRecord, setEditingRecord] = useState<AttendanceRecord | null>(
    null,
  );

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const loadData = useCallback(async () => {
    if (companyToday === null) return;
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
  }, [activeFilters, statisticsDate, companyToday]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  /**
   * The employee and department directory, fetched once. Isolated from
   * loadData: if it fails, names fall back to #id and the department filter
   * disables itself, but the attendance table still works.
   */
  useEffect(() => {
    async function loadDirectory() {
      try {
        const [employeeList, departmentList] = await Promise.all([
          getEmployeeLookup(),
          getDepartments(),
        ]);

        setEmployees(employeeList);
        setDepartments(departmentList);
      } catch {
        setDirectoryFailed(true);
      }
    }

    void loadDirectory();
  }, []);

  // A Map, built once per employee list, so row rendering is a single O(1)
  // lookup rather than a .find() scan per row.
  const employeeMap = useMemo(
    () => new Map(employees.map((employee) => [employee.id, employee])),
    [employees],
  );

  const visibleRecords = useMemo(() => {
    if (!activeDepartment) return records;

    const wantedDepartmentId = Number(activeDepartment);

    return records.filter(
      (record) =>
        employeeMap.get(record.employeeId)?.departmentId === wantedDepartmentId,
    );
  }, [records, activeDepartment, employeeMap]);

  /**
   * Records whose employee is missing from the directory. A department filter
   * cannot place them, so they are dropped - counted here so the page can say
   * so out loud instead of losing rows silently.
   */
  const unknownEmployeeCount = useMemo(() => {
    if (!activeDepartment) return 0;

    return records.filter((record) => !employeeMap.has(record.employeeId))
      .length;
  }, [records, activeDepartment, employeeMap]);

  useEffect(() => {
    setPage(1);
  }, [activeFilters, activeDepartment]);

  // Clamped during render rather than in an effect, so a shrinking result set
  // can never leave the table showing an empty page for one frame.
  const pageCount = Math.max(1, Math.ceil(visibleRecords.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);

  const pageRecords = useMemo(
    () =>
      visibleRecords.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE),
    [visibleRecords, safePage],
  );

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
    setActiveDepartment(department);
  }

  function clearFilters() {
    setEmployeeId("");
    setStatus("");
    setDepartment("");
    setStartDate("");
    setEndDate("");
    setActiveFilters({});
    setActiveDepartment("");
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

  const activeFilterCount = [
    activeFilters.employeeId,
    activeFilters.status,
    activeFilters.startDate,
    activeFilters.endDate,
    activeDepartment,
  ].filter(Boolean).length;

  // Same ordering as the admin dashboard: green and red never adjacent.
  const donutSegments: DonutSegment[] = [
    {
      key: "present",
      value: statistics.present,
      ...attendanceStatusMeta("present"),
    },
    { key: "late", value: statistics.late, ...attendanceStatusMeta("late") },
    {
      key: "on_leave",
      value: statistics.onLeave,
      ...attendanceStatusMeta("on_leave"),
    },
    {
      key: "absent",
      value: statistics.absent,
      ...attendanceStatusMeta("absent"),
    },
  ];

  const recordName = (record: AttendanceRecord) =>
    employeeMap.get(record.employeeId)?.fullName ?? `Employee #${record.employeeId}`;

  // Icon-only, named for assistive tech and titled for pointer users. A
  // labelled button made this column 123px wide, which on its own was what
  // pushed the action off the right edge at 1280.
  const correctButton = (record: AttendanceRecord) => (
    <Button
      variant="ghost"
      size="sm"
      icon={Pencil}
      onClick={() => setEditingRecord(record)}
      aria-label={`Correct attendance for ${recordName(record)}`}
      title="Correct this record"
    />
  );

  return (
    <section className="max-w-7xl space-y-6">
      <PageHeader
        title="Attendance"
        description="Daily records, how each one was verified, and corrections."
        actions={
          <PrimaryButton icon={Plus} onClick={() => setShowManualForm(true)}>
            Record attendance
          </PrimaryButton>
        }
      />

      {message && <Alert tone="success">{message}</Alert>}
      {error && <Alert tone="danger">{error}</Alert>}

      <div className="grid gap-6 lg:grid-cols-5">
        {/* One card for one day. The statistics endpoint is single-date, so
            the date picker belongs to this card rather than floating above the
            page, where it read as a filter for the records table too. */}
        <SectionCard
          className="lg:col-span-3"
          title="Day overview"
          description={formatDate(statisticsDate)}
          icon={ChartPie}
          actions={
            <>
              <label htmlFor="statistics-date" className="sr-only">
                Overview date
              </label>
              <TextInput
                id="statistics-date"
                type="date"
                className="w-auto py-1.5"
                value={statisticsDate}
                onChange={(event) => setStatisticsDate(event.target.value)}
              />
            </>
          }
        >
          {loading ? (
            <div className="flex flex-col items-center gap-6 sm:flex-row" aria-busy="true">
              <span className="sr-only" aria-live="polite">Loading the day overview</span>
              <Skeleton className="h-40 w-40 shrink-0 rounded-full" />
              <SkeletonText lines={4} className="w-full" />
            </div>
          ) : statistics.total === 0 ? (
            // Four "0 0%" rows around an empty ring said nothing and read as a
            // chart that failed. This is a day with no records, which is a
            // different statement from a day on which nobody was present.
            <EmptyState
              icon={CalendarDays}
              title="No attendance recorded for this date"
              description="Records appear here as employees check in, or when one is recorded manually."
              className="py-8"
            />
          ) : (
            <DonutChart
              title={`Attendance by status on ${formatDate(statisticsDate)}`}
              centerCaption="records"
              segments={donutSegments}
            />
          )}
        </SectionCard>

        <OfficeQrDisplay className="lg:col-span-2" />
      </div>

      <FilterPanel
        title="Filter records"
        columns={3}
        activeCount={activeFilterCount}
        isBusy={loading}
        onApply={applyFilters}
        onClear={clearFilters}
      >
        <FormField id="filter-employee-id" label="Employee ID">
          <TextInput
            id="filter-employee-id"
            type="number"
            min="1"
            value={employeeId}
            onChange={(event) => setEmployeeId(event.target.value)}
            placeholder="Example: 15"
          />
        </FormField>

        <FormField id="filter-status" label="Status">
          <SelectInput
            id="filter-status"
            value={status}
            onChange={(event) => setStatus(event.target.value)}
          >
            <option value="">All statuses</option>
            {statusOptions.map((option) => (
              <option key={option} value={option}>
                {attendanceStatusMeta(option).label}
              </option>
            ))}
          </SelectInput>
        </FormField>

        <FormField
          id="filter-department"
          label="Department"
          hint={
            directoryFailed
              ? "Unavailable - the employee directory did not load."
              : undefined
          }
        >
          <SelectInput
            id="filter-department"
            aria-describedby={fieldDescribedBy("filter-department", { hint: directoryFailed })}
            value={department}
            onChange={(event) => setDepartment(event.target.value)}
            disabled={directoryFailed}
          >
            <option value="">All departments</option>
            {departments.map((item) => (
              <option key={item.id} value={String(item.id)}>
                {item.name}
              </option>
            ))}
          </SelectInput>
        </FormField>

        <FormField id="filter-start-date" label="Start date">
          <TextInput
            id="filter-start-date"
            type="date"
            value={startDate}
            onChange={(event) => setStartDate(event.target.value)}
          />
        </FormField>

        <FormField
          id="filter-end-date"
          label="End date"
          hint="Clear both dates to load every record."
        >
          <TextInput
            id="filter-end-date"
            aria-describedby={fieldDescribedBy("filter-end-date", { hint: true })}
            type="date"
            value={endDate}
            onChange={(event) => setEndDate(event.target.value)}
          />
        </FormField>
      </FilterPanel>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-base font-semibold text-fg">
            <CalendarDays size={18} className="text-primary" aria-hidden="true" />
            Records
          </h2>

          {!loading && (
            <p className="text-sm text-fg-muted">
              <span className="font-semibold text-fg">
                {activeDepartment ? visibleRecords.length : records.length}
              </span>
              {activeDepartment ? ` of ${records.length}` : ""} records
            </p>
          )}
        </div>

        {directoryFailed && (
          <Alert tone="warning">
            The employee directory could not be loaded, so records show an ID
            instead of a name and the department filter is unavailable.
            Attendance data itself is unaffected.
          </Alert>
        )}

        {unknownEmployeeCount > 0 && (
          <Alert tone="warning">
            {unknownEmployeeCount} record
            {unknownEmployeeCount === 1 ? " is" : "s are"} hidden by the
            department filter because the matching employee is not in the
            directory. Clear the department filter to see them.
          </Alert>
        )}

        <DataTable
          headers={tableHeaders}
          caption="Attendance records for the applied filters"
          // Was min-w-250 with eight columns, and the action column clipped at
          // 1280. Check-in and check-out now share a column, worked hours sit
          // beside them, and the note moved under its source - seven columns
          // that fit the content column.
          minWidthClass="min-w-200"
          isLoading={loading}
          loadingLabel="Loading attendance records"
          isEmpty={pageRecords.length === 0}
          emptyState={
            <EmptyState
              icon={CalendarDays}
              title={activeFilterCount > 0 ? "No records match these filters" : "No attendance records yet"}
              description={
                activeFilterCount > 0
                  ? "Adjust the filters and apply them again, or clear the dates to load every record."
                  : "Records appear as employees check in."
              }
              action={
                activeFilterCount > 0 ? (
                  <Button variant="secondary" size="sm" onClick={clearFilters}>
                    Clear filters
                  </Button>
                ) : undefined
              }
            />
          }
          mobileCards={pageRecords.map((record) => {
            const employee = employeeMap.get(record.employeeId);
            return (
              <RecordCard
                key={record.id}
                leading={<Avatar name={recordName(record)} size="md" />}
                title={recordName(record)}
                subtitle={`${formatDate(record.attendanceDate)}${employee ? ` · ${employee.employeeNumber}` : ""}`}
                badge={<StatusBadge {...attendanceStatusMeta(record.status)} />}
                meta={[
                  {
                    label: "Time",
                    value: `${formatTime(record.checkInTime)} – ${formatTime(record.checkOutTime)}`,
                  },
                  {
                    label: "Hours",
                    value: formatWorkHoursBetween(record.checkInTime, record.checkOutTime),
                  },
                  { label: "Source", value: sourceLabel(record) },
                  ...(record.adminNote ? [{ label: "Note", value: record.adminNote }] : []),
                ]}
                actions={correctButton(record)}
              />
            );
          })}
        >
          {pageRecords.map((record) => {
            const employee = employeeMap.get(record.employeeId);
            const distance = record.verification?.checkInDistanceMeters;

            return (
              <tr key={record.id} className="transition-colors hover:bg-surface-muted">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <Avatar name={recordName(record)} size="sm" />
                    {/* Capped so one long name cannot widen the whole column;
                        a longer name wraps inside the cap rather than being
                        clipped - a tooltip reaches neither touch nor keyboard. */}
                    <div className="min-w-0 max-w-44">
                      <p className="font-medium text-fg [overflow-wrap:anywhere]">
                        {recordName(record)}
                      </p>
                      <p className="mt-0.5 text-xs text-fg-subtle [overflow-wrap:anywhere]">
                        {employee
                          ? `${employee.employeeNumber}${employee.departmentName ? ` · ${employee.departmentName}` : ""}`
                          : "Not in the employee directory"}
                      </p>
                    </div>
                  </div>
                </td>

                <td className="whitespace-nowrap px-4 py-3 text-fg-muted">
                  {formatDate(record.attendanceDate)}
                </td>

                <td className="whitespace-nowrap px-4 py-3 tabular-nums text-fg">
                  {formatTime(record.checkInTime)}
                  <span className="mx-1.5 text-fg-subtle" aria-hidden="true">→</span>
                  <span className="sr-only"> to </span>
                  {formatTime(record.checkOutTime)}
                </td>

                <td className="whitespace-nowrap px-4 py-3 tabular-nums text-fg-muted">
                  {formatWorkHoursBetween(record.checkInTime, record.checkOutTime)}
                </td>

                <td className="px-4 py-3">
                  <StatusBadge {...attendanceStatusMeta(record.status)} />
                </td>

                {/* How the record was established, and how far away the
                    employee was, so a verified scan is distinguishable from a
                    declared one at a glance. Distance only - never the
                    coordinates themselves. */}
                <td className="max-w-56 px-4 py-3 text-fg-muted">
                  <p className="flex items-center gap-1.5 whitespace-nowrap">
                    {record.verification?.verificationMethod === "QR_LOCATION" && (
                      <ShieldCheck size={14} className="shrink-0 text-success-fg" aria-hidden="true" />
                    )}
                    {sourceLabel(record)}
                  </p>
                  {distance !== null && distance !== undefined && (
                    <p className="mt-0.5 whitespace-nowrap text-xs text-fg-subtle">
                      {Math.round(distance)} m from office
                    </p>
                  )}
                  {/* The note lives with the source because it almost always
                      explains one: why a record was entered by hand or
                      corrected. As its own column it was a line of dashes. */}
                  {record.adminNote && (
                    <p className="mt-0.5 truncate text-xs italic text-fg-subtle" title={record.adminNote}>
                      {record.adminNote}
                    </p>
                  )}
                </td>

                <td className="px-2 py-3 text-right">{correctButton(record)}</td>
              </tr>
            );
          })}
        </DataTable>

        <Pagination
          page={safePage}
          pageSize={PAGE_SIZE}
          totalItems={visibleRecords.length}
          onPageChange={setPage}
          // Pagination's own base sets only `border-t`; adding the full
          // outline here makes the strip read as its own card under the table.
          className="mt-3 rounded-card border border-line bg-surface shadow-card"
        />
      </section>

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
