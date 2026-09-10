import { createContext } from "react";
import type { CurrentUser } from "../types/auth";

export interface AuthContextValue {
  user: CurrentUser | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  /** Resolves with the signed-in user, so the caller can route on more than the role. */
  login: (email: string, password: string) => Promise<CurrentUser>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | undefined>(undefined);
