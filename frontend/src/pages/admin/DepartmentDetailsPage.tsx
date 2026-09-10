import { Building2, Pencil, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { getApiErrorMessage } from "../../api/axios";
import {
  getDepartmentById,
  getDepartmentEmployees,
} from "../../api/departmentApi";
import Alert from "../../components/ui/Alert";
import Avatar from "../../components/ui/Avatar";
import DataTable from "../../components/ui/DataTable";
import DescriptionList from "../../components/ui/DescriptionList";
import EmptyState from "../../components/ui/EmptyState";
import LinkButton from "../../components/ui/LinkButton";
import PageHeader from "../../components/ui/PageHeader";
import RecordCard from "../../components/ui/RecordCard";
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
            <h2 className="truncate text-xl font-bold tracking-tight text-fg">
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
