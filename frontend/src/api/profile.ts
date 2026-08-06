import apiClient from "./axios";
import type { ApiResponse, CurrentUser } from "../types/auth";

export interface ProfileUpdates {
  phone: string;
  address: string;
  emergency_contact_name: string;
  emergency_contact_phone: string;
  profile_image: string;
}

export interface PasswordChange {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

export async function getProfileRequest() {
  const response = await apiClient.get<ApiResponse<{ user: CurrentUser }>>(
    "/profile",
  );
  return response.data.data!.user;
}

export async function updateProfileRequest(updates: ProfileUpdates) {
  const response = await apiClient.put<ApiResponse<{ user: CurrentUser }>>(
    "/profile",
    updates,
  );
  return response.data.data!.user;
}

export async function changePasswordRequest(payload: PasswordChange) {
  const response = await apiClient.put<ApiResponse>("/profile/password", payload);
  return response.data;
}
