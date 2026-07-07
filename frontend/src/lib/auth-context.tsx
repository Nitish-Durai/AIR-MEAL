"use client";

/**
 * AuthContext
 * -----------
 * Typed context that stores JWT tokens and user identity.
 *
 * Storage: localStorage (acceptable for local demo; in production use
 * httpOnly cookies set by the backend to protect against XSS).
 *
 * Token refresh: the context does NOT auto-refresh tokens on expiry.
 * If the access token expires the user sees a 401 and is redirected to /login.
 * Proactive silent refresh will be added in Phase 6.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

import { api, ApiError } from "@/lib/api";

// ── Types ─────────────────────────────────────────────────────────────────────

export type Role = "passenger" | "crew" | "admin";

export interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  role: Role | null;
  userId: string | null;
  email: string | null;
  /** true while localStorage is being read on first mount */
  isLoading: boolean;
}

export interface AuthContextValue extends AuthState {
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<{ role: Role; userId: string }>;
  register: (payload: RegisterPayload) => Promise<{ role: Role; userId: string }>;
  logout: () => void;
  loginWithToken: (token: string) => void;
}

export interface RegisterPayload {
  pnr?: string;
  first_name: string;
  last_name: string;
  email: string;
  password: string;
  dob?: string;
  nationality?: string;
  dietary_flags?: Record<string, boolean>;
  allergy_flags?: Record<string, boolean>;
  cuisine_prefs?: Record<string, number>;
  portion_pref?: string;
  price_sensitivity?: string;
}

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  role: Role;
  user_id: string;
}

// ── Storage key ────────────────────────────────────────────────────────────────

const STORAGE_KEY = "airmeal_auth";

const EMPTY_STATE: AuthState = {
  accessToken: null,
  refreshToken: null,
  role: null,
  userId: null,
  email: null,
  isLoading: true,
};

// ── Context ────────────────────────────────────────────────────────────────────

const AuthContext = createContext<AuthContextValue | null>(null);

// ── Provider ───────────────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>(EMPTY_STATE);

  // Rehydrate from localStorage on first client mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed: Omit<AuthState, "isLoading"> = JSON.parse(raw);
        setState({ ...parsed, isLoading: false });
      } else {
        setState((s) => ({ ...s, isLoading: false }));
      }
    } catch {
      setState((s) => ({ ...s, isLoading: false }));
    }
  }, []);

  /** Persist tokens + identity to state and localStorage */
  const persist = useCallback(
    (access: string, refresh: string, role: Role, userId: string, email: string) => {
      const next: AuthState = {
        accessToken: access,
        refreshToken: refresh,
        role,
        userId,
        email,
        isLoading: false,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      setState(next);
    },
    [],
  );

  const login = useCallback(
    async (email: string, password: string) => {
      const data = await api.post<TokenResponse>("/auth/login", { email, password });
      persist(data.access_token, data.refresh_token, data.role, data.user_id, email);
      return { role: data.role, userId: data.user_id };
    },
    [persist],
  );

  const register = useCallback(
    async (payload: RegisterPayload) => {
      const data = await api.post<TokenResponse>("/auth/register", payload);
      persist(data.access_token, data.refresh_token, data.role, data.user_id, payload.email);
      return { role: data.role, userId: data.user_id };
    },
    [persist],
  );

  const loginWithToken = useCallback(
    (token: string) => {
      try {
        const base64Url = token.split(".")[1];
        const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
        const jsonPayload = decodeURIComponent(
          atob(base64)
            .split("")
            .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
            .join("")
        );
        const decoded = JSON.parse(jsonPayload);
        const userId = decoded.sub;
        const email = decoded.email || `guest_${userId.substring(0, 8)}@airmeal.guest`;
        const role = (decoded.role || "passenger") as Role;
        persist(token, "", role, userId, email);
      } catch (err) {
        console.error("Token decoding failed", err);
        throw new Error("Invalid access token");
      }
    },
    [persist],
  );

  const logout = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setState({ ...EMPTY_STATE, isLoading: false });
  }, []);

  return (
    <AuthContext.Provider
      value={{
        ...state,
        isAuthenticated: !!state.accessToken,
        login,
        register,
        logout,
        loginWithToken,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

// ── Hook ───────────────────────────────────────────────────────────────────────

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be called inside <AuthProvider>");
  return ctx;
}

// Re-export ApiError so callers don't need a separate import
export { ApiError };
