import { Plus, UserCheck, UserMinus, Users } from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { getApiErrorMessage } from "../../api/axios";
import { getDepartments, type Department } from "../../api/departmentApi";
import {
  deleteEmployee,
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
import type { Employee } from "../../types/employee";
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
    describe: (name) => `Are you sure you want to deactivate ${name}?`,
  },
  reactivate: {
    title: "Reactivate employee?",
    confirmLabel: "Reactivate",
    // Not destructive, so this dialog is deliberately not red.
    tone: "primary",
    processingLabel: "Reactivating...",
    icon: <UserCheck size={21} />,
    describe: (name) => `Are you sure you want to reactivate ${name}?`,
  },
};

export default function EmployeeListPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [departmentsFailed, setDepartmentsFailed] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  // Server-side filters, all supported by GET /employees.
  const [search, setSearch] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("");
  const [employmentStatus, setEmploymentStatus] = useState("");

  // Client-side: the API has no job_title parameter, and the values come from
  // the rows already loaded.
  const [jobTitle, setJobTitle] = useState("");

  const [page, setPage] = useState(1);

  const [pendingAction, setPendingAction] = useState<PendingAction | null>(
    null,
  );
  const [isProcessingAction, setIsProcessingAction] = useState(false);

  // Only the free-text search is debounced: it is a server query, and the two
  // selects commit a single value per interaction.
  const debouncedSearch = useDebouncedValue(search, SEARCH_DEBOUNCE_MS);

  const loadEmployees = useCallback(async () => {
    try {
      setIsLoading(true);
      setError("");

      const data = await getEmployees({
        search: debouncedSearch || undefined,
        department: departmentFilter || undefined,
        employment_status: employmentStatus || undefined,
      });

      setEmployees(data);
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, "Unable to load employees."));
    } finally {
      setIsLoading(false);
    }
  }, [debouncedSearch, departmentFilter, employmentStatus]);

  // loadEmployees is a useCallback now, so it can be listed honestly here and
  // still be reused by the confirmation handlers below.
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

  // Options come from the server result, so they stay usable while the client
  // filter narrows the rows. The current selection is always kept present so a
  // filter cannot become unselectable after a refetch.
  const jobTitleOptions = useMemo(() => {
    const titles = new Set<string>();

    for (const employee of employees) {
      if (employee.jobTitle) titles.add(employee.jobTitle);
    }

    if (jobTitle) titles.add(jobTitle);

    return [...titles].sort((a, b) => a.localeCompare(b));
  }, [employees, jobTitle]);

  const visibleEmployees = useMemo(
    () =>
      jobTitle
        ? employees.filter((employee) => employee.jobTitle === jobTitle)
        : employees,
    [employees, jobTitle],
  );

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, departmentFilter, employmentStatus, jobTitle]);

  const pageCount = Math.max(1, Math.ceil(visibleEmployees.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);

  const pageEmployees = useMemo(
    () =>
      visibleEmployees.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE),
    [visibleEmployees, safePage],
  );

  const activeFilterCount = [
    search,
    departmentFilter,
    employmentStatus,
    jobTitle,
  ].filter(Boolean).length;

  function clearFilters() {
    setSearch("");
    setDepartmentFilter("");
    setEmploymentStatus("");
    setJobTitle("");
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
        <FormField id="employee-search" label="Search" hint="Searches as you type.">
          <TextInput
            id="employee-search"
            aria-describedby={fieldDescribedBy("employee-search", { hint: true })}
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Name or employee number"
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
            onChange={(event) => setDepartmentFilter(event.target.value)}
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
            onChange={(event) => setEmploymentStatus(event.target.value)}
          >
            <option value="">All statuses</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </SelectInput>
        </FormField>

        <FormField id="job-title-filter" label="Job title">
          <SelectInput
            id="job-title-filter"
            value={jobTitle}
            onChange={(event) => setJobTitle(event.target.value)}
          >
            <option value="">All job titles</option>
            {jobTitleOptions.map((title) => (
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
              <span className="font-semibold text-fg">
                {visibleEmployees.length}
              </span>{" "}
              {visibleEmployees.length === 1 ? "employee" : "employees"}
            </p>
          )}
        </div>

        <DataTable
          headers={tableHeaders}
          caption="Employees matching the current filters"
          minWidthClass="min-w-250"
          isLoading={isLoading}
          loadingLabel="Loading employees..."
          isEmpty={pageEmployees.length === 0}
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
          {pageEmployees.map((employee) => {
            const isActive = employee.employmentStatus === "active";

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
          page={safePage}
          pageSize={PAGE_SIZE}
          totalItems={visibleEmployees.length}
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
