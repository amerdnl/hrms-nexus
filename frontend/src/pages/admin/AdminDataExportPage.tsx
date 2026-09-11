import {
  CalendarDays,
  Clock3,
  Database,
  Download,
  FileSpreadsheet,
  FileText,
  History,
  Lock,
  ScrollText,
  ShieldCheck,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { getApiErrorMessage } from "../../api/axios";
import {
  downloadDatasetCsv,
  downloadWorkbook,
  getExportCatalogue,
  readBlobErrorMessage,
  type ExportCatalogue,
  type ExportDataset,
} from "../../api/exportApi";
import Alert from "../../components/ui/Alert";
import Button from "../../components/ui/Button";
import ErrorState from "../../components/ui/ErrorState";
import PageHeader from "../../components/ui/PageHeader";
import SectionCard from "../../components/ui/SectionCard";
import Skeleton, { SkeletonText } from "../../components/ui/Skeleton";

/**
 * Presentation grouping only. The server's catalogue is authoritative and
 * unordered; this sorts it into sections a person can scan. A dataset the
 * server adds that is not listed here lands in "Other" rather than being
 * dropped, so the page can never silently hide an export.
 */
const GROUPS: Array<{ id: string; label: string; icon: LucideIcon; keys: string[] }> = [
  { id: "people", label: "People and organisation", icon: Users,
    keys: ["employees", "departments", "user-accounts", "company-settings"] },
  { id: "time", label: "Attendance", icon: Clock3, keys: ["attendance"] },
  { id: "leave", label: "Leave", icon: CalendarDays,
    keys: ["leave-requests", "leave-entitlements", "leave-balances", "leave-policies"] },
  { id: "pay", label: "Pay", icon: Wallet,
    keys: ["compensation", "payroll-periods", "payroll-records", "payroll-items"] },
  { id: "records", label: "Records", icon: History, keys: ["audit-events", "import-history"] },
];

export default function AdminDataExportPage() {
  const [catalogue, setCatalogue] = useState<ExportCatalogue | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  /** The key currently downloading, or "workbook". Null when idle. */
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError("");
    try {
      setCatalogue(await getExportCatalogue());
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, "Unable to load the export list."));
      setCatalogue(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const run = async (key: string, action: () => Promise<void>, label: string) => {
    setBusy(key);
    setError("");
    setMessage("");
    try {
      await action();
      setMessage(`${label} downloaded.`);
    } catch (requestError) {
      // A refusal - for example a dataset over its row limit - arrives here with
      // the server's own explanation, which is shown as it is.
      setError(await readBlobErrorMessage(requestError, `Unable to export ${label}.`));
    } finally {
      setBusy(null);
    }
  };

  const grouped = useMemo(() => {
    const datasets = catalogue?.datasets ?? [];
    const known = new Set(GROUPS.flatMap((group) => group.keys));
    const sections = GROUPS.map((group) => ({
      ...group,
      datasets: group.keys
        .map((key) => datasets.find((dataset) => dataset.key === key))
        .filter((dataset): dataset is ExportDataset => Boolean(dataset)),
    }));
    const other = datasets.filter((dataset) => !known.has(dataset.key));
    if (other.length) sections.push({ id: "other", label: "Other", icon: Database, keys: [], datasets: other });
    return sections.filter((section) => section.datasets.length > 0);
  }, [catalogue]);

  return (
    <section className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        title="Company data export"
        description="Take a complete copy of this company's HR data, as one workbook or as individual CSV files."
      />

      {error && <Alert tone="danger" onDismiss={() => setError("")}>{error}</Alert>}
      {message && <Alert tone="success" onDismiss={() => setMessage("")}>{message}</Alert>}

      {/* The two formats, side by side, so the choice is made before scrolling:
          everything in one workbook, or one dataset at a time. No PDF - the
          product does not produce one. */}
      <div className="grid gap-4 md:grid-cols-2">
        <SectionCard className="border-primary/40">
          <div className="flex h-full flex-col">
            <span className="grid h-11 w-11 place-items-center rounded-xl bg-primary-soft text-primary" aria-hidden="true">
              <FileSpreadsheet size={22} />
            </span>
            <h2 className="mt-4 text-lg font-semibold text-fg">Everything, as one workbook</h2>
            <p className="mt-1 text-sm text-fg-muted">
              One .xlsx file with a clearly named sheet for every dataset on this page.
              Money is written as exact text, so no sen is lost to rounding.
            </p>
            {catalogue && (
              <p className="mt-2 text-xs text-fg-subtle">
                Up to {catalogue.maxRowsPerWorkbook.toLocaleString()} rows across the
                whole workbook. A larger export is refused, never shortened.
              </p>
            )}
            <div className="mt-5 flex-1" />
            <Button
              icon={Download}
              isLoading={busy === "workbook"}
              loadingLabel="Preparing workbook..."
              onClick={() => run("workbook", downloadWorkbook, "The company workbook")}
              disabled={busy !== null || loading || !catalogue}
              className="self-start"
            >
              Download XLSX workbook
            </Button>
          </div>
        </SectionCard>

        <SectionCard>
          <div className="flex h-full flex-col">
            <span className="grid h-11 w-11 place-items-center rounded-xl bg-surface-muted text-fg-muted" aria-hidden="true">
              <FileText size={22} />
            </span>
            <h2 className="mt-4 text-lg font-semibold text-fg">One dataset, as CSV</h2>
            <p className="mt-1 text-sm text-fg-muted">
              Each dataset below downloads on its own as a CSV file with a UTF-8 byte
              order mark, so Excel reads names correctly.
            </p>
            {catalogue && (
              <p className="mt-2 text-xs text-fg-subtle">
                Up to {catalogue.maxRowsPerDataset.toLocaleString()} rows per dataset. A
                larger export is refused, never shortened.
              </p>
            )}
          </div>
        </SectionCard>
      </div>

      {loading ? (
        <SectionCard>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-busy="true">
            <p className="sr-only" aria-live="polite">Loading export options</p>
            {Array.from({ length: 6 }, (_, index) => (
              <div key={index} className="rounded-xl border border-line p-4">
                <Skeleton className="h-4 w-32" />
                <SkeletonText lines={2} className="mt-3" />
              </div>
            ))}
          </div>
        </SectionCard>
      ) : !catalogue || catalogue.datasets.length === 0 ? (
        <SectionCard>
          <ErrorState
            title="The export list could not be read"
            description="This is a temporary problem reading the list, not an absence of data."
            onRetry={() => { setLoading(true); void load(); }}
          />
        </SectionCard>
      ) : (
        <div className="space-y-6">
          {grouped.map((section) => (
            <section key={section.id} aria-labelledby={`group-${section.id}`} className="space-y-3">
              <h2 id={`group-${section.id}`} className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-fg-muted">
                <section.icon size={16} className="text-primary" aria-hidden="true" />
                {section.label}
              </h2>
              <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {section.datasets.map((dataset) => (
                  <li
                    key={dataset.key}
                    className="flex flex-col rounded-card border border-line bg-surface p-4 shadow-card transition-colors hover:border-control-border"
                  >
                    <p className="text-sm font-semibold text-fg">{dataset.label}</p>
                    <p className="mt-1 flex-1 text-xs leading-relaxed text-fg-muted">{dataset.description}</p>
                    <Button
                      variant="secondary"
                      size="sm"
                      icon={Download}
                      isLoading={busy === dataset.key}
                      loadingLabel="Preparing..."
                      onClick={() => run(dataset.key, () => downloadDatasetCsv(dataset.key), dataset.label)}
                      disabled={busy !== null}
                      aria-label={`Download ${dataset.label} as CSV`}
                      className="mt-4 self-start"
                    >
                      CSV
                    </Button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      <SectionCard title="What an export contains" icon={ShieldCheck}>
        <ul className="grid gap-5 sm:grid-cols-2">
          {[
            {
              icon: Lock,
              title: "Never included",
              body: "Passwords and password hashes, QR codes and their token hashes, attendance coordinates, GPS accuracy and distance from the office, the office location itself, and the raw contents of uploaded import files, which can carry a temporary password.",
            },
            {
              icon: Wallet,
              title: "Money is exact",
              body: "Written from whole sen, as text. It is never converted to a decimal number, because that cannot represent every amount without rounding.",
            },
            {
              icon: History,
              title: "History as recorded",
              body: "Historical values are exported as they were recorded. An issued payslip exports the figures it was issued with, whatever has changed since.",
            },
            {
              icon: ScrollText,
              title: "Every export is logged",
              body: "The audit log records who took it, when, and how many rows. The exported data itself is not stored there.",
            },
          ].map(({ icon: Icon, title, body }) => (
            <li key={title} className="flex gap-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-surface-muted text-primary" aria-hidden="true">
                <Icon size={17} />
              </span>
              <div>
                <p className="text-sm font-semibold text-fg">{title}</p>
                <p className="mt-0.5 text-sm text-fg-muted">{body}</p>
              </div>
            </li>
          ))}
        </ul>
      </SectionCard>
    </section>
  );
}
