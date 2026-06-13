/**
 * Auth API client + token plumbing for the frontend (task 85q.5 / T010).
 *
 * Owns the wire contract against the backend auth router:
 *   POST /auth/register {email,password} -> 201 {token,user}
 *   POST /auth/login    {email,password} -> 200 {token,user}
 *   GET  /auth/me        (Bearer)        -> 200 user
 *   POST /auth/logout                     -> 200 (stateless; client clears token)
 *
 * The JWT is held in localStorage so a session survives a reload, and is
 * attached as `Authorization: Bearer <token>` by `authFetch`. The base URL
 * comes from NEXT_PUBLIC_API_BASE so one build points at local or deployed.
 *
 * The authenticated user shape is the shared `User` contract from
 * @publisher/shared (`{ id, email, role, createdAt }`) — single source of
 * truth so the wire contract and the UI never drift. `AuthUser` is kept as a
 * local alias for readability at call sites.
 */

import type { User, Role } from "@publisher/shared";

export const AUTH_API_BASE =
  process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:4000";

/** The localStorage key the JWT is persisted under. */
export const TOKEN_STORAGE_KEY = "publisher.auth.token";

/** A user's role. Backend issues "user" by default; admins pass requireAdmin. */
export type { Role };

/** The authenticated user as returned by the backend (no passwordHash). */
export type AuthUser = User;

/** Email + password as posted to /auth/login and /auth/register. */
export interface Credentials {
  email: string;
  password: string;
}

/** The success envelope from /auth/login and /auth/register. */
export interface AuthResult {
  token: string;
  user: AuthUser;
}

interface ApiErrorBody {
  error?: { message?: string; issues?: { path: string; message: string }[] };
}

/** Pull the clearest possible message out of a structured error response. */
async function readError(res: Response, fallback: string): Promise<string> {
  try {
    const body = (await res.json()) as ApiErrorBody;
    if (body.error?.issues && body.error.issues.length > 0) {
      return body.error.issues.map((i) => `${i.path}: ${i.message}`).join("; ");
    }
    return body.error?.message ?? fallback;
  } catch {
    return fallback;
  }
}

// ── Token storage (SSR-safe) ───────────────────────────────────────────────

/** True when a real localStorage is available (guards SSR / hardened envs). */
function hasStorage(): boolean {
  try {
    return typeof window !== "undefined" && Boolean(window.localStorage);
  } catch {
    return false;
  }
}

/** Read the persisted JWT, or null when none is stored / storage is absent. */
export function readToken(): string | null {
  if (!hasStorage()) return null;
  try {
    return window.localStorage.getItem(TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

/** Persist the JWT so the session survives a reload. */
export function writeToken(token: string): void {
  if (!hasStorage()) return;
  try {
    window.localStorage.setItem(TOKEN_STORAGE_KEY, token);
  } catch {
    /* storage full / blocked — non-fatal, session stays in memory */
  }
}

/** Remove the persisted JWT. Idempotent. */
export function clearToken(): void {
  if (!hasStorage()) return;
  try {
    window.localStorage.removeItem(TOKEN_STORAGE_KEY);
  } catch {
    /* non-fatal */
  }
}

// ── Requests ────────────────────────────────────────────────────────────────

export async function loginRequest(
  creds: Credentials,
  base: string = AUTH_API_BASE,
): Promise<AuthResult> {
  const res = await fetch(`${base}/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(creds),
  });
  if (!res.ok) {
    throw new Error(await readError(res, `Login failed (HTTP ${res.status})`));
  }
  return (await res.json()) as AuthResult;
}

export async function registerRequest(
  creds: Credentials,
  base: string = AUTH_API_BASE,
): Promise<AuthResult> {
  const res = await fetch(`${base}/auth/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(creds),
  });
  if (!res.ok) {
    throw new Error(
      await readError(res, `Registration failed (HTTP ${res.status})`),
    );
  }
  return (await res.json()) as AuthResult;
}

/**
 * Resolve the current user from a token (used to rehydrate a session).
 *
 * Hard-capped with an abort timeout: if the backend is mid-restart it can
 * accept the socket but never respond, and an un-timed fetch would hang
 * forever — pinning AuthContext in `loading` so the UI sticks on
 * "Checking your session…" with no way out. On timeout this rejects; the
 * rehydration effect catches it and falls back to the signed-out state.
 */
export async function fetchMe(
  token: string,
  base: string = AUTH_API_BASE,
  timeoutMs = 6000,
): Promise<AuthUser> {
  const res = await fetch(`${base}/auth/me`, {
    headers: { authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) {
    throw new Error(
      await readError(res, `Session expired (HTTP ${res.status})`),
    );
  }
  return (await res.json()) as AuthUser;
}

/**
 * Best-effort logout. The backend is stateless, so the client clearing its
 * token is what actually ends the session; this call is informational and
 * never rejects (a failed beacon must not block sign-out).
 */
export async function logoutRequest(
  token: string,
  base: string = AUTH_API_BASE,
): Promise<void> {
  try {
    await fetch(`${base}/auth/logout`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
    });
  } catch {
    /* swallow — sign-out is driven by clearing the local token */
  }
}

// ── Bearer fetch helper ──────────────────────────────────────────────────────

/**
 * `fetch` that attaches the stored JWT as `Authorization: Bearer <token>` when
 * one exists, preserving any caller-supplied headers. API clients route their
 * authenticated calls through this so the token travels with every request.
 */
export async function authFetch(
  input: RequestInfo | URL,
  init: RequestInit = {},
): Promise<Response> {
  const token = readToken();
  const headers = new Headers(init.headers);
  if (token && !headers.has("authorization")) {
    headers.set("authorization", `Bearer ${token}`);
  }
  return fetch(input, { ...init, headers });
}
