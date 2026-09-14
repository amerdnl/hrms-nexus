import { Building2 } from "lucide-react";
import { useState } from "react";
import type { FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { getApiErrorMessage } from "../../api/axios";
import { createDepartment } from "../../api/departmentApi";
import Alert from "../../components/ui/Alert";
import FormField from "../../components/ui/FormField";
import LinkButton from "../../components/ui/LinkButton";
import PageHeader from "../../components/ui/PageHeader";
import PrimaryButton from "../../components/ui/PrimaryButton";
import SectionCard from "../../components/ui/SectionCard";
import TextArea from "../../components/ui/TextArea";
import TextInput from "../../components/ui/TextInput";

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
    } catch (requestError) {
      setError(
        getApiErrorMessage(requestError, "Unable to create department."),
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="max-w-2xl space-y-6">
      <PageHeader
        title="Add department"
        description="Create a new department."
        backTo="/admin/departments"
        backLabel="Back to departments"
      />

      {error && <Alert tone="danger">{error}</Alert>}

      <form onSubmit={handleSubmit} className="space-y-6">
        <SectionCard title="Department details" icon={Building2}>
          <div className="space-y-5">
            <FormField id="department-name" label="Department name" required>
              <TextInput
                id="department-name"
                type="text"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="e.g. Human Resources"
                disabled={isSubmitting}
              />
            </FormField>

            <FormField id="department-description" label="Description">
              <TextArea
                id="department-description"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="Brief description of the department"
                rows={4}
                disabled={isSubmitting}
              />
            </FormField>
          </div>
        </SectionCard>

        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <LinkButton to="/admin/departments" variant="secondary">
            Cancel
          </LinkButton>

          <PrimaryButton
            type="submit"
            isLoading={isSubmitting}
            loadingLabel="Creating..."
          >
            Create department
          </PrimaryButton>
        </div>
      </form>
    </section>
  );
}
