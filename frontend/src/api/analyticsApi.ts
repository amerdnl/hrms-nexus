import apiClient from "./axios";
import type { CompanyAnalytics, TeamAnalytics } from "../types/analytics";

type Envelope<T> = { success: boolean; data: T };

/** HR's company figures: onboarding, performance and recognition. */
export async function getCompanyAnalytics(): Promise<CompanyAnalytics> {
  const response = await apiClient.get<Envelope<CompanyAnalytics>>("/analytics/company");
  return response.data.data;
}

/** A manager's figures for their current direct reports. */
export async function getTeamAnalytics(): Promise<TeamAnalytics> {
  const response = await apiClient.get<Envelope<TeamAnalytics>>("/analytics/team");
  return response.data.data;
}
