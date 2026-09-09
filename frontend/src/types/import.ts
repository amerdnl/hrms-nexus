export type ImportJobStatus =
  | "pending" | "validating" | "ready" | "importing" | "completed" | "failed";

export type RowClassification =
  | "new" | "update" | "unchanged" | "conflict" | "invalid";

export interface ImportFieldDescriptor {
  field: string;
  label: string;
  required: boolean;
}

export interface ImportJob {
  id: string;
  file_name: string;
  import_type: string;
  status: ImportJobStatus;
  total_rows: number;
  new_rows: number;
  update_rows: number;
  unchanged_rows: number;
  conflict_rows: number;
  invalid_rows: number;
  warning_rows: number;
  created_count: number;
  updated_count: number;
  error_message: string | null;
  created_at: string;
  completed_at: string | null;
  initiated_by?: number;
  initiated_by_email?: string | null;
}

/** Field name to zero-based column index. */
export type ColumnMapping = Record<string, number | undefined>;

export interface UploadedFileAnalysis {
  job: ImportJob;
  headers: string[];
  sample: string[][];
  suggested_mapping: ColumnMapping;
  unmatched_headers: string[];
  ambiguous_fields: string[];
  ignored_password_headers: string[];
}

export interface ImportSummary {
  total: number;
  new: number;
  update: number;
  unchanged: number;
  conflict: number;
  invalid: number;
  warnings: number;
}

export interface ValidationResult {
  summary: ImportSummary;
  missing_departments: string[];
  mapping: ColumnMapping;
}

export interface RowIssue {
  field: string | null;
  level: "error" | "warning";
  message: string;
}

export interface ImportRow {
  row_number: number;
  classification: RowClassification;
  employee_id: number | null;
  row_data: Record<string, unknown> | null;
  issues: RowIssue[];
  changed_fields: string[];
  applied: boolean;
}

export interface ImportCredential {
  employee_number: string;
  full_name: string;
  email: string;
  temporary_password: string;
}

export interface ImportOutcome {
  summary: ImportSummary;
  created: number;
  updated: number;
  created_departments: string[];
  credentials: ImportCredential[];
}

export interface Paginated<T> {
  data: T[];
  pagination: { page: number; page_size: number; total: number; page_count: number };
}

export const classificationLabels: Record<RowClassification, string> = {
  new: "New",
  update: "Update",
  unchanged: "Unchanged",
  conflict: "Conflict",
  invalid: "Invalid",
};
