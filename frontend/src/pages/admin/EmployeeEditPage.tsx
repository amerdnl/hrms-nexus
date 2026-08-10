import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { getEmployeeById, updateEmployee } from "../../api/employeeApi";
import { getDepartments } from "../../api/departmentApi";
import { getApiErrorMessage } from "../../api/axios";
import type { Employee } from "../../types/employee";
import type { Department } from "../../types/department";

export default function EmployeeEditPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [employee, setEmployee] = useState<Employee | null>(null);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [employmentStatus, setEmploymentStatus] = useState("active");
  const [emergencyContactName, setEmergencyContactName] = useState("");
  const [emergencyContactPhone, setEmergencyContactPhone] = useState("");

  useEffect(() => {
    async function loadData() {
      if (!id) {
        setError("Employee ID is missing.");
        setIsLoading(false);
        return;
      }

      try {
        const [employeeData, departmentData] = await Promise.all([
          getEmployeeById(Number(id)),
          getDepartments(),
        ]);

        setEmployee(employeeData);
        setDepartments(departmentData);

        setFullName(employeeData.fullName);
        setPhone(employeeData.phone ?? "");
        setAddress(employeeData.address ?? "");
        setJobTitle(employeeData.jobTitle ?? "");
        setDepartmentId(
          employeeData.departmentId ? String(employeeData.departmentId) : "",
        );
        setEmploymentStatus(employeeData.employmentStatus);
        setEmergencyContactName(employeeData.emergencyContactName ?? "");
        setEmergencyContactPhone(employeeData.emergencyContactPhone ?? "");
      } catch (error) {
        setError(getApiErrorMessage(error, "Unable to load employee."));
      } finally {
        setIsLoading(false);
      }
    }

    void loadData();
  }, [id]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();

    if (!id) {
      setError("Employee ID is missing.");
      return;
    }

    if (!fullName.trim()) {
      setError("Full name is required.");
      return;
    }

    try {
      setIsSubmitting(true);
      setError("");

      await updateEmployee(Number(id), {
        full_name: fullName.trim(),
        phone: phone.trim() || undefined,
        address: address.trim() || undefined,
        job_title: jobTitle.trim() || undefined,
        department_id: departmentId ? Number(departmentId) : undefined,
        employment_status: employmentStatus,
        emergency_contact_name: emergencyContactName.trim() || undefined,
        emergency_contact_phone: emergencyContactPhone.trim() || undefined,
        ...(email.trim() ? { email: email.trim() } : {}),
      });

      navigate(`/admin/employees/${id}`);
    } catch (error) {
      setError(getApiErrorMessage(error, "Unable to update employee."));
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isLoading) {
    return <div className="text-sm text-slate-500">Loading employee...</div>;
  }

  if (error && !employee) {
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
          to={`/admin/employees/${employee.id}`}
          className="text-sm font-medium text-blue-600 hover:text-blue-700"
        >
          ← Back to Employee
        </Link>

        <h1 className="mt-3 text-2xl font-semibold text-slate-900">
          Edit Employee
        </h1>

        <p className="mt-1 text-sm text-slate-600">
          Update employee information.
        </p>
      </div>

      {error && (
        <div className="mt-6 rounded-lg bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      <form
        onSubmit={handleSubmit}
        className="mt-6 max-w-3xl rounded-xl bg-white p-6 shadow-sm"
      >
        <div className="grid gap-5 md:grid-cols-2">
          <div>
            <label
              htmlFor="full-name"
              className="mb-1 block text-sm font-medium text-slate-700"
            >
              Full Name
            </label>

            <input
              id="full-name"
              type="text"
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
              disabled={isSubmitting}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <div>
            <label
              htmlFor="employee-number"
              className="mb-1 block text-sm font-medium text-slate-700"
            >
              Employee Number
            </label>

            <input
              id="employee-number"
              type="text"
              value={employee.employeeNumber}
              disabled
              className="w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-500"
            />
          </div>

          <div>
            <label
              htmlFor="email"
              className="mb-1 block text-sm font-medium text-slate-700"
            >
              Email
            </label>

            <input
              id="email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="Employee email"
              disabled={isSubmitting}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />

            <p className="mt-1 text-xs text-slate-500">
              Leave blank if you do not want to change the email.
            </p>
          </div>

          <div>
            <label
              htmlFor="phone"
              className="mb-1 block text-sm font-medium text-slate-700"
            >
              Phone
            </label>

            <input
              id="phone"
              type="text"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              disabled={isSubmitting}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <div>
            <label
              htmlFor="job-title"
              className="mb-1 block text-sm font-medium text-slate-700"
            >
              Job Title
            </label>

            <input
              id="job-title"
              type="text"
              value={jobTitle}
              onChange={(event) => setJobTitle(event.target.value)}
              disabled={isSubmitting}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <div>
            <label
              htmlFor="department"
              className="mb-1 block text-sm font-medium text-slate-700"
            >
              Department
            </label>

            <select
              id="department"
              value={departmentId}
              onChange={(event) => setDepartmentId(event.target.value)}
              disabled={isSubmitting}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            >
              <option value="">No department</option>

              {departments.map((department) => (
                <option key={department.id} value={department.id}>
                  {department.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="employment-status"
              className="mb-1 block text-sm font-medium text-slate-700"
            >
              Employment Status
            </label>

            <select
              id="employment-status"
              value={employmentStatus}
              onChange={(event) => setEmploymentStatus(event.target.value)}
              disabled={isSubmitting}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            >
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>

          <div>
            <label
              htmlFor="emergency-contact-name"
              className="mb-1 block text-sm font-medium text-slate-700"
            >
              Emergency Contact Name
            </label>

            <input
              id="emergency-contact-name"
              type="text"
              value={emergencyContactName}
              onChange={(event) => setEmergencyContactName(event.target.value)}
              disabled={isSubmitting}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <div>
            <label
              htmlFor="emergency-contact-phone"
              className="mb-1 block text-sm font-medium text-slate-700"
            >
              Emergency Contact Phone
            </label>

            <input
              id="emergency-contact-phone"
              type="text"
              value={emergencyContactPhone}
              onChange={(event) => setEmergencyContactPhone(event.target.value)}
              disabled={isSubmitting}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />
          </div>
        </div>

        <div className="mt-5">
          <label
            htmlFor="address"
            className="mb-1 block text-sm font-medium text-slate-700"
          >
            Address
          </label>

          <textarea
            id="address"
            value={address}
            onChange={(event) => setAddress(event.target.value)}
            rows={4}
            disabled={isSubmitting}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
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
            to={`/admin/employees/${employee.id}`}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </Link>
        </div>
      </form>
    </section>
  );
}
