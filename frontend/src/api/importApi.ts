import apiClient from "./axios";

import type {
  ColumnMapping,
  ImportFieldDescriptor,
  ImportJob,
  ImportOutcome,
  ImportRow,
  Paginated,
  RowClassification,
  UploadedFileAnalysis,
  ValidationResult,
} from "../types/import";

interface Envelope<T> {
  success: boolean;
  message?: string;
  data: T;
}

export async function getImportFields(): Promise<ImportFieldDescriptor[]> {
  const response = await apiClient.get<Envelope<ImportFieldDescriptor[]>>("/import/fields");
  return response.data.data;
}

/**
 * Fetches the template through the API client so the request carries the bearer
 * token, then hands the browser a blob to save.
 */
export async function downloadImportTemplate(): Promise<void> {
  const response = await apiClient.get("/import/template", { responseType: "blob" });
  const url = URL.createObjectURL(new Blob([response.data as BlobPart], { type: "text/csv" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = "hr-nexus-employee-import-template.csv";
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export async function uploadImportFile(file: File): Promise<UploadedFileAnalysis> {
  const form = new FormData();
  form.append("file", file);
  // The browser sets the multipart boundary; overriding Content-Type breaks it.
  const response = await apiClient.post<Envelope<UploadedFileAnalysis>>("/import/jobs", form);
  return response.data.data;
}

export async function setImportMapping(
  jobId: string,
  mapping: ColumnMapping,
): Promise<ValidationResult> {
  const response = await apiClient.put<Envelope<ValidationResult>>(
    `/import/jobs/${jobId}/mapping`,
    { mapping },
  );
  return response.data.data;
}

export async function getImportJob(jobId: string): Promise<ImportJob> {
  const response = await apiClient.get<Envelope<ImportJob>>(`/import/jobs/${jobId}`);
  return response.data.data;
}

export async function getImportRows(
  jobId: string,
  options: { page: number; pageSize: number; classification?: RowClassification | "" },
): Promise<Paginated<ImportRow>> {
  const response = await apiClient.get<Paginated<ImportRow>>(`/import/jobs/${jobId}/rows`, {
    params: {
      page: options.page,
      page_size: options.pageSize,
      classification: options.classification || undefined,
    },
  });
  return response.data;
}

export async function confirmImport(
  jobId: string,
  options: { applyUpdates: boolean; createMissingDepartments: boolean },
): Promise<ImportOutcome> {
  const response = await apiClient.post<Envelope<ImportOutcome>>(
    `/import/jobs/${jobId}/confirm`,
    {
      apply_updates: options.applyUpdates,
      create_missing_departments: options.createMissingDepartments,
    },
  );
  return response.data.data;
}

export async function getImportHistory(
  page = 1,
  pageSize = 10,
): Promise<Paginated<ImportJob>> {
  const response = await apiClient.get<Paginated<ImportJob>>("/import/jobs", {
    params: { page, page_size: pageSize },
  });
  return response.data;
}
