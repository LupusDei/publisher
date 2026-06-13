import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  loginRequest,
  registerRequest,
  fetchMe,
  logoutRequest,
  authFetch,
  readToken,
  writeToken,
  clearToken,
  TOKEN_STORAGE_KEY,
  type AuthUser,
} from "@/app/auth/auth-api";

const USER: AuthUser = {
  id: "u_1",
  email: "ada@example.com",
  role: "user",
  createdAt: "2026-06-13T00:00:00.000Z",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("auth token storage", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("should return null when no token is stored (initial state)", () => {
    expect(readToken()).toBeNull();
  });

  it("should round-trip a token through write then read (state change)", () => {
    writeToken("tok_abc");
    expect(window.localStorage.getItem(TOKEN_STORAGE_KEY)).toBe("tok_abc");
    expect(readToken()).toBe("tok_abc");
  });

  it("should remove the token on clear (edge: idempotent)", () => {
    writeToken("tok_abc");
    clearToken();
    expect(readToken()).toBeNull();
    // Clearing again does not throw.
    expect(() => clearToken()).not.toThrow();
  });
});

describe("auth-api requests", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should POST credentials to /auth/login and return {token,user} (happy path)", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(jsonResponse({ token: "tok_login", user: USER }));

    const result = await loginRequest(
      { email: "ada@example.com", password: "hunter2" },
      "http://api.test",
    );

    expect(result).toEqual({ token: "tok_login", user: USER });
    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(url).toBe("http://api.test/auth/login");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual({
      email: "ada@example.com",
      password: "hunter2",
    });
  });

  it("should throw a clear error on 401 from /auth/login (error path)", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({ error: { message: "Invalid email or password" } }, 401),
    );
    await expect(
      loginRequest(
        { email: "ada@example.com", password: "wrong" },
        "http://api.test",
      ),
    ).rejects.toThrow(/invalid email or password/i);
  });

  it("should POST to /auth/register and return {token,user} (happy path)", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(jsonResponse({ token: "tok_reg", user: USER }, 201));

    const result = await registerRequest(
      { email: "ada@example.com", password: "hunter2" },
      "http://api.test",
    );
    expect(result.token).toBe("tok_reg");
    expect(String(fetchSpy.mock.calls[0]![0])).toBe(
      "http://api.test/auth/register",
    );
  });

  it("should surface a 409 duplicate-email error from /auth/register (error path)", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({ error: { message: "Email already registered" } }, 409),
    );
    await expect(
      registerRequest(
        { email: "dupe@example.com", password: "hunter2" },
        "http://api.test",
      ),
    ).rejects.toThrow(/already registered/i);
  });

  it("should GET /auth/me with a Bearer token (happy path)", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(jsonResponse(USER));

    const me = await fetchMe("tok_abc", "http://api.test");
    expect(me).toEqual(USER);
    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(url).toBe("http://api.test/auth/me");
    const headers = new Headers(init?.headers);
    expect(headers.get("authorization")).toBe("Bearer tok_abc");
  });

  it("should reject when /auth/me returns 401 (error path: stale token)", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({ error: { message: "unauthorized" } }, 401),
    );
    await expect(fetchMe("stale", "http://api.test")).rejects.toThrow();
  });

  it("should POST /auth/logout and resolve even if the server errors (best-effort)", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse({}, 200));
    await expect(
      logoutRequest("tok", "http://api.test"),
    ).resolves.toBeUndefined();
  });

  it("should resolve logout even when the network throws (best-effort, edge)", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("offline"));
    await expect(
      logoutRequest("tok", "http://api.test"),
    ).resolves.toBeUndefined();
  });
});

describe("authFetch Bearer helper", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it("should attach the stored token as an Authorization header (happy path)", async () => {
    writeToken("tok_stored");
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(jsonResponse({ ok: true }));

    await authFetch("http://api.test/runs");
    const headers = new Headers(fetchSpy.mock.calls[0]![1]?.headers);
    expect(headers.get("authorization")).toBe("Bearer tok_stored");
  });

  it("should NOT attach an Authorization header when no token is stored (edge)", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(jsonResponse({ ok: true }));

    await authFetch("http://api.test/runs");
    const headers = new Headers(fetchSpy.mock.calls[0]![1]?.headers);
    expect(headers.has("authorization")).toBe(false);
  });

  it("should preserve caller-supplied headers while adding the token (merge)", async () => {
    writeToken("tok_stored");
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(jsonResponse({ ok: true }));

    await authFetch("http://api.test/runs", {
      method: "POST",
      headers: { "content-type": "application/json" },
    });
    const init = fetchSpy.mock.calls[0]![1];
    const headers = new Headers(init?.headers);
    expect(headers.get("content-type")).toBe("application/json");
    expect(headers.get("authorization")).toBe("Bearer tok_stored");
    expect(init?.method).toBe("POST");
  });
});
