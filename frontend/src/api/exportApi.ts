import apiClient from "./axios";

interface Envelope<T> {
  success: boolean;
  message?: string;
  data: T;
}

export interface ExportDataset {
  key: string;
  label: string;
  description: string;
  columns: number;
}

export interface ExportCatalogue {
  datasets: ExportDataset[];
  maxRowsPerDataset: number;
  maxRowsPerWorkbook: number;
}

export async function getExportCatalogue(): Promise<ExportCatalogue> {
  const response = await apiClient.get<Envelope<ExportCatalogue>>("/export/datasets");
  return response.data.data;
}

/**
 * Downloads an export.
 *
 * A plain <a href> cannot be used: exports are authorized like every other
 * endpoint and the bearer token lives in memory, not in a cookie, so the request
 * has to go through the configured client. The response is fetched as a blob and
 * handed to the browser through a temporary object URL.
 */
async function download(path: string, fallbackName: string): Promise<void> {
  const response = await apiClient.get<Blob>(path, { responseType: "blob" });

  // The server names the file; the header is only read, never constructed here.
  const disposition = String(response.headers["content-disposition"] ?? "");
  const match = /filename="?([^";]+)"?/.exec(disposition);
  const filename = match?.[1] ?? fallbackName;

  const url = URL.createObjectURL(response.data);
  try {
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.append(link);
    link.click();
    link.remove();
  } finally {
    // Revoked on the next tick so the click has started the download first.
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}

export async function downloadDatasetCsv(key: string): Promise<void> {
  await download(`/export/datasets/${key}/csv`, `${key}.csv`);
}

export async function downloadWorkbook(): Promise<void> {
  await download("/export/workbook", "hr-nexus-company-export.xlsx");
}

/**
 * An error body from a blob request arrives as a Blob, so the usual message
 * extraction sees nothing useful. This reads the JSON back out of it.
 */
export async function readBlobErrorMessage(error: unknown, fallback: string): Promise<string> {
  const data = (error as { response?: { data?: unknown } })?.response?.data;
  if (!(data instanceof Blob)) return fallback;
  try {
    const parsed = JSON.parse(await data.text()) as { message?: string };
    return parsed.message ?? fallback;
  } catch {
    return fallback;
  }
}
