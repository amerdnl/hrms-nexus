import { Plus, UserCheck, UserMinus, Users } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { getApiErrorMessage } from "../../api/axios";
import { getDepartments, type Department } from "../../api/departmentApi";
import {
  deleteEmployee,
  getEmployeeJobTitles,
  getEmployees,
  reactivateEmployee,
} from "../../api/employeeApi";
import ConfirmationModal from "../../components/common/ConfirmationModal";
import Alert from "../../components/ui/Alert";
import Button from "../../components/ui/Button";
import DataTable from "../../components/ui/DataTable";
import EmptyState from "../../components/ui/EmptyState";
import FilterPanel from "../../components/ui/FilterPanel";
import FormField from "../../components/ui/FormField";
import { fieldDescribedBy } from "../../components/ui/fieldStyles";
import LinkButton from "../../components/ui/LinkButton";
import PageHeader from "../../components/ui/PageHeader";
import Pagination from "../../components/ui/Pagination";
import SelectInput from "../../components/ui/SelectInput";
import StatusBadge from "../../components/ui/StatusBadge";
import TextInput from "../../components/ui/TextInput";
import { useDebouncedValue } from "../../hooks/useDebouncedValue";
import {
  employmentStatusLabels,
  employmentStatuses,
  type Employee,
} from "../../types/employee";
import { employmentStatusMeta } from "../../utils/status";

const SEARCH_DEBOUNCE_MS = 350;
const PAGE_SIZE = 25;

const tableHeaders = [
  "Employee",
  "Job title",
  "Department",
  "Status",
  "Actions",
];

type PendingActionType = "deactivate" | "reactivate";

interface PendingAction {
  type: PendingActionType;
  employee: Employee;
}

const actionCopy: Record<
  PendingActionType,
  {
    title: string;
    confirmLabel: string;
    processingLabel: string;
    tone: "danger" | "primary";
    icon: ReactNode;
    describe: (name: string) => string;
  }
> = {
  deactivate: {
    title: "Deactivate employee?",
    confirmLabel: "Deactivate",
    processingLabel: "Deactivating...",
    tone: "danger",
    icon: <UserMinus size={21} />,
    describe: (name) =>
      `Are you sure you want to deactivate ${name}? Their attendance and leave history is kept, and their sign-in is disabled.`,
  },
  reactivate: {
    title: "Reactivate employee?",
    confirmLabel: "Reactivate",
    // Not destructive, so this dialog is deliberately not red.
    tone: "primary",
    processingLabel: "Reactivating...",
    icon: <UserCheck size={21} />,
    describe: (name) =>
      `Are you sure you want to reactivate ${name}? Their sign-in is enabled again.`,
  },
};

