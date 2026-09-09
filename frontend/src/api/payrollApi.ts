import apiClient from "./axios";
import type {
  CalculationSummary,
  CompensationRow,
  PayrollPeriod,
  PayrollRecord,
  PayrollRecordDetail,
  PayrollStatus,
  PayslipListEntry,
} from "../types/payroll";

interface Envelope<T> {
  success: boolean;
  message?: string;
  data: T;
}

export async function getPayrollPeriods(): Promise<PayrollPeriod[]> {
  const response = await apiClient.get<Envelope<{ periods: PayrollPeriod[] }>>("/payroll/periods");
  return response.data.data.periods;
}

export async function createPayrollPeriod(year: number, month: number): Promise<PayrollPeriod> {
  const response = await apiClient.post<Envelope<{ period: PayrollPeriod }>>(
    "/payroll/periods", { year, month },
  );
  return response.data.data.period;
}

export async function getPayrollPeriod(
  id: string,
): Promise<{ period: PayrollPeriod; records: PayrollRecord[] }> {
  const response = await apiClient.get<Envelope<{ period: PayrollPeriod; records: PayrollRecord[] }>>(
    `/payroll/periods/${id}`,
  );
  return response.data.data;
}

export async function calculatePayrollPeriod(id: string): Promise<CalculationSummary> {
  const response = await apiClient.post<Envelope<{ summary: CalculationSummary }>>(
    `/payroll/periods/${id}/calculate`, {},
  );
  return response.data.data.summary;
}

export async function setPayrollStatus(id: string, status: PayrollStatus): Promise<void> {
  await apiClient.put(`/payroll/periods/${id}/status`, { status });
}

export async function getPayrollRecord(recordId: string): Promise<PayrollRecordDetail> {
  const response = await apiClient.get<Envelope<PayrollRecordDetail>>(`/payroll/records/${recordId}`);
  return response.data.data;
}

/** Hours are sent as a string so the value cannot lose precision in transit. */
export async function setPayrollOvertime(recordId: string, hours: string): Promise<void> {
  await apiClient.put(`/payroll/records/${recordId}/overtime`, { hours });
}

export async function addPayrollItem(
  recordId: string,
  input: { itemType: "earning" | "deduction"; label: string; amount: string; isStatutory?: boolean },
): Promise<void> {
  await apiClient.post(`/payroll/records/${recordId}/items`, input);
}

export async function deletePayrollItem(recordId: string, itemId: string): Promise<void> {
  await apiClient.delete(`/payroll/records/${recordId}/items/${itemId}`);
}

export async function getCompensation(employeeId: number): Promise<CompensationRow[]> {
  const response = await apiClient.get<Envelope<{ compensation: CompensationRow[] }>>(
    `/payroll/compensation/${employeeId}`,
  );
  return response.data.data.compensation;
}

export async function setCompensation(
  employeeId: number,
  input: {
    basicSalary: string; allowance: string; overtimeRate: string;
    effectiveFrom: string; note?: string;
  },
): Promise<void> {
  await apiClient.post(`/payroll/compensation/${employeeId}`, input);
}

export async function getMyPayslips(): Promise<PayslipListEntry[]> {
  const response = await apiClient.get<Envelope<{ payslips: PayslipListEntry[] }>>(
    "/payroll/me/payslips",
  );
  return response.data.data.payslips;
}

export async function getMyPayslip(recordId: string): Promise<PayrollRecordDetail> {
  const response = await apiClient.get<Envelope<PayrollRecordDetail>>(
    `/payroll/me/payslips/${recordId}`,
  );
  return response.data.data;
}
