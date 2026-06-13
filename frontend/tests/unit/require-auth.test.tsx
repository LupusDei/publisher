import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { RequireAuth } from "@/app/auth/RequireAuth";
import { AuthProvider } from "@/app/auth/AuthContext";
import * as authApi from "@/app/auth/auth-api";
import type { AuthUser } from "@/app/auth/auth-api";

const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: replace, replace }),
  usePathname: () => "/personas",
}));

vi.mock("@/app/auth/auth-api", async () => {
  const actual = await vi.importActual<typeof import("@/app/auth/auth-api")>(
    "@/app/auth/auth-api",
  );
  return {
    ...actual,
    fetchMe: vi.fn(),
    loginRequest: vi.fn(),
    registerRequest: vi.fn(),
    logoutRequest: vi.fn().mockResolvedValue(undefined),
  };
});

const USER: AuthUser = {
  id: "u_1",
  email: "ada@example.com",
  role: "user",
  createdAt: "2026-06-13T00:00:00.000Z",
};

describe("RequireAuth", () => {
  beforeEach(() => {
    window.localStorage.clear();
    replace.mockReset();
    vi.mocked(authApi.fetchMe).mockReset();
  });

  it("should show a loading state while auth is resolving (initial state)", () => {
    authApi.writeToken("tok");
    vi.mocked(authApi.fetchMe).mockReturnValue(new Promise(() => {}));
    render(
      <AuthProvider>
        <RequireAuth>
          <p>Secret</p>
        </RequireAuth>
      </AuthProvider>,
    );
    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.queryByText("Secret")).not.toBeInTheDocument();
  });

  it("should render children once authenticated (happy path)", async () => {
    authApi.writeToken("tok");
    vi.mocked(authApi.fetchMe).mockResolvedValue(USER);
    render(
      <AuthProvider>
        <RequireAuth>
          <p>Secret</p>
        </RequireAuth>
      </AuthProvider>,
    );
    await waitFor(() => expect(screen.getByText("Secret")).toBeInTheDocument());
    expect(replace).not.toHaveBeenCalled();
  });

  it("should redirect to /login when unauthenticated (guard)", async () => {
    render(
      <AuthProvider>
        <RequireAuth>
          <p>Secret</p>
        </RequireAuth>
      </AuthProvider>,
    );
    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith(expect.stringContaining("/login")),
    );
    expect(screen.queryByText("Secret")).not.toBeInTheDocument();
  });
});
