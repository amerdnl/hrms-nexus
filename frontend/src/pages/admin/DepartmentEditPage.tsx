import { Building2 } from "lucide-react";
import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { getApiErrorMessage } from "../../api/axios";
import { getDepartmentById, updateDepartment } from "../../api/departmentApi";
import Alert from "../../components/ui/Alert";
import FormField from "../../components/ui/FormField";
import LinkButton from "../../components/ui/LinkButton";
import PageHeader from "../../components/ui/PageHeader";
import PrimaryButton from "../../components/ui/PrimaryButton";
import SectionCard from "../../components/ui/SectionCard";
import TextArea from "../../components/ui/TextArea";
import TextInput from "../../components/ui/TextInput";

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
      } catch (requestError) {
        setError(
          getApiErrorMessage(requestError, "Unable to load department."),
        );
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
    } catch (requestError) {
      setError(
        getApiErrorMessage(requestError, "Unable to update department."),
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isLoading) {
    return <p className="text-sm text-fg-muted">Loading department...</p>;
  }

  return (
    <section className="mx-auto max-w-2xl space-y-6">
      <PageHeader
        title="Edit department"
        description="Update department information."
        backTo={`/admin/departments/${id}`}
        backLabel="Back to department"
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
                disabled={isSubmitting}
              />
            </FormField>

            <FormField id="department-description" label="Description">
              <TextArea
                id="department-description"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                rows={4}
                disabled={isSubmitting}
              />
            </FormField>
          </div>
        </SectionCard>

        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <LinkButton to={`/admin/departments/${id}`} variant="secondary">
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
