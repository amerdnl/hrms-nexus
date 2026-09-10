import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  History,
  KeyRound,
  ListChecks,
  Upload,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getApiErrorMessage } from "../../api/axios";
import {
  confirmImport,
  downloadImportTemplate,
  getImportFields,
  getImportHistory,
  getImportRows,
  setImportMapping,
  uploadImportFile,
} from "../../api/importApi";
import Alert from "../../components/ui/Alert";
import Button from "../../components/ui/Button";
import Checkbox from "../../components/ui/Checkbox";
import FileInput from "../../components/ui/FileInput";
import DataTable from "../../components/ui/DataTable";
import EmptyState from "../../components/ui/EmptyState";
import FormField from "../../components/ui/FormField";
import PageHeader from "../../components/ui/PageHeader";
import Pagination from "../../components/ui/Pagination";
import PrimaryButton from "../../components/ui/PrimaryButton";
import SectionCard from "../../components/ui/SectionCard";
import SelectInput from "../../components/ui/SelectInput";
import StatusBadge from "../../components/ui/StatusBadge";
import {
  classificationLabels,
  type ColumnMapping,
  type ImportCredential,
  type ImportFieldDescriptor,
  type ImportJob,
  type ImportOutcome,
  type ImportRow,
  type RowClassification,
  type UploadedFileAnalysis,
  type ValidationResult,
} from "../../types/import";
import { formatDateTime } from "../../utils/datetime";

type Step = "upload" | "mapping" | "preview" | "done";

const ROWS_PER_PAGE = 10;

const classificationTone: Record<RowClassification, "success" | "info" | "neutral" | "warning" | "danger"> = {
  new: "success",
  update: "info",
  unchanged: "neutral",
  conflict: "warning",
  invalid: "danger",
};

const stepOrder: Array<{ id: Step; label: string }> = [
  { id: "upload", label: "Upload" },
  { id: "mapping", label: "Map columns" },
  { id: "preview", label: "Review" },
  { id: "done", label: "Summary" },
];

