import { IdCard, Pencil } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { useParams } from "react-router-dom";
import { getApiErrorMessage } from "../../api/axios";
import { getEmployeeById } from "../../api/employeeApi";
import Alert from "../../components/ui/Alert";
import LinkButton from "../../components/ui/LinkButton";
import PageHeader from "../../components/ui/PageHeader";
import SectionCard from "../../components/ui/SectionCard";
import StatusBadge from "../../components/ui/StatusBadge";
import type { Employee } from "../../types/employee";
import { formatDate } from "../../utils/datetime";
import { employmentStatusMeta } from "../../utils/status";

function Detail({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={className}>
      <dt className="text-xs font-semibold uppercase tracking-wide text-fg-subtle">
        {label}
      </dt>
      <dd className="mt-1 text-sm font-medium text-fg">{children}</dd>
    </div>
  );
}

export default function EmployeeDetailsPage() {
  const { id } = useParams<{ id: string }>();

  const [employee, setEmployee] = useState<Employee | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadEmployee() {
      if (!id) {
        setError("Employee ID is missing.");
        setIsLoading(false);
        return;
      }

      try {
        const data = await getEmployeeById(Number(id));
        setEmployee(data);
      } catch (requestError) {
        setError(getApiErrorMessage(requestError, "Unable to load employee."));
      } finally {
        setIsLoading(false);
      }
    }

    void loadEmployee();
  }, [id]);

  if (isLoading) {
    return <p className="text-sm text-fg-muted">Loading employee...</p>;
  }

  if (error) {
    return <Alert tone="danger">{error}</Alert>;
  }

  if (!employee) {
    return null;
  }

  return (
    <section className="mx-auto max-w-4xl space-y-6">
      <PageHeader
        title="Employee details"
        description="View employee information."
        backTo="/admin/employees"
        backLabel="Back to employees"
        actions={
          <LinkButton to={`/admin/employees/${employee.id}/edit`} icon={Pencil}>
            Edit employee
          </LinkButton>
        }
      />

      <SectionCard title={employee.fullName} icon={IdCard}>
        <dl className="grid gap-5 sm:grid-cols-2">
          <Detail label="Employee number">{employee.employeeNumber}</Detail>

          <Detail label="Employment status">
            <StatusBadge {...employmentStatusMeta(employee.employmentStatus)} />
          </Detail>

          <Detail label="Job title">{employee.jobTitle ?? "—"}</Detail>

          <Detail label="Department">{employee.departmentName ?? "—"}</Detail>

          <Detail label="Phone">{employee.phone ?? "—"}</Detail>

          <Detail label="Gender">{employee.gender ?? "—"}</Detail>

          <Detail label="Date of birth">
            {employee.dateOfBirth ? formatDate(employee.dateOfBirth) : "—"}
          </Detail>

          <Detail label="Employment date">
            {employee.employmentDate
              ? formatDate(employee.employmentDate)
              : "—"}
          </Detail>

          <Detail label="Emergency contact">
            {employee.emergencyContactName ?? "—"}
          </Detail>

          <Detail label="Emergency contact phone">
            {employee.emergencyContactPhone ?? "—"}
          </Detail>

          <Detail label="Address" className="sm:col-span-2">
            {employee.address ?? "—"}
          </Detail>
        </dl>
      </SectionCard>
    </section>
  );
}
