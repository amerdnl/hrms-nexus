import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  currentUserRequest,
  loginRequest,
  logoutRequest,
} from "../api/auth";
import {
  AUTH_TOKEN_KEY,
  UNAUTHORIZED_EVENT,
} from "../api/axios";
import type { CurrentUser } from "../types/auth";
import { AuthContext, type AuthContextValue } from "./AuthContext";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() =>
    localStorage.getItem(AUTH_TOKEN_KEY),
  );
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const clearSession = useCallback(() => {
    localStorage.removeItem(AUTH_TOKEN_KEY);
    setToken(null);
    setUser(null);
  }, []);

  const refreshUser = useCallback(async () => {
    const storedToken = localStorage.getItem(AUTH_TOKEN_KEY);

    if (!storedToken) {
      clearSession();
      return;
    }

    const currentUser = await currentUserRequest();
    setToken(storedToken);
    setUser(currentUser);
  }, [clearSession]);

  useEffect(() => {
    const restoreSession = async () => {
      try {
        await refreshUser();
      } catch {
        clearSession();
      } finally {
        setIsLoading(false);
      }
    };

    void restoreSession();
  }, [clearSession, refreshUser]);

  useEffect(() => {
    window.addEventListener(UNAUTHORIZED_EVENT, clearSession);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, clearSession);
  }, [clearSession]);

  const login = useCallback(async (email: string, password: string) => {
    const result = await loginRequest(email, password);
    localStorage.setItem(AUTH_TOKEN_KEY, result.token);
    setToken(result.token);
    setUser(result.user);
    return result.user.role;
  }, []);

  const logout = useCallback(async () => {
    try {
      if (localStorage.getItem(AUTH_TOKEN_KEY)) {
        await logoutRequest();
      }
    } catch {
      // Local logout must succeed even when the API is unavailable.
    } finally {
      clearSession();
    }
  }, [clearSession]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      token,
      isAuthenticated: Boolean(token && user),
      isLoading,
      login,
      logout,
      refreshUser,
    }),
    [isLoading, login, logout, refreshUser, token, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
