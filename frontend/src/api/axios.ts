import axios from "axios";

export const AUTH_TOKEN_KEY = "hr_nexus_token";
export const UNAUTHORIZED_EVENT = "hr-nexus:unauthorized";

const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL ?? "http://localhost:5001/api",
  headers: { "Content-Type": "application/json" },
});

apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem(AUTH_TOKEN_KEY);

  if (config.data instanceof FormData) {
    config.headers.delete("Content-Type");
  }

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  (error: unknown) => {
    if (axios.isAxiosError(error) && error.response?.status === 401) {
      localStorage.removeItem(AUTH_TOKEN_KEY);
      window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
    }

    return Promise.reject(error);
  },
);

export function getApiErrorMessage(error: unknown, fallback: string): string {
  if (axios.isAxiosError<{ message?: string }>(error)) {
    return error.response?.data?.message ?? fallback;
  }

  return fallback;
}

export function resolveProfileImageUrl(imagePath: string | null): string | null {
  if (!imagePath?.startsWith("/uploads/profile-images/")) return null;

  const apiBaseUrl = new URL(
    import.meta.env.VITE_API_BASE_URL ?? "http://localhost:5001/api",
    window.location.origin,
  );

  return new URL(imagePath, apiBaseUrl.origin).toString();
}

export default apiClient;
