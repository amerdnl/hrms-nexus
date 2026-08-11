import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { createEmployee } from "../../api/employeeApi";
import { getDepartments } from "../../api/departmentApi";
import { getApiErrorMessage } from "../../api/axios";
import type { Department } from "../../types/department";

export default function EmployeeFormPage() {
  const navigate = useNavigate();

  const [departments, setDepartments] = useState<Department[]>([]);
  const [isLoadingDepartments, setIsLoadingDepartments] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  const [employeeNumber, setEmployeeNumber] = useState("");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [temporaryPassword, setTemporaryPassword] = useState("");
  const [showTemporaryPassword, setShowTemporaryPassword] = useState(false);
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [gender, setGender] = useState("");
  const [emergencyContactName, setEmergencyContactName] = useState("");
  const [emergencyContactPhone, setEmergencyContactPhone] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [employmentDate, setEmploymentDate] = useState("");
  const [employmentStatus, setEmploymentStatus] = useState("active");

  useEffect(() => {
    async function loadDepartments() {
      try {
        const data = await getDepartments();
        setDepartments(data);
      } catch (error) {
        setError(getApiErrorMessage(error, "Unable to load departments."));
      } finally {
        setIsLoadingDepartments(false);
      }
    }

    void loadDepartments();
  }, []);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();

    if (
      !employeeNumber.trim() ||
      !fullName.trim() ||
      !email.trim() ||
      !temporaryPassword.trim()
    ) {
      setError(
        "Employee number, full name, email and temporary password are required.",
      );
      return;
    }

    try {
      setIsSubmitting(true);
      setError("");

      await createEmployee({
        employee_number: employeeNumber.trim(),
        full_name: fullName.trim(),
        email: email.trim(),
        temporary_password: temporaryPassword,
        phone: phone.trim() || undefined,
        address: address.trim() || undefined,
        date_of_birth: dateOfBirth || undefined,
        gender: gender.trim() || undefined,
        emergency_contact_name: emergencyContactName.trim() || undefined,
        emergency_contact_phone: emergencyContactPhone.trim() || undefined,
        job_title: jobTitle.trim() || undefined,
        department_id: departmentId ? Number(departmentId) : undefined,
        employment_date: employmentDate || undefined,
        employment_status: employmentStatus,
      });

      navigate("/admin/employees");
    } catch (error) {
      setError(getApiErrorMessage(error, "Unable to create employee."));
    } finally {
      setIsSubmitting(false);
    }
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
          Add Employee
        </h1>

        <p className="mt-1 text-sm text-slate-600">
          Create an employee record and user account.
        </p>
      </div>

      {error && (
        <div className="mt-6 rounded-lg bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      <form
        onSubmit={handleSubmit}
        className="mt-6 max-w-4xl rounded-xl bg-white p-6 shadow-sm"
      >
        <div className="grid gap-5 md:grid-cols-2">
          <div>
            <label
              htmlFor="employee-number"
              className="mb-1 block text-sm font-medium text-slate-700"
            >
              Employee Number *
            </label>

            <input
              id="employee-number"
              type="text"
              value={employeeNumber}
              onChange={(event) => setEmployeeNumber(event.target.value)}
              placeholder="e.g. EMP-002"
              disabled={isSubmitting}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <div>
            <label
              htmlFor="full-name"
              className="mb-1 block text-sm font-medium text-slate-700"
            >
              Full Name *
            </label>

            <input
              id="full-name"
              type="text"
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
              placeholder="e.g. Ahmad bin Ali"
              disabled={isSubmitting}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <div>
            <label
              htmlFor="email"
              className="mb-1 block text-sm font-medium text-slate-700"
            >
              Email *
            </label>

            <input
              id="email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="employee@example.com"
              disabled={isSubmitting}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <div>
            <label
              htmlFor="temporary-password"
              className="mb-1 block text-sm font-medium text-slate-700"
            >
              Temporary Password *
            </label>

            <div className="relative">
              <input
                id="temporary-password"
                type={showTemporaryPassword ? "text" : "password"}
                value={temporaryPassword}
                onChange={(event) => setTemporaryPassword(event.target.value)}
                placeholder="Temporary password"
                disabled={isSubmitting}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 pr-10 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              />

              <button
                type="button"
                onClick={() =>
                  setShowTemporaryPassword((previous) => !previous)
                }
                disabled={isSubmitting}
                aria-label={
                  showTemporaryPassword
                    ? "Hide temporary password"
                    : "Show temporary password"
                }
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-700 disabled:cursor-not-allowed"
              >
                {showTemporaryPassword ? (
                  // Eye-off icon
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-5 w-5"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    {" "}
                    <path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-5 0-9-4-10-8a11.05 11.05 0 0 1 5.17-6.33" />{" "}
                    <path d="M9.9 4.24A10.94 10.94 0 0 1 12 4c5 0 9 4 10 8a11.05 11.05 0 0 1-1.67 3.18" />{" "}
                    <path d="M14.12 14.12A3 3 0 1 1 9.88 9.88" />{" "}
                    <path d="M3 3l18 18" />{" "}
                  </svg>
                ) : (
                  // Eye icon
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-5 w-5"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    {" "}
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />{" "}
                    <circle cx="12" cy="12" r="3" />{" "}
                  </svg>
                )}
              </button>
            </div>
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
              placeholder="+60 12-345 6789"
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
              placeholder="e.g. Software Engineer"
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
              disabled={isSubmitting || isLoadingDepartments}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            >
              <option value="">Select department</option>

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
              htmlFor="date-of-birth"
              className="mb-1 block text-sm font-medium text-slate-700"
            >
              Date of Birth
            </label>

            <input
              id="date-of-birth"
              type="date"
              value={dateOfBirth}
              onChange={(event) => setDateOfBirth(event.target.value)}
              disabled={isSubmitting}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <div>
            <label
              htmlFor="employment-date"
              className="mb-1 block text-sm font-medium text-slate-700"
            >
              Employment Date
            </label>

            <input
              id="employment-date"
              type="date"
              value={employmentDate}
              onChange={(event) => setEmploymentDate(event.target.value)}
              disabled={isSubmitting}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <div>
            <label
              htmlFor="gender"
              className="mb-1 block text-sm font-medium text-slate-700"
            >
              Gender
            </label>

            <input
              id="gender"
              type="text"
              value={gender}
              onChange={(event) => setGender(event.target.value)}
              placeholder="e.g. Male"
              disabled={isSubmitting}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <div className="md:col-span-2">
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
              rows={3}
              disabled={isSubmitting}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <div>
            <label
              htmlFor="emergency-name"
              className="mb-1 block text-sm font-medium text-slate-700"
            >
              Emergency Contact Name
            </label>

            <input
              id="emergency-name"
              type="text"
              value={emergencyContactName}
              onChange={(event) => setEmergencyContactName(event.target.value)}
              disabled={isSubmitting}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <div>
            <label
              htmlFor="emergency-phone"
              className="mb-1 block text-sm font-medium text-slate-700"
            >
              Emergency Contact Phone
            </label>

            <input
              id="emergency-phone"
              type="text"
              value={emergencyContactPhone}
              onChange={(event) => setEmergencyContactPhone(event.target.value)}
              disabled={isSubmitting}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />
          </div>
        </div>

        <div className="mt-6 flex gap-3">
          <button
            type="submit"
            disabled={isSubmitting}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSubmitting ? "Creating..." : "Create Employee"}
          </button>

          <Link
            to="/admin/employees"
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </Link>
        </div>
      </form>
    </section>
  );
}
