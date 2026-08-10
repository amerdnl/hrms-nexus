import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  getEmployees,
  deleteEmployee,
  reactivateEmployee,
  permanentlyDeleteEmployee,
} from "../../api/employeeApi";
import { getApiErrorMessage } from "../../api/axios";
import type { Employee } from "../../types/employee";

export default function EmployeeListPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  const [search, setSearch] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [employmentStatus, setEmploymentStatus] = useState("");

  async function loadEmployees() {
    try {
      setIsLoading(true);
      setError("");

      const data = await getEmployees({
        search: search || undefined,
        department_id: departmentId ? Number(departmentId) : undefined,
        employment_status: employmentStatus || undefined,
      });

      setEmployees(data);
    } catch (error) {
      setError(getApiErrorMessage(error, "Unable to load employees."));
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadEmployees();
  }, [search, departmentId, employmentStatus]);

  async function handleDeactivate(id: number, name: string) {
    const confirmed = window.confirm(
      `Are you sure you want to deactivate ${name}?`,
    );

    if (!confirmed) {
      return;
    }

    try {
      await deleteEmployee(id);
      await loadEmployees();
    } catch (error) {
      setError(getApiErrorMessage(error, "Unable to deactivate employee."));
    }
  }

  async function handlePermanentDelete(id: number, name: string) {
    const confirmed = window.confirm(
      `WARNING: This will permanently delete ${name} and all associated records. This action cannot be undone. Are you sure?`,
    );

    if (!confirmed) {
      return;
    }

    try {
      setError("");

      await permanentlyDeleteEmployee(id);
      await loadEmployees();
    } catch (error) {
      setError(
        getApiErrorMessage(error, "Unable to permanently delete employee."),
      );
    }
  }

  async function handleReactivate(id: number, name: string) {
    const confirmed = window.confirm(
      `Are you sure you want to reactivate ${name}?`,
    );

    if (!confirmed) {
      return;
    }

    try {
      setError("");
      await reactivateEmployee(id);
      await loadEmployees();
    } catch (error) {
      setError(getApiErrorMessage(error, "Unable to reactivate employee."));
    }
  }

  return (
    <section>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">
            Employee Management
          </h1>

          <p className="mt-1 text-sm text-slate-600">
            View and manage employees.
          </p>
        </div>

        <Link
          to="/admin/employees/new"
          className="rounded-lg bg-blue-600 px-4 py-2 text-center text-sm font-medium text-white hover:bg-blue-700"
        >
          Add Employee
        </Link>
      </div>

      <div className="mt-6 rounded-xl bg-white p-5 shadow-sm">
        <div className="grid gap-4 md:grid-cols-3">
          <div>
            <label
              htmlFor="employee-search"
              className="mb-1 block text-sm font-medium text-slate-700"
            >
              Search
            </label>

            <input
              id="employee-search"
              type="text"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Name or employee number"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <div>
            <label
              htmlFor="department-filter"
              className="mb-1 block text-sm font-medium text-slate-700"
            >
              Department ID
            </label>

            <input
              id="department-filter"
              type="number"
              min="1"
              value={departmentId}
              onChange={(event) => setDepartmentId(event.target.value)}
              placeholder="e.g. 1"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <div>
            <label
              htmlFor="status-filter"
              className="mb-1 block text-sm font-medium text-slate-700"
            >
              Employment Status
            </label>

            <select
              id="status-filter"
              value={employmentStatus}
              onChange={(event) => setEmploymentStatus(event.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            >
              <option value="">All statuses</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>
        </div>
      </div>

      {error && (
        <div className="mt-4 rounded-lg bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="mt-6 overflow-hidden rounded-xl bg-white shadow-sm">
        {isLoading ? (
          <div className="p-6 text-sm text-slate-500">Loading employees...</div>
        ) : employees.length === 0 ? (
          <div className="p-6 text-sm text-slate-500">No employees found.</div>
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
                    Department
                  </th>
                  <th className="px-5 py-3 font-medium text-slate-600">
                    Status
                  </th>
                  <th className="px-5 py-3 font-medium text-slate-600">
                    Actions
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
                        {employee.fullName}
                      </p>

                      <p className="mt-1 text-xs text-slate-500">
                        {employee.employeeNumber}
                      </p>
                    </td>

                    <td className="px-5 py-4 text-slate-700">
                      {employee.jobTitle ?? "-"}
                    </td>

                    <td className="px-5 py-4 text-slate-700">
                      {employee.departmentName ?? "-"}
                    </td>

                    <td className="px-5 py-4">
                      <span
                        className={
                          employee.employmentStatus === "active"
                            ? "rounded-full bg-green-100 px-2.5 py-1 text-xs font-medium text-green-700"
                            : "rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600"
                        }
                      >
                        {employee.employmentStatus}
                      </span>
                    </td>

                    <td className="px-5 py-4">
                      <div className="flex flex-wrap gap-3">
                        <Link
                          to={`/admin/employees/${employee.id}`}
                          className="text-sm font-medium text-blue-600 hover:text-blue-700"
                        >
                          View
                        </Link>

                        <Link
                          to={`/admin/employees/${employee.id}/edit`}
                          className="text-sm font-medium text-slate-600 hover:text-slate-800"
                        >
                          Edit
                        </Link>

                        {employee.employmentStatus === "active" ? (
                          <button
                            type="button"
                            onClick={() =>
                              void handleDeactivate(
                                employee.id,
                                employee.fullName,
                              )
                            }
                            className="text-sm font-medium text-red-600 hover:text-red-700"
                          >
                            Deactivate
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() =>
                              void handleReactivate(
                                employee.id,
                                employee.fullName,
                              )
                            }
                            className="text-sm font-medium text-green-600 hover:text-green-700"
                          >
                            Reactivate
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() =>
                            void handlePermanentDelete(
                              employee.id,
                              employee.fullName,
                            )
                          }
                          className="text-sm font-medium text-red-800 hover:text-red-900"
                        >
                          Delete
                        </button>
                      </div>
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
