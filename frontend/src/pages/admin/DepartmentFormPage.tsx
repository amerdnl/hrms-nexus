import { useState } from "react";
import type { FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { createDepartment } from "../../api/departmentApi";
import { getApiErrorMessage } from "../../api/axios";

export default function DepartmentFormPage() {
  const navigate = useNavigate();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!name.trim()) {
      setError("Department name is required.");
      return;
    }

    try {
      setIsSubmitting(true);
      setError("");

      await createDepartment({
        name: name.trim(),
        description: description.trim() || undefined,
      });

      navigate("/admin/departments");
    } catch (error) {
      setError(getApiErrorMessage(error, "Unable to create department."));
    } finally {
      setIsSubmitting(false);
    }
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

        <h1 className="mt-3 text-2xl font-semibold text-slate-900">
          Add Department
        </h1>

        <p className="mt-1 text-sm text-slate-600">Create a new department.</p>
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
            placeholder="e.g. Human Resources"
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
            placeholder="Brief description of the department"
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
            {isSubmitting ? "Creating..." : "Create Department"}
          </button>

          <Link
            to="/admin/departments"
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </Link>
        </div>
      </form>
    </section>
  );
}
