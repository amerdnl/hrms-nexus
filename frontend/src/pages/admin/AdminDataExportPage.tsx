import { Database, Download, FileSpreadsheet, ShieldCheck } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { getApiErrorMessage } from "../../api/axios";
import {
  downloadDatasetCsv,
  downloadWorkbook,
  getExportCatalogue,
  readBlobErrorMessage,
  type ExportCatalogue,
} from "../../api/exportApi";
import Alert from "../../components/ui/Alert";
import Button from "../../components/ui/Button";
import EmptyState from "../../components/ui/EmptyState";
import PageHeader from "../../components/ui/PageHeader";
import SectionCard from "../../components/ui/SectionCard";

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
      setError(await readBlobErrorMessage(requestError, `Unable to export ${label}.`));
    } finally {
      setBusy(null);
    }
  };

  if (loading) {
    return <p className="text-sm text-fg-muted">Loading export options...</p>;
  }

  return (
    <section className="mx-auto max-w-7xl space-y-6">
      <PageHeader
        title="Company data export"
        description="Take a complete copy of this company's HR data, as one workbook or as individual CSV files."
      />

      {error && <Alert tone="danger">{error}</Alert>}
      {message && <Alert tone="success">{message}</Alert>}

      <SectionCard
        title="Everything, as one workbook"
        description="One .xlsx file with a clearly named sheet for each dataset below."
        icon={FileSpreadsheet}
      >
        <div className="flex flex-wrap items-center gap-3">
          <Button
            icon={Download}
            onClick={() => run("workbook", downloadWorkbook, "The company workbook")}
            disabled={busy !== null}
          >
            {busy === "workbook" ? "Preparing..." : "Download XLSX workbook"}
          </Button>

          <p className="text-xs text-fg-subtle">
            Amounts are written as exact text so no sen is lost to rounding.
          </p>
        </div>
      </SectionCard>

      <SectionCard
        title="Individual datasets"
        description="Each downloads as a CSV file with a UTF-8 byte order mark, so Excel reads names correctly."
        icon={Database}
        padded={(catalogue?.datasets.length ?? 0) > 0}
      >
        {!catalogue || catalogue.datasets.length === 0 ? (
          <EmptyState
            icon={Database}
            title="The export list could not be read"
            description="This is a temporary problem reading the list, not an absence of data."
            action={<Button onClick={() => { setLoading(true); void load(); }}>Try again</Button>}
          />
        ) : (
          <ul className="divide-y divide-line">
            {catalogue.datasets.map((dataset) => (
              <li
                key={dataset.key}
                className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-fg">{dataset.label}</p>
                  <p className="mt-0.5 text-xs text-fg-subtle">{dataset.description}</p>
                </div>

                <Button
                  variant="secondary"
                  icon={Download}
                  onClick={() =>
                    run(dataset.key, () => downloadDatasetCsv(dataset.key), dataset.label)
                  }
                  disabled={busy !== null}
                >
                  {busy === dataset.key ? "Preparing..." : "CSV"}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <SectionCard title="What an export contains" icon={ShieldCheck}>
        <ul className="space-y-2 text-sm text-fg-muted">
          <li>
            <span className="font-medium text-fg">Never included:</span> passwords and password
            hashes, QR codes and their token hashes, attendance coordinates, GPS accuracy and
            distance from the office, the office location itself, and the raw contents of
            uploaded import files, which can carry a temporary password.
          </li>
          <li>
            <span className="font-medium text-fg">Money</span> is written exactly, from whole
            sen, as text. It is never converted to a decimal number, because that cannot
            represent every amount without rounding.
          </li>
          <li>
            <span className="font-medium text-fg">Historical values</span> are exported as they
            were recorded. An issued payslip exports the figures it was issued with, whatever
            has changed since.
          </li>
          <li>
            <span className="font-medium text-fg">Every export is recorded</span> in the audit
            log: who took it, when, and how many rows. The exported data itself is not stored
            there.
          </li>
          {catalogue && (
            <li>
              <span className="font-medium text-fg">Limits:</span>{" "}
              {catalogue.maxRowsPerDataset.toLocaleString()} rows per dataset and{" "}
              {catalogue.maxRowsPerWorkbook.toLocaleString()} rows per workbook. An export over
              a limit is refused rather than silently shortened.
            </li>
          )}
        </ul>
      </SectionCard>
    </section>
  );
}
