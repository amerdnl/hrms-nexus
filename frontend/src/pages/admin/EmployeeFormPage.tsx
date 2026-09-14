import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { getApiErrorMessage } from "../../api/axios";
import { getDepartments } from "../../api/departmentApi";
import { createEmployee } from "../../api/employeeApi";
import ManagerSelect from "../../components/employees/ManagerSelect";
import Alert from "../../components/ui/Alert";
import FormField from "../../components/ui/FormField";
import { fieldDescribedBy } from "../../components/ui/fieldStyles";
import LinkButton from "../../components/ui/LinkButton";
import PageHeader from "../../components/ui/PageHeader";
import PasswordInput from "../../components/ui/PasswordInput";
import PrimaryButton from "../../components/ui/PrimaryButton";
import SectionCard from "../../components/ui/SectionCard";
import {
  accountSection,
  employmentSection,
  personalSection,
} from "./employeeFormSections";
import SelectInput from "../../components/ui/SelectInput";
import TextArea from "../../components/ui/TextArea";
import TextInput from "../../components/ui/TextInput";
import type { Department } from "../../types/department";
import {
  employmentStatusLabels,
  employmentStatuses,
} from "../../types/employee";

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
  const [managerId, setManagerId] = useState("");

  useEffect(() => {
    async function loadDepartments() {
      try {
        const data = await getDepartments();
        setDepartments(data);
      } catch (requestError) {
        setError(
          getApiErrorMessage(requestError, "Unable to load departments."),
        );
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

    // The server requires a department too; checking here keeps the message next
    // to the form rather than arriving as a validation error response.
    if (!departmentId) {
      setError("Select a department.");
      return;
    }

    try {
      setIsSubmitting(true);
      setError("");

      // null is the explicit "no value" the server accepts; it never leaves a
      // supplied-but-empty field ambiguous.
      await createEmployee({
        employee_number: employeeNumber.trim(),
        full_name: fullName.trim(),
        email: email.trim(),
        temporary_password: temporaryPassword,
        phone: phone.trim() || null,
        address: address.trim() || null,
        date_of_birth: dateOfBirth || null,
        gender: gender.trim() || null,
        emergency_contact_name: emergencyContactName.trim() || null,
        emergency_contact_phone: emergencyContactPhone.trim() || null,
        job_title: jobTitle.trim() || null,
        department_id: Number(departmentId),
        employment_date: employmentDate || null,
        employment_status: employmentStatus,
        manager_id: managerId ? Number(managerId) : null,
      });

      navigate("/admin/employees");
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, "Unable to create employee."));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="max-w-4xl space-y-6">
      <PageHeader
        title="Add employee"
        description="Create an employee record and user account."
        backTo="/admin/employees"
        backLabel="Back to employees"
      />

      {error && <Alert tone="danger">{error}</Alert>}

      <form onSubmit={handleSubmit} className="space-y-6">
        <SectionCard
          title={accountSection.title}
          description="Used to create the employee's sign-in."
          icon={accountSection.icon}
        >
          <div className="grid gap-5 md:grid-cols-2">
            <FormField id="employee-number" label="Employee number" required>
              <TextInput
                id="employee-number"
                type="text"
                value={employeeNumber}
                onChange={(event) => setEmployeeNumber(event.target.value)}
                placeholder="e.g. EMP-002"
                disabled={isSubmitting}
              />
            </FormField>

            <FormField id="full-name" label="Full name" required>
              <TextInput
                id="full-name"
                type="text"
                value={fullName}
                onChange={(event) => setFullName(event.target.value)}
                placeholder="e.g. Ahmad bin Ali"
                disabled={isSubmitting}
              />
            </FormField>

            <FormField id="email" label="Email" required>
              <TextInput
                id="email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="employee@example.com"
                disabled={isSubmitting}
              />
            </FormField>

            <FormField
              id="temporary-password"
              label="Temporary password"
              required
            >
              <PasswordInput
                id="temporary-password"
                value={temporaryPassword}
                onChange={(event) => setTemporaryPassword(event.target.value)}
                placeholder="Temporary password"
                disabled={isSubmitting}
              />
            </FormField>
          </div>
        </SectionCard>

        <SectionCard
          title={employmentSection.title}
          description={employmentSection.description}
          icon={employmentSection.icon}
        >
          <div className="grid gap-5 md:grid-cols-2">
            <FormField id="job-title" label="Job title">
              <TextInput
                id="job-title"
                type="text"
                value={jobTitle}
                onChange={(event) => setJobTitle(event.target.value)}
                placeholder="e.g. Software Engineer"
                disabled={isSubmitting}
              />
            </FormField>

            <FormField id="department" label="Department" required>
              <SelectInput
                id="department"
                value={departmentId}
                onChange={(event) => setDepartmentId(event.target.value)}
                disabled={isSubmitting || isLoadingDepartments}
              >
                <option value="">Select department</option>

                {departments.map((department) => (
                  <option key={department.id} value={department.id}>
                    {department.name}
                  </option>
                ))}
              </SelectInput>
            </FormField>

            <FormField
              id="employment-status"
              label="Employment status"
              hint="Only active and probation employees can sign in."
            >
              <SelectInput
                id="employment-status"
                aria-describedby={fieldDescribedBy("employment-status", { hint: true })}
                value={employmentStatus}
                onChange={(event) => setEmploymentStatus(event.target.value)}
                disabled={isSubmitting}
              >
                {employmentStatuses.map((status) => (
                  <option key={status} value={status}>
                    {employmentStatusLabels[status]}
                  </option>
                ))}
              </SelectInput>
            </FormField>

            <FormField id="employment-date" label="Employment date">
              <TextInput
                id="employment-date"
                type="date"
                value={employmentDate}
                onChange={(event) => setEmploymentDate(event.target.value)}
                disabled={isSubmitting}
              />
            </FormField>

            <ManagerSelect
              employeeId={null}
              value={managerId}
              onChange={setManagerId}
              disabled={isSubmitting}
            />
          </div>
        </SectionCard>

        <SectionCard
          title={personalSection.title}
          description={personalSection.description}
          icon={personalSection.icon}
        >
          <div className="grid gap-5 md:grid-cols-2">
            <FormField id="phone" label="Phone">
              <TextInput
                id="phone"
                type="text"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                placeholder="+60 12-345 6789"
                disabled={isSubmitting}
              />
            </FormField>

            <FormField id="date-of-birth" label="Date of birth">
              <TextInput
                id="date-of-birth"
                type="date"
                value={dateOfBirth}
                onChange={(event) => setDateOfBirth(event.target.value)}
                disabled={isSubmitting}
              />
            </FormField>

            <FormField id="gender" label="Gender">
              <TextInput
                id="gender"
                type="text"
                value={gender}
                onChange={(event) => setGender(event.target.value)}
                placeholder="e.g. Male"
                disabled={isSubmitting}
              />
            </FormField>

            <FormField id="emergency-name" label="Emergency contact name">
              <TextInput
                id="emergency-name"
                type="text"
                value={emergencyContactName}
                onChange={(event) =>
                  setEmergencyContactName(event.target.value)
                }
                disabled={isSubmitting}
              />
            </FormField>

            <FormField id="emergency-phone" label="Emergency contact phone">
              <TextInput
                id="emergency-phone"
                type="text"
                value={emergencyContactPhone}
                onChange={(event) =>
                  setEmergencyContactPhone(event.target.value)
                }
                disabled={isSubmitting}
              />
            </FormField>

            <FormField
              id="address"
              label="Address"
              className="md:col-span-2"
            >
              <TextArea
                id="address"
                value={address}
                onChange={(event) => setAddress(event.target.value)}
                rows={3}
                disabled={isSubmitting}
              />
            </FormField>
          </div>
        </SectionCard>

        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <LinkButton to="/admin/employees" variant="secondary">
            Cancel
          </LinkButton>

          <PrimaryButton
            type="submit"
            isLoading={isSubmitting}
            loadingLabel="Creating..."
          >
            Create employee
          </PrimaryButton>
        </div>
      </form>
    </section>
  );
}
