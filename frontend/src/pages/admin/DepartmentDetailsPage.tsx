import { Building2, Pencil, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { getApiErrorMessage } from "../../api/axios";
import {
  getDepartmentById,
  getDepartmentEmployees,
} from "../../api/departmentApi";
import Alert from "../../components/ui/Alert";
import DataTable from "../../components/ui/DataTable";
import EmptyState from "../../components/ui/EmptyState";
import LinkButton from "../../components/ui/LinkButton";
import PageHeader from "../../components/ui/PageHeader";
import SectionCard from "../../components/ui/SectionCard";
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

  if (isLoading) {
    return <p className="text-sm text-fg-muted">Loading department...</p>;
  }

  if (error) {
    return (
      <section className="space-y-4">
        <Alert tone="danger">{error}</Alert>

        <LinkButton to="/admin/departments" variant="secondary">
          Back to departments
        </LinkButton>
      </section>
    );
  }

  if (!department) {
    return null;
  }

  return (
    <section className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        title={department.name}
        description={department.description || "No description provided."}
        backTo="/admin/departments"
        backLabel="Back to departments"
        actions={
          <LinkButton
            to={`/admin/departments/${department.id}/edit`}
            icon={Pencil}
          >
            Edit department
          </LinkButton>
        }
      />

      <SectionCard title="Department information" icon={Building2}>
        <dl className="grid gap-5 sm:grid-cols-2">
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-fg-subtle">
              Department ID
            </dt>
            <dd className="mt-1 text-sm font-medium text-fg">
              {department.id}
            </dd>
          </div>

          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-fg-subtle">
              Created
            </dt>
            <dd className="mt-1 text-sm font-medium text-fg">
              {formatDateTime(department.created_at)}
            </dd>
          </div>
        </dl>
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
                <p className="font-medium text-fg">{employee.full_name}</p>
                <p className="mt-0.5 text-xs text-fg-subtle">
                  {employee.employee_number}
                </p>
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