/** Builds a credentials CSV in the browser; the server never stores these. */
function downloadCredentials(credentials: ImportCredential[]): void {
  const escape = (value: string) =>
    /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
  const csv = [
    "employee_number,full_name,email,temporary_password",
    ...credentials.map((credential) =>
      [credential.employee_number, credential.full_name, credential.email, credential.temporary_password]
        .map(escape)
        .join(","),
    ),
  ].join("\r\n");

  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = "hr-nexus-imported-credentials.csv";
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export default function ImportPage() {
  const [step, setStep] = useState<Step>("upload");
  const [error, setError] = useState("");
  const [isBusy, setIsBusy] = useState(false);

  const [fields, setFields] = useState<ImportFieldDescriptor[]>([]);
  const [analysis, setAnalysis] = useState<UploadedFileAnalysis | null>(null);
  const [mapping, setMapping] = useState<ColumnMapping>({});
  const [mappingErrors, setMappingErrors] = useState<string[]>([]);
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [outcome, setOutcome] = useState<ImportOutcome | null>(null);

  const [rows, setRows] = useState<ImportRow[]>([]);
  const [rowTotal, setRowTotal] = useState(0);
  const [rowPage, setRowPage] = useState(1);
  const [rowFilter, setRowFilter] = useState<RowClassification | "">("");
  const [rowsLoading, setRowsLoading] = useState(false);

  const [applyUpdates, setApplyUpdates] = useState(false);
  const [createDepartments, setCreateDepartments] = useState(false);

  const [history, setHistory] = useState<ImportJob[]>([]);
  const [historyFailed, setHistoryFailed] = useState(false);

  const fileInput = useRef<HTMLInputElement>(null);

  const loadHistory = useCallback(async () => {
    try {
      setHistory((await getImportHistory(1, 10)).data);
      setHistoryFailed(false);
    } catch {
      setHistoryFailed(true);
    }
  }, []);

  useEffect(() => {
    void loadHistory();
    getImportFields().then(setFields).catch(() => setFields([]));
  }, [loadHistory]);

  const jobId = analysis?.job.id ?? null;

  const loadRows = useCallback(async () => {
    if (!jobId) return;
    try {
      setRowsLoading(true);
      const page = await getImportRows(jobId, {
        page: rowPage,
        pageSize: ROWS_PER_PAGE,
        classification: rowFilter,
      });
      setRows(page.data);
      setRowTotal(page.pagination.total);
      if (rowPage > page.pagination.page_count) setRowPage(page.pagination.page_count);
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, "Unable to load the preview rows."));
    } finally {
      setRowsLoading(false);
    }
  }, [jobId, rowPage, rowFilter]);

  useEffect(() => {
    if (step === "preview") void loadRows();
  }, [step, loadRows]);

  function restart() {
    setStep("upload");
    setAnalysis(null);
    setMapping({});
    setMappingErrors([]);
    setValidation(null);
    setOutcome(null);
    setRows([]);
    setRowTotal(0);
    setRowPage(1);
    setRowFilter("");
    setApplyUpdates(false);
    setCreateDepartments(false);
    setError("");
    if (fileInput.current) fileInput.current.value = "";
  }

  async function handleUpload(file: File) {
    try {
      setIsBusy(true);
      setError("");
      setMappingErrors([]);
      const result = await uploadImportFile(file);
      setAnalysis(result);
      setMapping(result.suggested_mapping);
      setStep("mapping");
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, "Unable to read that file."));
      if (fileInput.current) fileInput.current.value = "";
    } finally {
      setIsBusy(false);
    }
  }

  async function handleValidate() {
    if (!analysis) return;
    try {
      setIsBusy(true);
      setError("");
      setMappingErrors([]);
      const result = await setImportMapping(analysis.job.id, mapping);
      setValidation(result);
      setCreateDepartments(false);
      setApplyUpdates(false);
      setRowPage(1);
      setRowFilter("");
      setStep("preview");
    } catch (requestError) {
      const details = (requestError as { response?: { data?: { errors?: string[] } } })
        .response?.data?.errors;
      if (Array.isArray(details) && details.length > 0) {
        setMappingErrors(details);
      } else {
        setError(getApiErrorMessage(requestError, "Unable to validate the mapping."));
      }
    } finally {
      setIsBusy(false);
    }
  }

  async function handleConfirm() {
    if (!analysis) return;
    try {
      setIsBusy(true);
      setError("");
      const result = await confirmImport(analysis.job.id, {
        applyUpdates,
        createMissingDepartments: createDepartments,
      });
      setOutcome(result);
      setStep("done");
      void loadHistory();
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, "The import failed and nothing was changed."));
      void loadHistory();
    } finally {
      setIsBusy(false);
    }
  }

  const summary = validation?.summary;
  const willCreate = summary?.new ?? 0;
  const willUpdate = applyUpdates ? (summary?.update ?? 0) : 0;
  const blocked = (summary?.invalid ?? 0) + (summary?.conflict ?? 0);
  const nothingToDo = willCreate === 0 && willUpdate === 0;

  const mappedColumns = useMemo(
    () => new Set(Object.values(mapping).filter((value): value is number => value !== undefined)),
    [mapping],
  );

  return (
    <section className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        title="Import workforce data"
        description="Bring an existing company's employees into HR Nexus from a CSV or Excel file."
        actions={
          <Button
            variant="secondary"
            icon={Download}
            onClick={() => {
              void downloadImportTemplate().catch((requestError) =>
                setError(getApiErrorMessage(requestError, "Unable to download the template.")),
              );
            }}
          >
            Download template
          </Button>
        }
      />

      {error && <Alert tone="danger" onDismiss={() => setError("")}>{error}</Alert>}

      {/* Progress trail, so the admin can see where they are in a multi-step flow. */}
      <ol className="flex flex-wrap gap-2" aria-label="Import progress">
        {stepOrder.map(({ id, label }, index) => {
          const current = stepOrder.findIndex((entry) => entry.id === step);
          const state = index < current ? "done" : index === current ? "current" : "todo";
          return (
            <li
              key={id}
              aria-current={state === "current" ? "step" : undefined}
              className={[
                "flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium",
                state === "current"
                  ? "border-primary bg-primary-soft text-primary"
                  : state === "done"
                    ? "border-success/30 bg-success-soft text-success-fg"
                    : "border-line bg-surface text-fg-subtle",
              ].join(" ")}
            >
              <span className="grid h-5 w-5 place-items-center rounded-full bg-surface text-[11px]">
                {index + 1}
              </span>
              {label}
            </li>
          );
        })}
      </ol>

      {step === "upload" && (
        <SectionCard
          title="Upload a file"
          description="CSV or Excel (.xlsx), up to 5 MB and 5000 rows. Nothing is imported until you review and confirm."
          icon={Upload}
        >
          <div className="space-y-4">
            <FormField
              id="import-file"
              label="Workforce file"
              hint="Columns are matched automatically; you can correct them in the next step."
            >
              <FileInput
                id="import-file"
                ref={fileInput}
                accept=".csv,.xlsx"
                disabled={isBusy}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void handleUpload(file);
                }}
              />
            </FormField>

            {isBusy && <p className="text-sm text-fg-muted">Reading the file...</p>}

            <p className="text-sm text-fg-subtle">
              Passwords are never imported. Each new employee receives a generated
              temporary password, shown once when the import finishes.
            </p>
          </div>
        </SectionCard>
      )}

      {step === "mapping" && analysis && (
        <SectionCard
          title="Map columns"
          description={`${analysis.job.file_name} — ${analysis.job.total_rows} data rows.`}
          icon={ListChecks}
        >
          <div className="space-y-5">
            {mappingErrors.length > 0 && (
              <Alert tone="danger" title="Fix the mapping before continuing">
                <ul className="list-inside list-disc space-y-1">
                  {mappingErrors.map((message) => <li key={message}>{message}</li>)}
                </ul>
              </Alert>
            )}

            {analysis.ambiguous_fields.length > 0 && (
              <Alert tone="warning">
                More than one column matched{" "}
                {analysis.ambiguous_fields.join(", ")}. Check the selection below.
              </Alert>
            )}

            {analysis.ignored_password_headers.length > 0 && (
              <Alert tone="info">
                Ignoring credential column
                {analysis.ignored_password_headers.length === 1 ? "" : "s"}{" "}
                {analysis.ignored_password_headers.join(", ")}. Temporary passwords are
                generated by HR Nexus and never read from a file.
              </Alert>
            )}

            {analysis.unmatched_headers.length > 0 && (
              <Alert tone="info">
                These columns were not recognised and will not be imported:{" "}
                {analysis.unmatched_headers.join(", ")}.
              </Alert>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              {fields.map((field) => (
                <FormField
                  key={field.field}
                  id={`map-${field.field}`}
                  label={field.label}
                  required={field.required}
                >
                  <SelectInput
                    id={`map-${field.field}`}
                    value={mapping[field.field] === undefined ? "" : String(mapping[field.field])}
                    disabled={isBusy}
                    onChange={(event) =>
                      setMapping((current) => ({
                        ...current,
                        [field.field]: event.target.value === "" ? undefined : Number(event.target.value),
                      }))
                    }
                  >
                    <option value="">Not imported</option>
                    {analysis.headers.map((header, index) => (
                      <option key={`${header}-${index}`} value={index}>
                        {header || `Column ${index + 1}`}
                        {mappedColumns.has(index) && mapping[field.field] !== index ? " (already used)" : ""}
                      </option>
                    ))}
                  </SelectInput>
                </FormField>
              ))}
            </div>

            <div>
              <h3 className="mb-2 text-sm font-semibold text-fg">First rows of your file</h3>
              <div className="overflow-x-auto rounded-card border border-line">
                <table className="min-w-full text-left text-xs">
                  <thead className="bg-surface-muted text-fg-muted">
                    <tr>
                      {analysis.headers.map((header, index) => (
                        <th key={`${header}-${index}`} className="whitespace-nowrap px-3 py-2 font-medium">
                          {header || `Column ${index + 1}`}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {analysis.sample.map((row, rowIndex) => (
                      <tr key={rowIndex} className="border-t border-line">
                        {row.map((cell, cellIndex) => (
                          <td key={cellIndex} className="whitespace-nowrap px-3 py-2 text-fg-muted">
                            {cell || "—"}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <Button variant="secondary" onClick={restart} disabled={isBusy}>
                Choose a different file
              </Button>
              <PrimaryButton
                onClick={() => void handleValidate()}
                isLoading={isBusy}
                loadingLabel="Validating..."
              >
                Validate rows
              </PrimaryButton>
            </div>
          </div>
        </SectionCard>
      )}

      {step === "preview" && summary && (
        <>
          <SectionCard title="Validation summary" icon={CheckCircle2}>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              {([
                ["Total", summary.total],
                ["New", summary.new],
                ["Update", summary.update],
                ["Unchanged", summary.unchanged],
                ["Conflict", summary.conflict],
                ["Invalid", summary.invalid],
              ] as const).map(([label, value]) => (
                <div
                  key={label}
                  className="rounded-card border border-line bg-surface px-4 py-3 text-center"
                >
                  <p className="text-2xl font-semibold text-fg">{value}</p>
                  <p className="mt-0.5 text-xs text-fg-muted">{label}</p>
                </div>
              ))}
            </div>

            {summary.warnings > 0 && (
              <Alert tone="warning" className="mt-4">
                {summary.warnings} row{summary.warnings === 1 ? "" : "s"} have warnings. They
                will still be imported; review them below.
              </Alert>
            )}

            {blocked > 0 && (
              <Alert tone="info" className="mt-4">
                {blocked} row{blocked === 1 ? "" : "s"} cannot be imported and will be skipped.
                Nothing else in the file is affected by them.
              </Alert>
            )}
          </SectionCard>

          <SectionCard title="Row preview" icon={FileSpreadsheet} padded={false}>
            <div className="flex flex-wrap items-end justify-between gap-3 px-5 py-4">
              <FormField id="row-filter" label="Show" className="max-w-xs">
                <SelectInput
                  id="row-filter"
                  value={rowFilter}
                  onChange={(event) => {
                    setRowFilter(event.target.value as RowClassification | "");
                    setRowPage(1);
                  }}
                >
                  <option value="">All rows</option>
                  {(Object.keys(classificationLabels) as RowClassification[]).map((value) => (
                    <option key={value} value={value}>{classificationLabels[value]}</option>
                  ))}
                </SelectInput>
              </FormField>
              <p className="text-sm text-fg-muted">
                <span className="font-semibold text-fg">{rowTotal}</span>{" "}
                {rowTotal === 1 ? "row" : "rows"}
              </p>
            </div>

            <DataTable
              headers={["Row", "Outcome", "Employee", "Details"]}
              caption="Rows in the uploaded file and what will happen to each"
              minWidthClass="min-w-200"
              isLoading={rowsLoading}
              loadingLabel="Loading rows..."
              isEmpty={rows.length === 0}
              emptyState={
                <EmptyState
                  icon={FileSpreadsheet}
                  title="No rows match this filter"
                  description="Choose a different outcome to see more rows."
                />
              }
            >
              {rows.map((row) => {
                const data = (row.row_data ?? {}) as Record<string, string | null>;
                return (
                  <tr key={row.row_number}>
                    <td className="px-5 py-3 text-fg-muted">{row.row_number}</td>
                    <td className="px-5 py-3">
                      <StatusBadge
                        label={classificationLabels[row.classification]}
                        tone={classificationTone[row.classification]}
                        icon={row.classification === "invalid" || row.classification === "conflict"
                          ? AlertTriangle
                          : CheckCircle2}
                      />
                    </td>
                    <td className="px-5 py-3">
                      <p className="font-medium text-fg">{data.full_name ?? "—"}</p>
                      <p className="mt-0.5 text-xs text-fg-subtle">
                        {data.employee_number ?? "—"}
                        {data.email ? ` · ${data.email}` : ""}
                      </p>
                    </td>
                    <td className="px-5 py-3 text-sm">
                      {row.issues.length > 0 ? (
                        <ul className="space-y-1">
                          {row.issues.map((issue, index) => (
                            <li
                              key={index}
                              className={issue.level === "error" ? "text-danger-fg" : "text-warning-fg"}
                            >
                              {issue.message}
                            </li>
                          ))}
                        </ul>
                      ) : row.changed_fields.length > 0 ? (
                        <span className="text-fg-muted">
                          Changes: {row.changed_fields.join(", ")}
                        </span>
                      ) : (
                        <span className="text-fg-subtle">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </DataTable>

            <Pagination
              page={rowPage}
              pageSize={ROWS_PER_PAGE}
              totalItems={rowTotal}
              onPageChange={setRowPage}
            />
          </SectionCard>

          <SectionCard title="Confirm import" icon={Upload}>
            <div className="space-y-4">
              {summary.update > 0 && (
                <Checkbox
                  checked={applyUpdates}
                  disabled={isBusy}
                  onChange={(event) => setApplyUpdates(event.target.checked)}
                  label={`Update ${summary.update} existing employee${summary.update === 1 ? "" : "s"}`}
                  description="Without this, existing records are left exactly as they are."
                />
              )}

              {(validation?.missing_departments.length ?? 0) > 0 && (
                <Checkbox
                  checked={createDepartments}
                  disabled={isBusy}
                  onChange={(event) => setCreateDepartments(event.target.checked)}
                  label={`Create ${validation!.missing_departments.length} missing department${validation!.missing_departments.length === 1 ? "" : "s"}`}
                  description={`${validation!.missing_departments.join(", ")}. Rows referencing them stay invalid until the departments exist.`}
                />
              )}

              <p className="text-sm text-fg-muted">
                {nothingToDo && !createDepartments
                  ? "Nothing in this file would be imported with the current options."
                  : `${willCreate} employee${willCreate === 1 ? "" : "s"} will be created` +
                    (willUpdate > 0 ? ` and ${willUpdate} updated` : "") +
                    ". This runs as a single transaction."}
              </p>

              <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                <Button variant="secondary" onClick={restart} disabled={isBusy}>
                  Cancel
                </Button>
                <Button variant="secondary" onClick={() => setStep("mapping")} disabled={isBusy}>
                  Back to mapping
                </Button>
                <PrimaryButton
                  onClick={() => void handleConfirm()}
                  isLoading={isBusy}
                  loadingLabel="Importing..."
                  disabled={nothingToDo && !createDepartments}
                >
                  Import {willCreate + willUpdate} row{willCreate + willUpdate === 1 ? "" : "s"}
                </PrimaryButton>
              </div>
            </div>
          </SectionCard>
        </>
      )}

      {step === "done" && outcome && (
        <>
          <SectionCard title="Import complete" icon={CheckCircle2}>
            <Alert tone="success">
              {outcome.created} employee{outcome.created === 1 ? "" : "s"} created
              {outcome.updated > 0 ? `, ${outcome.updated} updated` : ""}
              {outcome.created_departments.length > 0
                ? `, ${outcome.created_departments.length} department${outcome.created_departments.length === 1 ? "" : "s"} created`
                : ""}
              .
            </Alert>
            <div className="mt-4 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <PrimaryButton onClick={restart}>Import another file</PrimaryButton>
            </div>
          </SectionCard>

          {outcome.credentials.length > 0 && (
            <SectionCard
              title="Temporary passwords"
              description="Shown once. Distribute them securely; HR Nexus does not store them."
              icon={KeyRound}
              actions={
                <Button
                  variant="secondary"
                  size="sm"
                  icon={Download}
                  onClick={() => downloadCredentials(outcome.credentials)}
                >
                  Download CSV
                </Button>
              }
            >
              <Alert tone="warning" className="mb-4">
                These passwords cannot be retrieved again. Download or copy them before
                leaving this page.
              </Alert>
              <div className="overflow-x-auto rounded-card border border-line">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-surface-muted text-fg-muted">
                    <tr>
                      <th className="px-4 py-2 font-medium">Employee</th>
                      <th className="px-4 py-2 font-medium">Email</th>
                      <th className="px-4 py-2 font-medium">Temporary password</th>
                    </tr>
                  </thead>
                  <tbody>
                    {outcome.credentials.map((credential) => (
                      <tr key={credential.employee_number} className="border-t border-line">
                        <td className="px-4 py-2">
                          <p className="text-fg">{credential.full_name}</p>
                          <p className="text-xs text-fg-subtle">{credential.employee_number}</p>
                        </td>
                        <td className="px-4 py-2 text-fg-muted">{credential.email}</td>
                        <td className="px-4 py-2 font-mono text-xs text-fg">
                          {credential.temporary_password}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </SectionCard>
          )}
        </>
      )}

      <SectionCard title="Import history" icon={History} padded={false}>
        {historyFailed ? (
          <div className="px-5 py-4">
            <Alert tone="warning">
              Import history could not be loaded. Imports themselves are unaffected.
            </Alert>
          </div>
        ) : (
          <DataTable
            headers={["File", "Status", "Rows", "Applied", "Started"]}
            caption="Previous import runs"
            minWidthClass="min-w-200"
            isEmpty={history.length === 0}
            emptyState={
              <EmptyState
                icon={History}
                title="No imports yet"
                description="Completed imports are recorded here for audit."
              />
            }
          >
            {history.map((job) => (
              <tr key={job.id}>
                <td className="px-5 py-3">
                  <p className="font-medium text-fg">{job.file_name}</p>
                  <p className="mt-0.5 text-xs text-fg-subtle">
                    {job.initiated_by_email ?? "Unknown administrator"}
                  </p>
                </td>
                <td className="px-5 py-3">
                  <StatusBadge
                    label={job.status.charAt(0).toUpperCase() + job.status.slice(1)}
                    tone={
                      job.status === "completed" ? "success"
                        : job.status === "failed" ? "danger"
                          : job.status === "ready" ? "info" : "neutral"
                    }
                    icon={job.status === "failed" ? AlertTriangle : CheckCircle2}
                  />
                  {job.error_message && (
                    <p className="mt-1 max-w-xs text-xs text-danger-fg">{job.error_message}</p>
                  )}
                </td>
                <td className="px-5 py-3 text-fg-muted">{job.total_rows}</td>
                <td className="px-5 py-3 text-fg-muted">
                  {job.created_count + job.updated_count > 0
                    ? `${job.created_count} new, ${job.updated_count} updated`
                    : "—"}
                </td>
                <td className="px-5 py-3 text-fg-muted">{formatDateTime(job.created_at)}</td>
              </tr>
            ))}
          </DataTable>
        )}
      </SectionCard>
    </section>
  );
}
