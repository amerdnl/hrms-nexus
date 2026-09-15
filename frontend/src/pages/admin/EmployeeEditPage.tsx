import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { getApiErrorMessage } from "../../api/axios";
import { getDepartments } from "../../api/departmentApi";
import { getEmployeeById, updateEmployee } from "../../api/employeeApi";
import ManagerSelect from "../../components/employees/ManagerSelect";
import Alert from "../../components/ui/Alert";
import ErrorState from "../../components/ui/ErrorState";
import FormField from "../../components/ui/FormField";
import { fieldDescribedBy } from "../../components/ui/fieldStyles";
import LinkButton from "../../components/ui/LinkButton";
import PageHeader from "../../components/ui/PageHeader";
import PrimaryButton from "../../components/ui/PrimaryButton";
import SectionCard from "../../components/ui/SectionCard";
import Skeleton from "../../components/ui/Skeleton";
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
  type Employee,
} from "../../types/employee";

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
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [gender, setGender] = useState("");
  const [employmentDate, setEmploymentDate] = useState("");
  const [managerId, setManagerId] = useState("");

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
        setEmail(employeeData.email ?? "");
        setPhone(employeeData.phone ?? "");
        setAddress(employeeData.address ?? "");
        setJobTitle(employeeData.jobTitle ?? "");
        setDepartmentId(
          employeeData.departmentId ? String(employeeData.departmentId) : "",
        );
        setEmploymentStatus(employeeData.employmentStatus);
        setEmergencyContactName(employeeData.emergencyContactName ?? "");
        setEmergencyContactPhone(employeeData.emergencyContactPhone ?? "");
        // Date inputs need a bare YYYY-MM-DD value.
        setDateOfBirth(employeeData.dateOfBirth?.slice(0, 10) ?? "");
        setGender(employeeData.gender ?? "");
        setEmploymentDate(employeeData.employmentDate?.slice(0, 10) ?? "");
        setManagerId(employeeData.managerId ? String(employeeData.managerId) : "");
      } catch (requestError) {
        setError(getApiErrorMessage(requestError, "Unable to load employee."));
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

    if (!departmentId) {
      setError("Select a department.");
      return;
    }

    try {
      setIsSubmitting(true);
      setError("");

      // Cleared fields are sent as null so the server clears them explicitly,
      // rather than being omitted and silently left at their previous value.
      await updateEmployee(Number(id), {
        full_name: fullName.trim(),
        phone: phone.trim() || null,
        address: address.trim() || null,
        job_title: jobTitle.trim() || null,
        department_id: Number(departmentId),
        employment_status: employmentStatus,
        emergency_contact_name: emergencyContactName.trim() || null,
        emergency_contact_phone: emergencyContactPhone.trim() || null,
        date_of_birth: dateOfBirth || null,
        gender: gender.trim() || null,
        employment_date: employmentDate || null,
        manager_id: managerId ? Number(managerId) : null,
        ...(email.trim() ? { email: email.trim() } : {}),
      });

      navigate(`/admin/employees/${id}`);
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, "Unable to update employee."));
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isLoading || !employee) {
    const header = (
      <PageHeader
        title="Edit employee"
        description="Update employee information."
        backTo={id ? `/admin/employees/${id}` : "/people"}
        backLabel={id ? "Back to employee" : "Back to People"}
      />
    );

    return isLoading ? (
      <section className="max-w-3xl space-y-6" aria-busy="true">
        {header}
        <p className="sr-only" aria-live="polite">Loading employee</p>
        {[4, 4, 6].map((fields, index) => (
          <SectionCard key={index}>
            <Skeleton className="h-5 w-40" />
            <div className="mt-6 grid gap-5 md:grid-cols-2">
              {Array.from({ length: fields }, (_, field) => (
                <div key={field}>
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="mt-2 h-11 w-full rounded-xl" />
                </div>
              ))}
            </div>
          </SectionCard>
        ))}
      </section>
    ) : (
      <section className="max-w-3xl space-y-6">
        {header}
        <SectionCard>
          <ErrorState
            title="This employee could not be loaded"
            description={error || "The record is unavailable."}
          />
        </SectionCard>
      </section>
    );
  }

  return (
    <section className="max-w-3xl space-y-6">
      <PageHeader
        title="Edit employee"
        description="Update employee information."
        backTo={`/admin/employees/${employee.id}`}
        backLabel="Back to employee"
      />

      {error && <Alert tone="danger">{error}</Alert>}

      <form onSubmit={handleSubmit} className="space-y-6">
        <SectionCard
          title={accountSection.title}
          description={accountSection.description}
          icon={accountSection.icon}
        >
          <div className="grid gap-5 md:grid-cols-2">
            <FormField id="full-name" label="Full name">
              <TextInput
                id="full-name"
                type="text"
                value={fullName}
                onChange={(event) => setFullName(event.target.value)}
                disabled={isSubmitting}
              />
            </FormField>

            <FormField
              id="employee-number"
              label="Employee number"
              hint="Cannot be changed after creation."
            >
              <TextInput
                id="employee-number"
                aria-describedby={fieldDescribedBy("employee-number", { hint: true })}
                type="text"
                value={employee.employeeNumber}
                disabled
              />
            </FormField>

            <FormField
              id="email"
              label="Email"
              hint="The employee signs in with this address."
            >
              <TextInput
                id="email"
                aria-describedby={fieldDescribedBy("email", { hint: true })}
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="Employee email"
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
                disabled={isSubmitting}
              />
            </FormField>

            <FormField id="department" label="Department" required>
              <SelectInput
                id="department"
                value={departmentId}
                onChange={(event) => setDepartmentId(event.target.value)}
                disabled={isSubmitting}
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
              employeeId={employee.id}
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

            <FormField
              id="emergency-contact-name"
              label="Emergency contact name"
            >
              <TextInput
                id="emergency-contact-name"
                type="text"
                value={emergencyContactName}
                onChange={(event) =>
                  setEmergencyContactName(event.target.value)
                }
                disabled={isSubmitting}
              />
            </FormField>

            <FormField
              id="emergency-contact-phone"
              label="Emergency contact phone"
            >
              <TextInput
                id="emergency-contact-phone"
                type="text"
                value={emergencyContactPhone}
                onChange={(event) =>
                  setEmergencyContactPhone(event.target.value)
                }
                disabled={isSubmitting}
              />
            </FormField>

            <FormField id="address" label="Address" className="md:col-span-2">
              <TextArea
                id="address"
                value={address}
                onChange={(event) => setAddress(event.target.value)}
                rows={4}
                disabled={isSubmitting}
              />
            </FormField>
          </div>
        </SectionCard>

        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <LinkButton
            to={`/admin/employees/${employee.id}`}
            variant="secondary"
          >
            Cancel
          </LinkButton>

          <PrimaryButton
            type="submit"
            isLoading={isSubmitting}
            loadingLabel="Saving..."
          >
            Save changes
          </PrimaryButton>
        </div>
      </form>
    </section>
  );
}
