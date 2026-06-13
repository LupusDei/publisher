import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { StrictMode, useState } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AuthProvider, useAuth } from "@/app/auth/AuthContext";
import * as authApi from "@/app/auth/auth-api";
import type { AuthUser } from "@/app/auth/auth-api";

vi.mock("@/app/auth/auth-api", async () => {
  const actual = await vi.importActual<typeof import("@/app/auth/auth-api")>(
    "@/app/auth/auth-api",
  );
  return {
    ...actual,
    loginRequest: vi.fn(),
    registerRequest: vi.fn(),
    fetchMe: vi.fn(),
    logoutRequest: vi.fn(),
  };
});

const USER: AuthUser = {
  id: "u_1",
  email: "ada@example.com",
  role: "user",
  createdAt: "2026-06-13T00:00:00.000Z",
};

/** A small probe component that surfaces the context for assertions. */
function Probe(): React.ReactElement {
  const { status, user, login, register, logout } = useAuth();
  return (
    <div>
      <span data-testid="status">{status}</span>
      <span data-testid="email">{user?.email ?? "—"}</span>
      <button onClick={() => void login("ada@example.com", "pw")}>login</button>
      <button onClick={() => void register("ada@example.com", "pw")}>
        register
      </button>
      <button onClick={() => logout()}>logout</button>
    </div>
  );
}

function renderWithProvider(): ReturnType<typeof userEvent.setup> {
  const user = userEvent.setup();
  render(
    <AuthProvider>
      <Probe />
    </AuthProvider>,
  );
  return user;
}

describe("AuthProvider / useAuth", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.mocked(authApi.loginRequest).mockReset();
    vi.mocked(authApi.registerRequest).mockReset();
    vi.mocked(authApi.fetchMe).mockReset();
    vi.mocked(authApi.logoutRequest).mockReset().mockResolvedValue(undefined);
  });
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("should settle to unauthenticated when no token is stored (initial state)", async () => {
    renderWithProvider();
    await waitFor(() =>
      expect(screen.getByTestId("status")).toHaveTextContent("unauthenticated"),
    );
    expect(screen.getByTestId("email")).toHaveTextContent("—");
    expect(authApi.fetchMe).not.toHaveBeenCalled();
  });

  it("should settle to authenticated under Strict Mode's double-mount (regression: stuck 'Checking your session…')", async () => {
    // Dev Strict Mode mounts → unmounts → remounts, so two fetchMe() calls run.
    // The cancelled (first) one finishing must NOT set the rehydration guard, or
    // the live (second) call returns early and status sticks on "loading".
    authApi.writeToken("tok_stored");
    vi.mocked(authApi.fetchMe).mockResolvedValue(USER);

    render(
      <StrictMode>
        <AuthProvider>
          <Probe />
        </AuthProvider>
      </StrictMode>,
    );

    await waitFor(() =>
      expect(screen.getByTestId("status")).toHaveTextContent("authenticated"),
    );
    expect(screen.getByTestId("email")).toHaveTextContent("ada@example.com");
  });

  it("should rehydrate the user from a stored token on mount (state change)", async () => {
    authApi.writeToken("tok_stored");
    vi.mocked(authApi.fetchMe).mockResolvedValue(USER);

    renderWithProvider();
    await waitFor(() =>
      expect(screen.getByTestId("status")).toHaveTextContent("authenticated"),
    );
    expect(authApi.fetchMe).toHaveBeenCalledWith("tok_stored");
    expect(screen.getByTestId("email")).toHaveTextContent("ada@example.com");
  });

  it("should clear a stale stored token when rehydration fails (error handling)", async () => {
    authApi.writeToken("stale");
    vi.mocked(authApi.fetchMe).mockRejectedValue(new Error("401"));

    renderWithProvider();
    await waitFor(() =>
      expect(screen.getByTestId("status")).toHaveTextContent("unauthenticated"),
    );
    expect(authApi.readToken()).toBeNull();
  });

  it("should persist the token and set the user on a successful login", async () => {
    const user = renderWithProvider();
    vi.mocked(authApi.loginRequest).mockResolvedValue({
      token: "tok_login",
      user: USER,
    });
    await waitFor(() =>
      expect(screen.getByTestId("status")).toHaveTextContent("unauthenticated"),
    );

    await user.click(screen.getByText("login"));
    await waitFor(() =>
      expect(screen.getByTestId("status")).toHaveTextContent("authenticated"),
    );
    expect(authApi.readToken()).toBe("tok_login");
    expect(screen.getByTestId("email")).toHaveTextContent("ada@example.com");
  });

  it("should persist the token and set the user on a successful register", async () => {
    const user = renderWithProvider();
    vi.mocked(authApi.registerRequest).mockResolvedValue({
      token: "tok_reg",
      user: USER,
    });
    await waitFor(() =>
      expect(screen.getByTestId("status")).toHaveTextContent("unauthenticated"),
    );

    await user.click(screen.getByText("register"));
    await waitFor(() =>
      expect(screen.getByTestId("status")).toHaveTextContent("authenticated"),
    );
    expect(authApi.readToken()).toBe("tok_reg");
  });

  it("should clear the token and user on logout (state change)", async () => {
    authApi.writeToken("tok_stored");
    vi.mocked(authApi.fetchMe).mockResolvedValue(USER);
    const user = renderWithProvider();
    await waitFor(() =>
      expect(screen.getByTestId("status")).toHaveTextContent("authenticated"),
    );

    await user.click(screen.getByText("logout"));
    await waitFor(() =>
      expect(screen.getByTestId("status")).toHaveTextContent("unauthenticated"),
    );
    expect(authApi.readToken()).toBeNull();
    expect(screen.getByTestId("email")).toHaveTextContent("—");
  });

  it("should propagate a login error so the caller can show it (error handling)", async () => {
    function ErrProbe(): React.ReactElement {
      const { login } = useAuth();
      const [err, setErr] = useState<string | null>(null);
      return (
        <div>
          <span data-testid="err">{err ?? "none"}</span>
          <button
            onClick={async () => {
              try {
                await login("ada@example.com", "bad");
              } catch (e) {
                setErr(e instanceof Error ? e.message : "x");
              }
            }}
          >
            go
          </button>
        </div>
      );
    }
    vi.mocked(authApi.loginRequest).mockRejectedValue(
      new Error("Invalid email or password"),
    );
    const user = userEvent.setup();
    render(
      <AuthProvider>
        <ErrProbe />
      </AuthProvider>,
    );
    await user.click(screen.getByText("go"));
    await waitFor(() =>
      expect(screen.getByTestId("err")).toHaveTextContent(/invalid/i),
    );
    expect(authApi.readToken()).toBeNull();
  });

  it("should throw if useAuth is used outside an AuthProvider (guard)", () => {
    function Naked(): React.ReactElement {
      useAuth();
      return <div />;
    }
    // Suppress the expected React error boundary console noise.
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<Naked />)).toThrow(/AuthProvider/i);
    spy.mockRestore();
  });
});
