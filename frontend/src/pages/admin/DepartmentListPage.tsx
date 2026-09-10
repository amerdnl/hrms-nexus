import { Building2, Ellipsis, Pencil, Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getApiErrorMessage } from "../../api/axios";
import { deleteDepartment, getDepartments } from "../../api/departmentApi";
import ConfirmationModal from "../../components/common/ConfirmationModal";
import Alert from "../../components/ui/Alert";
import Button from "../../components/ui/Button";
import DropdownMenu from "../../components/ui/DropdownMenu";
import EmptyState from "../../components/ui/EmptyState";
import FormField from "../../components/ui/FormField";
import LinkButton from "../../components/ui/LinkButton";
import PageHeader from "../../components/ui/PageHeader";
import ProgressBar from "../../components/ui/ProgressBar";
import Skeleton, { SkeletonText } from "../../components/ui/Skeleton";
import TextInput from "../../components/ui/TextInput";
import type { Department } from "../../types/department";

export default function DepartmentListPage() {
  const navigate = useNavigate();
  const [departments, setDepartments] = useState<Department[]>([]);
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

        {isLoading ? (
          <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }, (_, index) => (
              <li
                key={index}
                className="rounded-card border border-line bg-surface p-5 shadow-card"
              >
                <Skeleton className="h-11 w-11 rounded-xl" />
                <Skeleton className="mt-4 h-4 w-32" />
                <Skeleton className="mt-2 h-3 w-24" />
                <SkeletonText lines={2} className="mt-4" />
              </li>
            ))}
          </ul>
        ) : visibleDepartments.length === 0 ? (
          <div className="rounded-card border border-line bg-surface shadow-card">
            {search ? (
              <EmptyState
                icon={Building2}
                title="No departments match your search"
                description="Try a different name or clear the search box."
                action={
                  <Button variant="secondary" size="sm" onClick={() => setSearch("")}>
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
            )}
          </div>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {visibleDepartments.map((department) => {
              // Both counts are aggregated server-side. Active counts employees
              // whose status still grants a sign-in, so it is deliberately
              // smaller than the full membership the details page lists.
              const total = department.employee_count ?? 0;
              const active = department.active_employee_count ?? 0;

              return (
                <li
                  key={department.id}
                  className="flex flex-col rounded-card border border-line bg-surface p-5 shadow-card transition-colors hover:border-control-border"
                >
                  <div className="flex items-start justify-between gap-3">
                    <span
                      className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary"
                      aria-hidden="true"
                    >
                      <Building2 size={20} />
                    </span>

                    <DropdownMenu
                      label={`Actions for ${department.name}`}
                      className="h-9 w-9"
                      trigger={<Ellipsis size={18} aria-hidden="true" />}
                      items={[
                        {
                          key: "edit",
                          label: "Edit department",
                          icon: <Pencil size={16} aria-hidden="true" />,
                          onSelect: () =>
                            navigate(`/admin/departments/${department.id}/edit`),
                        },
                        {
                          key: "delete",
                          label: "Delete department",
                          icon: <Trash2 size={16} aria-hidden="true" />,
                          tone: "danger" as const,
                          onSelect: () => setPendingDelete(department),
                        },
                      ]}
                    />
                  </div>

                  <h3 className="mt-4 truncate text-base font-semibold text-fg">
                    {department.name}
                  </h3>

                  <p className="mt-1 text-sm text-fg-muted">
                    <span className="font-semibold text-fg">{active}</span> active
                    {total > 0 && total !== active ? ` of ${total}` : ""}{" "}
                    {total === 1 ? "employee" : "employees"}
                  </p>

                  {/* Only drawn when there is a whole to be a part of. With no
                      members the bar would sit empty and read as a loading
                      state rather than as zero. */}
                  {total > 0 && (
                    <ProgressBar
                      className="mt-3"
                      size="sm"
                      value={active}
                      max={total}
                      label={`${active} of ${total} employees active in ${department.name}`}
                      isDecorative
                    />
                  )}

                  <p className="mt-3 line-clamp-2 min-h-10 text-sm text-fg-muted">
                    {department.description || "No description recorded."}
                  </p>

                  <div className="mt-4 border-t border-line pt-4">
                    <LinkButton
                      to={`/admin/departments/${department.id}`}
                      variant="secondary"
                      size="sm"
                      fullWidth
                    >
                      View department
                    </LinkButton>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
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
