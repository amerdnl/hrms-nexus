import apiClient from "./axios";
import type { DashboardLayout, DashboardLayoutState } from "../types/dashboardLayout";

interface Envelope<T> {
  success: boolean;
  message?: string;
  data: T;
}

/** The signed-in account's saved Home layout; `layout: null` is the default Home. */
export async function getDashboardLayout(): Promise<DashboardLayoutState> {
  const response = await apiClient.get<Envelope<DashboardLayoutState>>("/dashboard/layout");
  return response.data.data;
}

export async function saveDashboardLayout(layout: DashboardLayout): Promise<DashboardLayoutState> {
  const response = await apiClient.put<Envelope<DashboardLayoutState>>("/dashboard/layout", { layout });
  return response.data.data;
}

/** Reset to default: removes the saved layout. */
export async function resetDashboardLayout(): Promise<DashboardLayoutState> {
  const response = await apiClient.delete<Envelope<DashboardLayoutState>>("/dashboard/layout");
  return response.data.data;
}
