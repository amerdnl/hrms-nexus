import apiClient from "./axios";
import type { ApiResponse, CurrentUser } from "../types/auth";

export async function loginRequest(email: string, password: string) {
  const response = await apiClient.post<
    ApiResponse<{ token: string; user: CurrentUser }>
  >("/auth/login", { email, password });
  return response.data.data!;
}

export async function currentUserRequest() {
  const response = await apiClient.get<ApiResponse<{ user: CurrentUser }>>(
    "/auth/me",
  );
  return response.data.data!.user;
}

export async function logoutRequest(): Promise<void> {
  await apiClient.post("/auth/logout");
}
