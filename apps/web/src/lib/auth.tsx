import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import { API_BASE_URL } from "./api";

export type User = {
  id: string;
  email: string;
  fullName: string;
  position: string | null;
  role: string;
};

type AuthState = {
  user: User | null;
  token: string | null;
  loading: boolean;
  setupRequired: boolean | null;
};

type AuthContextType = AuthState & {
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  setup: (email: string, password: string, fullName: string, position?: string) => Promise<void>;
  checkSetupRequired: () => Promise<boolean>;
};

const AuthContext = createContext<AuthContextType | null>(null);

const TOKEN_KEY = "edge_monitoring_token";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    token: localStorage.getItem(TOKEN_KEY),
    loading: true,
    setupRequired: null
  });

  const setToken = useCallback((token: string | null) => {
    if (token) {
      localStorage.setItem(TOKEN_KEY, token);
    } else {
      localStorage.removeItem(TOKEN_KEY);
    }
    setState((s) => ({ ...s, token }));
  }, []);

  const checkSetupRequired = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/auth/setup-required`);
      const data = await res.json();
      setState((s) => ({ ...s, setupRequired: data.setupRequired }));
      return data.setupRequired;
    } catch {
      return false;
    }
  }, []);

  const fetchUser = useCallback(async (token: string) => {
    try {
      const res = await fetch(`${API_BASE_URL}/auth/me`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) {
        throw new Error("Failed to fetch user");
      }
      const data = await res.json();
      setState((s) => ({ ...s, user: data.user, loading: false }));
    } catch {
      setToken(null);
      setState((s) => ({ ...s, user: null, loading: false }));
    }
  }, [setToken]);

  useEffect(() => {
    const init = async () => {
      const setupRequired = await checkSetupRequired();
      if (setupRequired) {
        setState((s) => ({ ...s, loading: false }));
        return;
      }

      if (state.token) {
        await fetchUser(state.token);
      } else {
        setState((s) => ({ ...s, loading: false }));
      }
    };
    init();
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const res = await fetch(`${API_BASE_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password })
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.message || "Login failed");
    }

    const data = await res.json();
    setToken(data.token);
    setState((s) => ({ ...s, user: data.user, setupRequired: false }));
  }, [setToken]);

  const logout = useCallback(async () => {
    if (state.token) {
      try {
        await fetch(`${API_BASE_URL}/auth/logout`, {
          method: "POST",
          headers: { Authorization: `Bearer ${state.token}` }
        });
      } catch {
        // Ignore logout errors
      }
    }
    setToken(null);
    setState((s) => ({ ...s, user: null }));
  }, [state.token, setToken]);

  const setup = useCallback(async (email: string, password: string, fullName: string, position?: string) => {
    const res = await fetch(`${API_BASE_URL}/auth/setup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, fullName, position })
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.message || "Setup failed");
    }

    const data = await res.json();
    setToken(data.token);
    setState((s) => ({ ...s, user: data.user, setupRequired: false }));
  }, [setToken]);

  return (
    <AuthContext.Provider value={{ ...state, login, logout, setup, checkSetupRequired }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
}

export function getStoredToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}
