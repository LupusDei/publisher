"use client";

/**
 * AuthContext — the single source of truth for the current session (85q.5).
 *
 * Holds the JWT + current user, persists the token to localStorage, and
 * rehydrates the session on mount by resolving the stored token through
 * GET /auth/me. Exposes `login`, `register`, and `logout` plus a `useAuth()`
 * hook. A coarse `status` (`loading` | `authenticated` | `unauthenticated`)
 * lets guards and pages render intentional loading / signed-out states.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  loginRequest,
  registerRequest,
  fetchMe,
  logoutRequest,
  readToken,
  writeToken,
  clearToken,
  type AuthUser,
} from "./auth-api";

/** Where the session is in its lifecycle. */
export type AuthStatus = "loading" | "authenticated" | "unauthenticated";

export interface AuthContextValue {
  status: AuthStatus;
  user: AuthUser | null;
  token: string | null;
  /** Sign in; resolves on success, rejects (with a message) on failure. */
  login: (email: string, password: string) => Promise<AuthUser>;
  /** Create an account + sign in; same contract as `login`. */
  register: (email: string, password: string) => Promise<AuthUser>;
  /** Clear the session (best-effort server notify) and drop the token. */
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({
  children,
}: {
  children: ReactNode;
}): React.ReactElement {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [status, setStatus] = useState<AuthStatus>("loading");
  // Guards against a late rehydration overwriting a fresh login (race safety).
  const rehydrated = useRef(false);

  // Rehydrate from a stored token exactly once on mount.
  useEffect(() => {
    let cancelled = false;
    const stored = readToken();
    if (!stored) {
      rehydrated.current = true;
      setStatus("unauthenticated");
      return;
    }
    void (async () => {
      try {
        const me = await fetchMe(stored);
        if (cancelled || rehydrated.current) return;
        setUser(me);
        setToken(stored);
        setStatus("authenticated");
      } catch {
        if (cancelled || rehydrated.current) return;
        // Stale / invalid token — drop it and present the signed-out state.
        clearToken();
        setUser(null);
        setToken(null);
        setStatus("unauthenticated");
      }
      // NB: do NOT flip `rehydrated.current` here. Under React Strict Mode the
      // effect mounts → unmounts → remounts in dev, so two fetchMe() calls are
      // in flight; the first (cancelled) one finishing must not set the guard,
      // or the second (live) call sees it true and returns WITHOUT setting
      // status — pinning the UI on "Checking your session…". The guard exists
      // only to stop a slow rehydration from clobbering a fresh login, and
      // that path is owned by adopt() (login/register), which sets it.
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /** Adopt a fresh session: persist the token and set the user. */
  const adopt = useCallback((next: { token: string; user: AuthUser }) => {
    rehydrated.current = true;
    writeToken(next.token);
    setToken(next.token);
    setUser(next.user);
    setStatus("authenticated");
  }, []);

  const login = useCallback(
    async (email: string, password: string): Promise<AuthUser> => {
      const result = await loginRequest({ email, password });
      adopt(result);
      return result.user;
    },
    [adopt],
  );

  const register = useCallback(
    async (email: string, password: string): Promise<AuthUser> => {
      const result = await registerRequest({ email, password });
      adopt(result);
      return result.user;
    },
    [adopt],
  );

  const logout = useCallback((): void => {
    const current = token ?? readToken();
    if (current) void logoutRequest(current);
    clearToken();
    setToken(null);
    setUser(null);
    setStatus("unauthenticated");
  }, [token]);

  const value = useMemo<AuthContextValue>(
    () => ({ status, user, token, login, register, logout }),
    [status, user, token, login, register, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/** Access the auth session. Throws if used outside an `AuthProvider`. */
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
}
