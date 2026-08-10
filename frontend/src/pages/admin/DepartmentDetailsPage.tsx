import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  getDepartmentById,
  getDepartmentEmployees,
} from "../../api/departmentApi";
import { getApiErrorMessage } from "../../api/axios";
import type {
  Department,
  DepartmentEmployee,
} from "../../types/department";

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
      } catch (error) {
        setError(
          getApiErrorMessage(
            error,
            "Unable to load department details.",
          ),
        );
      } finally {
        setIsLoading(false);
      }
    }

    void loadDepartment();
  }, [id]);

  if (isLoading) {
    return (
      <section>
        <p className="text-sm text-slate-500">
          Loading department...
        </p>
      </section>
    );
  }

  if (error) {
    return (
      <section>
        <div className="rounded-lg bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>

        <Link
          to="/admin/departments"
          className="mt-4 inline-block text-sm font-medium text-blue-600 hover:text-blue-700"
        >
          ← Back to Departments
        </Link>
      </section>
    );
  }

  if (!department) {
    return null;
  }

  return (
    <section>
      <div>
        <Link
          to="/admin/departments"
          className="text-sm font-medium text-blue-600 hover:text-blue-700"
        >
          ← Back to Departments
        </Link>

        <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">
              {department.name}
            </h1>

            <p className="mt-1 text-sm text-slate-600">
              {department.description || "No description provided."}
            </p>
          </div>

          <Link
            to={`/admin/departments/${department.id}/edit`}
            className="rounded-lg bg-blue-600 px-4 py-2 text-center text-sm font-medium text-white hover:bg-blue-700"
          >
            Edit Department
          </Link>
        </div>
      </div>

      <div className="mt-6 rounded-xl bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">
          Department Information
        </h2>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <p className="text-xs font-medium uppercase text-slate-500">
              Department ID
            </p>
            <p className="mt-1 text-sm text-slate-900">
              {department.id}
            </p>
          </div>

          <div>
            <p className="text-xs font-medium uppercase text-slate-500">
              Created
            </p>
            <p className="mt-1 text-sm text-slate-900">
              {new Date(department.created_at).toLocaleDateString()}
            </p>
          </div>
        </div>
      </div>

      <div className="mt-6 overflow-hidden rounded-xl bg-white shadow-sm">
        <div className="border-b border-slate-200 p-5">
          <h2 className="text-lg font-semibold text-slate-900">
            Employees
          </h2>

          <p className="mt-1 text-sm text-slate-500">
            {employees.length} employee
            {employees.length === 1 ? "" : "s"} in this department.
          </p>
        </div>

        {employees.length === 0 ? (
          <div className="p-5 text-sm text-slate-500">
            No employees are assigned to this department.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50">
                <tr>
                  <th className="px-5 py-3 font-medium text-slate-600">
                    Employee
                  </th>
                  <th className="px-5 py-3 font-medium text-slate-600">
                    Job Title
                  </th>
                  <th className="px-5 py-3 font-medium text-slate-600">
                    Status
                  </th>
                </tr>
              </thead>

              <tbody>
                {employees.map((employee) => (
                  <tr
                    key={employee.id}
                    className="border-b border-slate-100 last:border-b-0"
                  >
                    <td className="px-5 py-4">
                      <p className="font-medium text-slate-900">
                        {employee.full_name}
                      </p>

                      <p className="mt-1 text-xs text-slate-500">
                        {employee.employee_number}
                      </p>
                    </td>

                    <td className="px-5 py-4 text-slate-700">
                      {employee.job_title || "-"}
                    </td>

                    <td className="px-5 py-4">
                      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium capitalize text-slate-600">
                        {employee.employment_status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
