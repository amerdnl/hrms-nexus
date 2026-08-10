import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { getEmployeeById } from "../../api/employeeApi";
import { getApiErrorMessage } from "../../api/axios";
import type { Employee } from "../../types/employee";

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
      } catch (error) {
        setError(getApiErrorMessage(error, "Unable to load employee."));
      } finally {
        setIsLoading(false);
      }
    }

    void loadEmployee();
  }, [id]);

  if (isLoading) {
    return <div className="text-sm text-slate-500">Loading employee...</div>;
  }

  if (error) {
    return (
      <div className="rounded-lg bg-red-50 p-4 text-sm text-red-700">
        {error}
      </div>
    );
  }

  if (!employee) {
    return null;
  }

  return (
    <section>
      <div>
        <Link
          to="/admin/employees"
          className="text-sm font-medium text-blue-600 hover:text-blue-700"
        >
          ← Back to Employees
        </Link>

        <h1 className="mt-3 text-2xl font-semibold text-slate-900">
          Employee Details
        </h1>

        <p className="mt-1 text-sm text-slate-600">
          View employee information.
        </p>
      </div>

      <div className="mt-6 rounded-xl bg-white p-6 shadow-sm">
        <div className="grid gap-6 md:grid-cols-2">
          <div>
            <p className="text-sm text-slate-500">Full Name</p>
            <p className="mt-1 font-medium text-slate-900">
              {employee.fullName}
            </p>
          </div>

          <div>
            <p className="text-sm text-slate-500">Employee Number</p>
            <p className="mt-1 font-medium text-slate-900">
              {employee.employeeNumber}
            </p>
          </div>

          <div>
            <p className="text-sm text-slate-500">Job Title</p>
            <p className="mt-1 text-slate-700">{employee.jobTitle ?? "-"}</p>
          </div>

          <div>
            <p className="text-sm text-slate-500">Department</p>
            <p className="mt-1 text-slate-700">
              {employee.departmentName ?? "-"}
            </p>
          </div>

          <div>
            <p className="text-sm text-slate-500">Phone</p>
            <p className="mt-1 text-slate-700">{employee.phone ?? "-"}</p>
          </div>

          <div>
            <p className="text-sm text-slate-500">Gender</p>
            <p className="mt-1 text-slate-700">{employee.gender ?? "-"}</p>
          </div>

          <div>
            <p className="text-sm text-slate-500">Date of Birth</p>
            <p className="mt-1 text-slate-700">
              {employee.dateOfBirth ? employee.dateOfBirth.slice(0, 10) : "-"}
            </p>
          </div>

          <div>
            <p className="text-sm text-slate-500">Employment Date</p>
            <p className="mt-1 text-slate-700">
              {employee.employmentDate
                ? employee.employmentDate.slice(0, 10)
                : "-"}
            </p>
          </div>

          <div>
            <p className="text-sm text-slate-500">Employment Status</p>
            <p className="mt-1 text-slate-700 capitalize">
              {employee.employmentStatus}
            </p>
          </div>

          <div>
            <p className="text-sm text-slate-500">Address</p>
            <p className="mt-1 text-slate-700">{employee.address ?? "-"}</p>
          </div>

          <div>
            <p className="text-sm text-slate-500">Emergency Contact</p>
            <p className="mt-1 text-slate-700">
              {employee.emergencyContactName ?? "-"}
            </p>
          </div>

          <div>
            <p className="text-sm text-slate-500">Emergency Contact Phone</p>
            <p className="mt-1 text-slate-700">
              {employee.emergencyContactPhone ?? "-"}
            </p>
          </div>
        </div>

        <div className="mt-6 border-t border-slate-200 pt-6">
          <Link
            to={`/admin/employees/${employee.id}/edit`}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Edit Employee
          </Link>
        </div>
      </div>
    </section>
  );
}
