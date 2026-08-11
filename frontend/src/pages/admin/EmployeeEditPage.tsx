import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { getApiErrorMessage } from "../../api/axios";
import { getDepartments } from "../../api/departmentApi";
import { getEmployeeById, updateEmployee } from "../../api/employeeApi";
import Alert from "../../components/ui/Alert";
import FormField from "../../components/ui/FormField";
import { fieldDescribedBy } from "../../components/ui/fieldStyles";
import LinkButton from "../../components/ui/LinkButton";
import PageHeader from "../../components/ui/PageHeader";
import PrimaryButton from "../../components/ui/PrimaryButton";
import SectionCard from "../../components/ui/SectionCard";
import SelectInput from "../../components/ui/SelectInput";
import TextArea from "../../components/ui/TextArea";
import TextInput from "../../components/ui/TextInput";
import type { Department } from "../../types/department";
import type { Employee } from "../../types/employee";

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
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, "Unable to update employee."));
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isLoading) {
    return <p className="text-sm text-fg-muted">Loading employee...</p>;
  }

  if (error && !employee) {
    return <Alert tone="danger">{error}</Alert>;
  }

  if (!employee) {
    return null;
  }

  return (
    <section className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title="Edit employee"
        description="Update employee information."
        backTo={`/admin/employees/${employee.id}`}
        backLabel="Back to employee"
      />

      {error && <Alert tone="danger">{error}</Alert>}

      <form onSubmit={handleSubmit} className="space-y-6">
        <SectionCard title="Employee details">
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
              hint="Leave blank if you do not want to change the email."
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

            <FormField id="phone" label="Phone">
              <TextInput
                id="phone"
                type="text"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                disabled={isSubmitting}
              />
            </FormField>

            <FormField id="job-title" label="Job title">
              <TextInput
                id="job-title"
                type="text"
                value={jobTitle}
                onChange={(event) => setJobTitle(event.target.value)}
                disabled={isSubmitting}
              />
            </FormField>

            <FormField id="department" label="Department">
              <SelectInput
                id="department"
                value={departmentId}
                onChange={(event) => setDepartmentId(event.target.value)}
                disabled={isSubmitting}
              >
                <option value="">No department</option>

                {departments.map((department) => (
                  <option key={department.id} value={department.id}>
                    {department.name}
                  </option>
                ))}
              </SelectInput>
            </FormField>

            <FormField id="employment-status" label="Employment status">
              <SelectInput
                id="employment-status"
                value={employmentStatus}
                onChange={(event) => setEmploymentStatus(event.target.value)}
                disabled={isSubmitting}
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </SelectInput>
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
