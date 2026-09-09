import apiClient from "./axios";
import type { AuditPage } from "../types/audit";

interface Envelope<T> {
  success: boolean;
  message?: string;
  data: T;
}

export interface AuditFilters {
  action?: string;
  entityType?: string;
  outcome?: string;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
}

export async function getAuditLog(filters: AuditFilters): Promise<AuditPage> {
  const params: Record<string, string> = {};
  if (filters.action) params.action = filters.action;
  if (filters.entityType) params.entityType = filters.entityType;
  if (filters.outcome) params.outcome = filters.outcome;
  if (filters.from) params.from = filters.from;
  if (filters.to) params.to = filters.to;
  if (filters.page) params.page = String(filters.page);
  if (filters.pageSize) params.pageSize = String(filters.pageSize);

  const response = await apiClient.get<Envelope<AuditPage>>("/audit", { params });
  return response.data.data;
}