export default function EmployeeListPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [total, setTotal] = useState(0);
  const [pageCount, setPageCount] = useState(1);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [departmentsFailed, setDepartmentsFailed] = useState(false);
  const [jobTitleOptions, setJobTitleOptions] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  // Every filter below is applied by the server, so the browser only ever holds
  // the current page rather than the whole employee table.
  const [search, setSearch] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("");
  const [employmentStatus, setEmploymentStatus] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [page, setPage] = useState(1);

  const [pendingAction, setPendingAction] = useState<PendingAction | null>(
    null,
  );
  const [isProcessingAction, setIsProcessingAction] = useState(false);

  // Only the free-text search is debounced: it is a server query, and the two
  // selects commit a single value per interaction.
  const debouncedSearch = useDebouncedValue(search, SEARCH_DEBOUNCE_MS);

  // Identifies the newest request so a slow earlier response - a half-typed
  // search, say - cannot overwrite the results the admin is actually looking at.
  const requestId = useRef(0);

  const loadEmployees = useCallback(async () => {
    const currentRequest = ++requestId.current;

    try {
      setIsLoading(true);
      setError("");

      const result = await getEmployees({
        search: debouncedSearch || undefined,
        department: departmentFilter || undefined,
        employment_status: employmentStatus || undefined,
        job_title: jobTitle || undefined,
        page,
        page_size: PAGE_SIZE,
      });

      if (currentRequest !== requestId.current) return;

      setEmployees(result.employees);
      setTotal(result.total);
      setPageCount(result.pageCount);

      // A deactivation or a narrowed filter can leave the current page beyond the
      // end of the result set; step back rather than showing an empty table.
      if (page > result.pageCount) setPage(result.pageCount);
    } catch (requestError) {
      if (currentRequest !== requestId.current) return;
      setError(getApiErrorMessage(requestError, "Unable to load employees."));
    } finally {
      if (currentRequest === requestId.current) setIsLoading(false);
    }
  }, [debouncedSearch, departmentFilter, employmentStatus, jobTitle, page]);

  useEffect(() => {
    void loadEmployees();
  }, [loadEmployees]);

  useEffect(() => {
    async function loadDepartments() {
      try {
        setDepartments(await getDepartments());
      } catch {
        setDepartmentsFailed(true);
      }
    }

    void loadDepartments();
  }, []);

  // Job titles come from their own endpoint, so the options cover every employee
  // rather than only the rows on the current page.
  const loadJobTitles = useCallback(async () => {
    try {
      setJobTitleOptions(await getEmployeeJobTitles());
    } catch {
      setJobTitleOptions([]);
    }
  }, []);

  useEffect(() => {
    void loadJobTitles();
  }, [loadJobTitles]);

  /** Any filter change restarts at page 1, atomically with the filter itself. */
  function changeFilter(apply: () => void) {
    apply();
    setPage(1);
  }

  const activeFilterCount = [
    search,
    departmentFilter,
    employmentStatus,
    jobTitle,
  ].filter(Boolean).length;

  function clearFilters() {
    changeFilter(() => {
      setSearch("");
      setDepartmentFilter("");
      setEmploymentStatus("");
      setJobTitle("");
    });
  }

  async function handleDeactivate(id: number) {
    try {
      await deleteEmployee(id);
      await loadEmployees();
    } catch (requestError) {
      setError(
        getApiErrorMessage(requestError, "Unable to deactivate employee."),
      );
    }
  }

  async function handleReactivate(id: number) {
    try {
      setError("");
      await reactivateEmployee(id);
      await loadEmployees();
    } catch (requestError) {
      setError(
        getApiErrorMessage(requestError, "Unable to reactivate employee."),
      );
    }
  }

  /**
   * Same sequence the window.confirm version ran: act, reload, and surface any
   * failure in the page-level alert. The dialog closes either way, which
   * matches the old flow where the confirm had already been dismissed.
   */
  async function confirmPendingAction() {
    if (!pendingAction) return;

    const { type, employee } = pendingAction;
    setIsProcessingAction(true);

    try {
      if (type === "deactivate") {
        await handleDeactivate(employee.id);
      } else if (type === "reactivate") {
        await handleReactivate(employee.id);
      }
    } finally {
      setIsProcessingAction(false);
      setPendingAction(null);
    }
  }

  const pendingCopy = pendingAction ? actionCopy[pendingAction.type] : null;

  return (
    <section className="mx-auto max-w-7xl space-y-6">
      <PageHeader
        title="Employee management"
        description="View and manage employees."
        actions={
          <LinkButton to="/admin/employees/new" icon={Plus}>
            Add employee
          </LinkButton>
        }
      />

      {error && <Alert tone="danger">{error}</Alert>}

      <FilterPanel
        columns={4}
        activeCount={activeFilterCount}
        onClear={clearFilters}
      >
        <FormField
          id="employee-search"
          label="Search"
          hint="Searches name, employee number and email as you type."
        >
          <TextInput
            id="employee-search"
            aria-describedby={fieldDescribedBy("employee-search", { hint: true })}
            type="search"
            value={search}
            onChange={(event) =>
              changeFilter(() => setSearch(event.target.value))
            }
            placeholder="Name, employee number or email"
          />
        </FormField>

        <FormField
          id="department-filter"
          label="Department"
          hint={
            departmentsFailed ? "Unavailable - departments did not load." : undefined
          }
        >
          <SelectInput
            id="department-filter"
            aria-describedby={fieldDescribedBy("department-filter", { hint: departmentsFailed })}
            value={departmentFilter}
            onChange={(event) =>
              changeFilter(() => setDepartmentFilter(event.target.value))
            }
            disabled={departmentsFailed}
          >
            <option value="">All departments</option>
            {departments.map((department) => (
              <option key={department.id} value={String(department.id)}>
                {department.name}
              </option>
            ))}
          </SelectInput>
        </FormField>

        <FormField id="status-filter" label="Employment status">
          <SelectInput
            id="status-filter"
            value={employmentStatus}
            onChange={(event) =>
              changeFilter(() => setEmploymentStatus(event.target.value))
            }
          >
            <option value="">All statuses</option>
            {employmentStatuses.map((status) => (
              <option key={status} value={status}>
                {employmentStatusLabels[status]}
              </option>
            ))}
          </SelectInput>
        </FormField>

        <FormField id="job-title-filter" label="Job title">
          <SelectInput
            id="job-title-filter"
            value={jobTitle}
            onChange={(event) =>
              changeFilter(() => setJobTitle(event.target.value))
            }
          >
            <option value="">All job titles</option>
            {/* Keep the current selection listed even if it is not in the
                loaded options, so a filter cannot become unselectable. */}
            {(jobTitleOptions.includes(jobTitle) || !jobTitle
              ? jobTitleOptions
              : [...jobTitleOptions, jobTitle].sort((a, b) => a.localeCompare(b))
            ).map((title) => (
              <option key={title} value={title}>
                {title}
              </option>
            ))}
          </SelectInput>
        </FormField>
      </FilterPanel>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-base font-semibold text-fg">
            <Users size={18} className="text-primary" aria-hidden="true" />
            Employees
          </h2>

          {!isLoading && (
            <p className="text-sm text-fg-muted">
              <span className="font-semibold text-fg">{total}</span>{" "}
              {total === 1 ? "employee" : "employees"}
            </p>
          )}
        </div>

        <DataTable
          headers={tableHeaders}
          caption="Employees matching the current filters"
          minWidthClass="min-w-250"
          isLoading={isLoading}
          loadingLabel="Loading employees..."
          isEmpty={employees.length === 0}
          emptyState={
            activeFilterCount > 0 ? (
              <EmptyState
                icon={Users}
                title="No employees match these filters"
                description="Adjust or clear the filters to see more results."
                action={
                  <Button variant="secondary" size="sm" onClick={clearFilters}>
                    Clear all filters
                  </Button>
                }
              />
            ) : (
              <EmptyState
                icon={Users}
                title="No employees found"
                description="Add your first employee to get started."
                action={
                  <LinkButton
                    to="/admin/employees/new"
                    variant="secondary"
                    size="sm"
                    icon={Plus}
                  >
                    Add employee
                  </LinkButton>
                }
              />
            )
          }
        >
          {employees.map((employee) => {
            const isActive =
              employee.employmentStatus === "active" ||
              employee.employmentStatus === "probation";

            return (
              <tr key={employee.id}>
                <td className="px-5 py-4">
                  <p className="font-medium text-fg">{employee.fullName}</p>
                  <p className="mt-0.5 text-xs text-fg-subtle">
                    {employee.employeeNumber}
                  </p>
                </td>

                <td className="px-5 py-4 text-fg-muted">
                  {employee.jobTitle ?? "—"}
                </td>

                <td className="px-5 py-4 text-fg-muted">
                  {employee.departmentName ?? "—"}
                </td>

                <td className="px-5 py-4">
                  <StatusBadge
                    {...employmentStatusMeta(employee.employmentStatus)}
                  />
                </td>

                <td className="px-5 py-4">
                  <div className="flex flex-wrap gap-2">
                    <LinkButton
                      to={`/admin/employees/${employee.id}`}
                      variant="secondary"
                      size="sm"
                    >
                      View
                    </LinkButton>

                    <LinkButton
                      to={`/admin/employees/${employee.id}/edit`}
                      variant="secondary"
                      size="sm"
                    >
                      Edit
                    </LinkButton>

                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() =>
                        setPendingAction({
                          type: isActive ? "deactivate" : "reactivate",
                          employee,
                        })
                      }
                    >
                      {isActive ? "Deactivate" : "Reactivate"}
                    </Button>
                  </div>
                </td>
              </tr>
            );
          })}
        </DataTable>

        <Pagination
          page={Math.min(page, pageCount)}
          pageSize={PAGE_SIZE}
          totalItems={total}
          onPageChange={setPage}
          className="mt-3 rounded-card border border-line bg-surface shadow-card"
        />
      </section>

      <ConfirmationModal
        isOpen={pendingAction !== null}
        isProcessing={isProcessingAction}
        title={pendingCopy?.title ?? ""}
        description={
          pendingAction && pendingCopy
            ? pendingCopy.describe(pendingAction.employee.fullName)
            : ""
        }
        confirmLabel={pendingCopy?.confirmLabel ?? ""}
        processingLabel={pendingCopy?.processingLabel ?? ""}
        icon={pendingCopy?.icon}
        tone={pendingCopy?.tone}
        onCancel={() => {
          if (isProcessingAction) return;
          setPendingAction(null);
        }}
        onConfirm={() => void confirmPendingAction()}
      />
    </section>
  );
}
