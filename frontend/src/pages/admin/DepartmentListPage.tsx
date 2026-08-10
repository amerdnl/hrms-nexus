import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { deleteDepartment, getDepartments } from "../../api/departmentApi";
import { getApiErrorMessage } from "../../api/axios";
import type { Department } from "../../types/department";

export default function DepartmentListPage() {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  async function loadDepartments() {
    try {
      setIsLoading(true);
      setError("");

      const data = await getDepartments();
      setDepartments(data);
    } catch (error) {
      setError(getApiErrorMessage(error, "Unable to load departments."));
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadDepartments();
  }, []);

  async function handleDelete(id: number, name: string) {
    const confirmed = window.confirm(
      `Are you sure you want to delete the ${name} department?`,
    );

    if (!confirmed) {
      return;
    }

    try {
      setError("");
      await deleteDepartment(id);
      await loadDepartments();
    } catch (error) {
      setError(getApiErrorMessage(error, "Unable to delete department."));
    }
  }

  return (
    <section>
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">
            Department Management
          </h1>

          <p className="mt-1 text-sm text-slate-600">
            View and manage departments.
          </p>
        </div>

        <Link
          to="/admin/departments/new"
          className="rounded-lg bg-blue-600 px-4 py-2 text-center text-sm font-medium text-white hover:bg-blue-700"
        >
          Add Department
        </Link>
      </div>

      {error && (
        <div className="mt-4 rounded-lg bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="mt-6 overflow-hidden rounded-xl bg-white shadow-sm">
        {isLoading ? (
          <div className="p-6 text-sm text-slate-500">
            Loading departments...
          </div>
        ) : departments.length === 0 ? (
          <div className="p-6 text-sm text-slate-500">
            No departments found.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50">
                <tr>
                  <th className="px-5 py-3 font-medium text-slate-600">
                    Department
                  </th>

                  <th className="px-5 py-3 font-medium text-slate-600">
                    Description
                  </th>

                  <th className="px-5 py-3 font-medium text-slate-600">
                    Actions
                  </th>
                </tr>
              </thead>

              <tbody>
                {departments.map((department) => (
                  <tr
                    key={department.id}
                    className="border-b border-slate-100 last:border-b-0"
                  >
                    <td className="px-5 py-4">
                      <p className="font-medium text-slate-900">
                        {department.name}
                      </p>

                      <p className="mt-1 text-xs text-slate-500">
                        ID: {department.id}
                      </p>
                    </td>

                    <td className="px-5 py-4 text-slate-700">
                      {department.description || "-"}
                    </td>

                    <td className="px-5 py-4">
                      <div className="flex flex-wrap gap-3">
                        <Link
                          to={`/admin/departments/${department.id}`}
                          className="text-sm font-medium text-blue-600 hover:text-blue-700"
                        >
                          View
                        </Link>

                        <Link
                          to={`/admin/departments/${department.id}/edit`}
                          className="text-sm font-medium text-slate-600 hover:text-slate-800"
                        >
                          Edit
                        </Link>

                        <button
                          type="button"
                          onClick={() =>
                            void handleDelete(department.id, department.name)
                          }
                          className="text-sm font-medium text-red-600 hover:text-red-700"
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
