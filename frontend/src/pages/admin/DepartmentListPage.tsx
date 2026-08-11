import { Building2, Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { getApiErrorMessage } from "../../api/axios";
import { deleteDepartment, getDepartments } from "../../api/departmentApi";
import { getEmployees } from "../../api/employeeApi";
import ConfirmationModal from "../../components/common/ConfirmationModal";
import Alert from "../../components/ui/Alert";
import Button from "../../components/ui/Button";
import DataTable from "../../components/ui/DataTable";
import EmptyState from "../../components/ui/EmptyState";
import FormField from "../../components/ui/FormField";
import LinkButton from "../../components/ui/LinkButton";
import PageHeader from "../../components/ui/PageHeader";
import TextInput from "../../components/ui/TextInput";
import type { Department } from "../../types/department";
import type { Employee } from "../../types/employee";

const tableHeaders = [
  "Department",
  "Description",
  "Active employees",
  "Actions",
];

export default function DepartmentListPage() {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [employeesFailed, setEmployeesFailed] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  // Local filtering over a list that is typically a handful of rows, so it is
  // applied directly - debouncing this would add latency for no benefit.
  const [search, setSearch] = useState("");

  const [pendingDelete, setPendingDelete] = useState<Department | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const loadDepartments = useCallback(async () => {
    try {
      setIsLoading(true);
      setError("");

      const data = await getDepartments();
      setDepartments(data);
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, "Unable to load departments."));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadDepartments();
  }, [loadDepartments]);

  /**
   * Head-count source. Isolated from loadDepartments: if it fails the table
   * still lists departments and the count column reads "—".
   */
  const loadEmployees = useCallback(async () => {
    try {
      setEmployees(await getEmployees());
      setEmployeesFailed(false);
    } catch {
      setEmployeesFailed(true);
    }
  }, []);

  useEffect(() => {
    void loadEmployees();
  }, [loadEmployees]);

  /**
   * ACTIVE employees per department, counted client-side from the existing
   * /employees payload - no new endpoint.
   *
   * Counting active only is why the column is labelled "Active employees":
   * this number is deliberately not the same as the total the department
   * details page lists, which includes inactive staff.
   */
  const activeCountByDepartment = useMemo(() => {
    const counts = new Map<number, number>();

    for (const employee of employees) {
      if (employee.employmentStatus !== "active") continue;
      if (employee.departmentId === null) continue;

      counts.set(
        employee.departmentId,
        (counts.get(employee.departmentId) ?? 0) + 1,
      );
    }

    return counts;
  }, [employees]);

  const visibleDepartments = useMemo(() => {
    const term = search.trim().toLowerCase();

    if (!term) return departments;

    return departments.filter(
      (department) =>
        department.name.toLowerCase().includes(term) ||
        (department.description ?? "").toLowerCase().includes(term),
    );
  }, [departments, search]);

  async function confirmDelete() {
    if (!pendingDelete) return;

    setIsDeleting(true);

    try {
      setError("");
      await deleteDepartment(pendingDelete.id);
      await loadDepartments();
      // Head counts change when a department goes away.
      await loadEmployees();
    } catch (requestError) {
      // Includes the backend's 409 when employees are still assigned; the
      // message is surfaced verbatim rather than replaced.
      setError(getApiErrorMessage(requestError, "Unable to delete department."));
    } finally {
      setIsDeleting(false);
      setPendingDelete(null);
    }
  }

  return (
    <section className="mx-auto max-w-7xl space-y-6">
      <PageHeader
        title="Department management"
        description="View and manage departments."
        actions={
          <LinkButton to="/admin/departments/new" icon={Plus}>
            Add department
          </LinkButton>
        }
      />

      {error && <Alert tone="danger">{error}</Alert>}

      {employeesFailed && (
        <Alert tone="warning">
          Employee data could not be loaded, so active employee counts are
          unavailable. Departments themselves are unaffected.
        </Alert>
      )}

      <div className="rounded-card border border-line bg-surface p-5 shadow-card">
        <FormField
          id="department-search"
          label="Search departments"
          className="max-w-md"
        >
          <TextInput
            id="department-search"
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by name or description"
          />
        </FormField>
      </div>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-base font-semibold text-fg">
            <Building2 size={18} className="text-primary" aria-hidden="true" />
            Departments
          </h2>

          {!isLoading && (
            <p className="text-sm text-fg-muted">
              <span className="font-semibold text-fg">
                {visibleDepartments.length}
              </span>{" "}
              {visibleDepartments.length === 1 ? "department" : "departments"}
            </p>
          )}
        </div>

        <DataTable
          headers={tableHeaders}
          caption="Departments and their active employee counts"
          minWidthClass="min-w-200"
          isLoading={isLoading}
          loadingLabel="Loading departments..."
          isEmpty={visibleDepartments.length === 0}
          emptyState={
            search ? (
              <EmptyState
                icon={Building2}
                title="No departments match your search"
                description="Try a different name or clear the search box."
                action={
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setSearch("")}
                  >
                    Clear search
                  </Button>
                }
              />
            ) : (
              <EmptyState
                icon={Building2}
                title="No departments found"
                description="Create a department to start organising employees."
                action={
                  <LinkButton
                    to="/admin/departments/new"
                    variant="secondary"
                    size="sm"
                    icon={Plus}
                  >
                    Add department
                  </LinkButton>
                }
              />
            )
          }
        >
          {visibleDepartments.map((department) => (
            <tr key={department.id}>
              <td className="px-5 py-4">
                <p className="font-medium text-fg">{department.name}</p>
                <p className="mt-0.5 text-xs text-fg-subtle">
                  ID: {department.id}
                </p>
              </td>

              <td className="max-w-72 px-5 py-4 text-fg-muted">
                {department.description || "—"}
              </td>

              <td className="px-5 py-4 text-fg-muted">
                {employeesFailed
                  ? "—"
                  : (activeCountByDepartment.get(department.id) ?? 0)}
              </td>

              <td className="px-5 py-4">
                <div className="flex flex-wrap gap-2">
                  <LinkButton
                    to={`/admin/departments/${department.id}`}
                    variant="secondary"
                    size="sm"
                  >
                    View
                  </LinkButton>

                  <LinkButton
                    to={`/admin/departments/${department.id}/edit`}
                    variant="secondary"
                    size="sm"
                  >
                    Edit
                  </LinkButton>

                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => setPendingDelete(department)}
                  >
                    Delete
                  </Button>
                </div>
              </td>
            </tr>
          ))}
        </DataTable>
      </section>

      <ConfirmationModal
        isOpen={pendingDelete !== null}
        isProcessing={isDeleting}
        title="Delete department?"
        description={
          pendingDelete
            ? `Are you sure you want to delete the ${pendingDelete.name} department?`
            : ""
        }
        confirmLabel="Delete"
        processingLabel="Deleting..."
        icon={<Trash2 size={21} />}
        onCancel={() => {
          if (isDeleting) return;
          setPendingDelete(null);
        }}
        onConfirm={() => void confirmDelete()}
      />
    </section>
  );
}
