import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { getDepartmentById, updateDepartment } from "../../api/departmentApi";
import { getApiErrorMessage } from "../../api/axios";

export default function DepartmentEditPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadDepartment() {
      if (!id) {
        setError("Department ID is missing.");
        setIsLoading(false);
        return;
      }

      try {
        const department = await getDepartmentById(Number(id));

        setName(department.name);
        setDescription(department.description ?? "");
      } catch (error) {
        setError(getApiErrorMessage(error, "Unable to load department."));
      } finally {
        setIsLoading(false);
      }
    }

    void loadDepartment();
  }, [id]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();

    if (!id) {
      setError("Department ID is missing.");
      return;
    }

    if (!name.trim()) {
      setError("Department name is required.");
      return;
    }

    try {
      setIsSubmitting(true);
      setError("");

      await updateDepartment(Number(id), {
        name: name.trim(),
        description: description.trim() || undefined,
      });

      navigate(`/admin/departments/${id}`);
    } catch (error) {
      setError(getApiErrorMessage(error, "Unable to update department."));
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isLoading) {
    return (
      <section>
        <p className="text-sm text-slate-500">Loading department...</p>
      </section>
    );
  }

  return (
    <section>
      <div>
        <Link
          to={`/admin/departments/${id}`}
          className="text-sm font-medium text-blue-600 hover:text-blue-700"
        >
          ← Back to Department
        </Link>

        <h1 className="mt-3 text-2xl font-semibold text-slate-900">
          Edit Department
        </h1>

        <p className="mt-1 text-sm text-slate-600">
          Update department information.
        </p>
      </div>

      {error && (
        <div className="mt-6 rounded-lg bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      <form
        onSubmit={handleSubmit}
        className="mt-6 max-w-2xl rounded-xl bg-white p-6 shadow-sm"
      >
        <div>
          <label
            htmlFor="department-name"
            className="mb-1 block text-sm font-medium text-slate-700"
          >
            Department Name
          </label>

          <input
            id="department-name"
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            disabled={isSubmitting}
          />
        </div>

        <div className="mt-5">
          <label
            htmlFor="department-description"
            className="mb-1 block text-sm font-medium text-slate-700"
          >
            Description
          </label>

          <textarea
            id="department-description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            rows={4}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            disabled={isSubmitting}
          />
        </div>

        <div className="mt-6 flex gap-3">
          <button
            type="submit"
            disabled={isSubmitting}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSubmitting ? "Saving..." : "Save Changes"}
          </button>

          <Link
            to={`/admin/departments/${id}`}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </Link>
        </div>
      </form>
    </section>
  );
}
