import { Building2 } from "lucide-react";
import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { getApiErrorMessage } from "../../api/axios";
import { getDepartmentById, updateDepartment } from "../../api/departmentApi";
import Alert from "../../components/ui/Alert";
import ErrorState from "../../components/ui/ErrorState";
import FormField from "../../components/ui/FormField";
import LinkButton from "../../components/ui/LinkButton";
import PageHeader from "../../components/ui/PageHeader";
import PrimaryButton from "../../components/ui/PrimaryButton";
import SectionCard from "../../components/ui/SectionCard";
import Skeleton from "../../components/ui/Skeleton";
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
  // Separate from `error`, which also carries save failures: a record that
  // never loaded must not be shown as an empty form that could be saved.
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    async function loadDepartment() {
      if (!id) {
        setError("Department ID is missing.");
        setLoadFailed(true);
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
        setLoadFailed(true);
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

  const header = (
    <PageHeader
      title="Edit department"
      description="Update department information."
      backTo={`/admin/departments/${id}`}
      backLabel="Back to department"
    />
  );

  if (isLoading) {
    return (
      <section className="max-w-2xl space-y-6" aria-busy="true">
        {header}
        <p className="sr-only" aria-live="polite">Loading department</p>
        <SectionCard>
          <Skeleton className="h-4 w-24" />
          <Skeleton className="mt-2 h-11 w-full rounded-xl" />
          <Skeleton className="mt-5 h-4 w-24" />
          <Skeleton className="mt-2 h-24 w-full rounded-xl" />
        </SectionCard>
      </section>
    );
  }

  if (loadFailed) {
    return (
      <section className="max-w-2xl space-y-6">
        {header}
        <SectionCard>
          <ErrorState title="This department could not be loaded" description={error} />
        </SectionCard>
      </section>
    );
  }

  return (
    <section className="max-w-2xl space-y-6">
      {header}

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
