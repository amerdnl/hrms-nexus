import { Building2, Pencil, Users } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import { getApiErrorMessage } from "../../api/axios";
import {
  getDepartmentById,
  getDepartmentEmployees,
} from "../../api/departmentApi";
import Avatar from "../../components/ui/Avatar";
import DataTable from "../../components/ui/DataTable";
import DescriptionList from "../../components/ui/DescriptionList";
import EmptyState from "../../components/ui/EmptyState";
import ErrorState from "../../components/ui/ErrorState";
import LinkButton from "../../components/ui/LinkButton";
import PageHeader from "../../components/ui/PageHeader";
import RecordCard from "../../components/ui/RecordCard";
import SectionCard from "../../components/ui/SectionCard";
import Skeleton, { SkeletonText } from "../../components/ui/Skeleton";
import StatusBadge from "../../components/ui/StatusBadge";
import type { Department, DepartmentEmployee } from "../../types/department";
import { formatDateTime } from "../../utils/datetime";
import { employmentStatusMeta } from "../../utils/status";

const tableHeaders = ["Employee", "Job title", "Status"];

export default function DepartmentDetailsPage() {
  const { id } = useParams<{ id: string }>();

  const [department, setDepartment] = useState<Department | null>(null);
  const [employees, setEmployees] = useState<DepartmentEmployee[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadDepartment() {
      if (!id) {
        setError("Department ID is missing.");
        setIsLoading(false);
        return;
      }

      try {
        setIsLoading(true);
        setError("");

        const departmentId = Number(id);

        const [departmentData, employeeData] = await Promise.all([
          getDepartmentById(departmentId),
          getDepartmentEmployees(departmentId),
        ]);

        setDepartment(departmentData);
        setEmployees(employeeData);
      } catch (requestError) {
        setError(
          getApiErrorMessage(requestError, "Unable to load department details."),
        );
      } finally {
        setIsLoading(false);
      }
    }

    void loadDepartment();
  }, [id]);

  // Same frame as the employee record: a generic page title, with the
  // identity card below owning the department's name, so the name is not
  // printed twice one above the other.
  const header = (actions?: ReactNode) => (
    <PageHeader
      title="Department details"
      description="View the department and who is assigned to it."
      backTo="/admin/departments"
      backLabel="Back to departments"
      actions={actions}
    />
  );

  if (isLoading) {
    return (
      <section className="mx-auto max-w-5xl space-y-6" aria-busy="true">
        {header()}
        <p className="sr-only" aria-live="polite">Loading department</p>
        <SectionCard>
          <div className="flex items-center gap-4">
            <Skeleton className="h-14 w-14 rounded-2xl" />
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-5 w-48" />
              <Skeleton className="h-3.5 w-64 max-w-full" />
            </div>
          </div>
        </SectionCard>
        <SectionCard>
          <SkeletonText lines={5} />
        </SectionCard>
      </section>
    );
  }

  if (error || !department) {
    return (
      <section className="mx-auto max-w-5xl space-y-6">
        {header()}
        <SectionCard>
          <ErrorState
            title="This department could not be loaded"
            description={error || "The record is unavailable."}
          />
        </SectionCard>
      </section>
    );
  }

  return (
    <section className="mx-auto max-w-5xl space-y-6">
      {header(
          <LinkButton
            to={`/admin/departments/${department.id}/edit`}
            icon={Pencil}
          >
            Edit department
          </LinkButton>,
      )}

      {/* Identity header, matching the references: the mark, the name, the
          headcount and the description in one band above the roster. */}
      <SectionCard>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <span
            className="mx-auto grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-primary-soft text-primary sm:mx-0"
            aria-hidden="true"
          >
            <Building2 size={26} />
          </span>

          <div className="min-w-0 flex-1 text-center sm:text-left">
            <h2 className="text-xl font-bold tracking-tight text-fg [overflow-wrap:anywhere]">
              {department.name}
            </h2>
            <p className="mt-1 text-sm text-fg-muted">
              {department.description || "No description recorded."}
            </p>
          </div>

          <div className="text-center sm:text-right">
            <p className="text-3xl font-bold tracking-tight text-fg">
              {employees.length}
            </p>
            <p className="text-xs text-fg-subtle">
              {employees.length === 1 ? "employee" : "employees"}
            </p>
          </div>
        </div>

        <DescriptionList
          className="mt-5 border-t border-line pt-5"
          items={[
            { label: "Department ID", value: department.id },
            { label: "Created", value: formatDateTime(department.created_at) },
          ]}
        />
      </SectionCard>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-base font-semibold text-fg">
            <Users size={18} className="text-primary" aria-hidden="true" />
            Employees
          </h2>

          {/* Every employee assigned to this department, active or not - which
              is why the departments list labels its column "Active employees"
              rather than reusing this figure. */}
          <p className="text-sm text-fg-muted">
            {employees.length} employee{employees.length === 1 ? "" : "s"} in
            this department.
          </p>
        </div>

        <DataTable
          headers={tableHeaders}
          caption={`Employees assigned to ${department.name}`}
          isEmpty={employees.length === 0}
          mobileCards={employees.map((employee) => (
            <RecordCard
              key={employee.id}
              leading={<Avatar name={employee.full_name} size="md" />}
              title={employee.full_name}
              subtitle={employee.employee_number}
              badge={
                <StatusBadge
                  {...employmentStatusMeta(employee.employment_status)}
                />
              }
              meta={[{ label: "Job title", value: employee.job_title || "\u2014" }]}
              to={`/admin/employees/${employee.id}`}
            />
          ))}
          emptyState={
            <EmptyState
              icon={Users}
              title="No employees assigned"
              description="No employees are assigned to this department."
            />
          }
        >
          {employees.map((employee) => (
            <tr key={employee.id}>
              <td className="px-5 py-4">
                {/* Initials only: the roster payload carries no photo. */}
                <div className="flex items-center gap-3">
                  <Avatar name={employee.full_name} size="sm" />
                  <div className="min-w-0">
                    <Link
                      to={`/admin/employees/${employee.id}`}
                      className="font-medium text-fg hover:text-primary hover:underline focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                    >
                      {employee.full_name}
                    </Link>
                    <p className="mt-0.5 text-xs text-fg-subtle">
                      {employee.employee_number}
                    </p>
                  </div>
                </div>
              </td>

              <td className="px-5 py-4 text-fg-muted">
                {employee.job_title || "—"}
              </td>

              <td className="px-5 py-4">
                <StatusBadge
                  {...employmentStatusMeta(employee.employment_status)}
                />
              </td>
            </tr>
          ))}
        </DataTable>
      </section>
    </section>
  );
}
