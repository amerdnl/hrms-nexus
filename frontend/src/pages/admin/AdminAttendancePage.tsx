import { CalendarDays, ChartPie, Pencil, Plus } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  createManualAttendance,
  getAllAttendance,
  getAttendanceStatistics,
  updateAttendance,
} from "../../api/attendanceApi";
import { getApiErrorMessage } from "../../api/axios";
import { getDepartments, type Department } from "../../api/departmentApi";
import { getEmployees } from "../../api/employeeApi";
import AttendanceStatsCards from "../../components/attendance/AttendanceStatsCards";
import EditAttendanceForm from "../../components/attendance/EditAttendanceForm";
import ManualAttendanceForm from "../../components/attendance/ManualAttendanceForm";
import Alert from "../../components/ui/Alert";
import Button from "../../components/ui/Button";
import DataTable from "../../components/ui/DataTable";
import DonutChart, {
  type DonutSegment,
} from "../../components/ui/DonutChart";
import EmptyState from "../../components/ui/EmptyState";
import FilterPanel from "../../components/ui/FilterPanel";
import FormField from "../../components/ui/FormField";
import PageHeader from "../../components/ui/PageHeader";
import Pagination from "../../components/ui/Pagination";
import PrimaryButton from "../../components/ui/PrimaryButton";
import SectionCard from "../../components/ui/SectionCard";
import SelectInput from "../../components/ui/SelectInput";
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
import type { Employee } from "../../types/employee";
import { formatDate, formatTime, getMalaysiaDate } from "../../utils/datetime";
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
  "Check-in",
  "Check-out",
  "Status",
  "Source",
  "Note",
  "Action",
];

/**
 * First and last day of the current Malaysia month, as "YYYY-MM-DD".
 *
 * `/attendance` has no pagination, so an unscoped first load would pull every
 * record ever written. Defaulting to this month keeps the initial request
 * bounded; the admin can still clear the dates to see everything.
 */
function currentMonthRange(): { startDate: string; endDate: string } {
  const today = getMalaysiaDate();
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

function getErrorMessage(error: unknown): string {
  return getApiErrorMessage(error, "Unable to complete the request");
}

function AdminAttendancePage() {
  const [defaultRange] = useState(currentMonthRange);

  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [statistics, setStatistics] =
    useState<AttendanceStatistics>(emptyStatistics);

  const [employeeId, setEmployeeId] = useState("");
  const [status, setStatus] = useState("");
  const [department, setDepartment] = useState("");
  const [startDate, setStartDate] = useState(defaultRange.startDate);
  const [endDate, setEndDate] = useState(defaultRange.endDate);
  const [statisticsDate, setStatisticsDate] = useState(getMalaysiaDate());

  // Committed filters. `activeFilters` is what reaches the API; the department
  // is applied client-side because /attendance has no department parameter.
  const [activeFilters, setActiveFilters] = useState<AttendanceFilters>({
    startDate: defaultRange.startDate,
    endDate: defaultRange.endDate,
  });
  const [activeDepartment, setActiveDepartment] = useState("");

  const [employees, setEmployees] = useState<Employee[]>([]);
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

  /**
   * The employee and department directory, fetched once. Isolated from
   * loadData: if it fails, names fall back to #id and the department filter
   * disables itself, but the attendance table still works.
   */
  useEffect(() => {
    async function loadDirectory() {
      try {
        const [employeeList, departmentList] = await Promise.all([
          getEmployees(),
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

  return (
    <section className="mx-auto max-w-7xl space-y-6">
      <PageHeader
        title="Attendance management"
        description="Monitor, create and correct employee attendance."
        actions={
          <PrimaryButton icon={Plus} onClick={() => setShowManualForm(true)}>
            Add manual attendance
          </PrimaryButton>
        }
      />

      {message && <Alert tone="success">{message}</Alert>}
      {error && <Alert tone="danger">{error}</Alert>}

      <FormField
        id="statistics-date"
        label="Statistics date"
        hint="Drives the summary cards and chart below. Applies immediately."
        className="max-w-xs"
      >
        <TextInput
          id="statistics-date"
          type="date"
          value={statisticsDate}
          onChange={(event) => setStatisticsDate(event.target.value)}
        />
      </FormField>

      <AttendanceStatsCards statistics={statistics} loading={loading} />

      <SectionCard
        title="Status breakdown"
        description={`Attendance recorded on ${formatDate(statisticsDate)}.`}
        icon={ChartPie}
      >
        <DonutChart
          title={`Attendance by status on ${formatDate(statisticsDate)}`}
          centerCaption="records"
          segments={donutSegments}
        />
      </SectionCard>

      <FilterPanel
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
            Attendance records
          </h2>

          {!loading && (
            <p className="text-sm text-fg-muted">
              {activeDepartment
                ? `${visibleRecords.length} of ${records.length} records`
                : `${records.length} records`}
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
          minWidthClass="min-w-250"
          isLoading={loading}
          loadingLabel="Loading attendance records..."
          isEmpty={pageRecords.length === 0}
          emptyState={
            <EmptyState
              icon={CalendarDays}
              title="No attendance records found"
              description="Adjust the filters and apply them again, or clear the dates to load every record."
            />
          }
        >
          {pageRecords.map((record) => {
            const employee = employeeMap.get(record.employeeId);

            return (
              <tr key={record.id}>
                <td className="px-5 py-4">
                  <p className="font-medium text-fg">
                    {employee?.fullName ?? `#${record.employeeId}`}
                  </p>

                  <p className="mt-0.5 text-xs text-fg-subtle">
                    {employee
                      ? `${employee.employeeNumber}${employee.departmentName ? ` · ${employee.departmentName}` : ""}`
                      : "Not in the employee directory"}
                  </p>
                </td>

                <td className="px-5 py-4 text-fg-muted">
                  {formatDate(record.attendanceDate)}
                </td>

                <td className="px-5 py-4 text-fg-muted">
                  {formatTime(record.checkInTime)}
                </td>

                <td className="px-5 py-4 text-fg-muted">
                  {formatTime(record.checkOutTime)}
                </td>

                <td className="px-5 py-4">
                  <StatusBadge {...attendanceStatusMeta(record.status)} />
                </td>

                <td className="px-5 py-4 text-fg-muted">
                  {record.isManual ? "Manual" : "Employee"}
                </td>

                <td className="max-w-60 truncate px-5 py-4 text-fg-muted">
                  {record.adminNote ?? "—"}
                </td>

                <td className="px-5 py-4">
                  <Button
                    variant="secondary"
                    size="sm"
                    icon={Pencil}
                    onClick={() => setEditingRecord(record)}
                  >
                    Correct
                  </Button>
                </td>
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
