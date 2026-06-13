import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LogoutButton } from "@/app/auth/LogoutButton";
import { AuthProvider } from "@/app/auth/AuthContext";
import * as authApi from "@/app/auth/auth-api";
import type { AuthUser } from "@/app/auth/auth-api";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: push }),
}));

vi.mock("@/app/auth/auth-api", async () => {
  const actual =
    await vi.importActual<typeof import("@/app/auth/auth-api")>(
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

describe("LogoutButton", () => {
  beforeEach(() => {
    window.localStorage.clear();
    push.mockReset();
    vi.mocked(authApi.fetchMe).mockReset();
    vi.mocked(authApi.logoutRequest).mockClear();
  });

  it("should render nothing while signed out (initial state)", async () => {
    render(
      <AuthProvider>
        <LogoutButton />
      </AuthProvider>,
    );
    await waitFor(() =>
      expect(screen.queryByRole("button")).not.toBeInTheDocument(),
    );
  });

  it("should show the signed-in email and a sign-out control once authenticated", async () => {
    authApi.writeToken("tok");
    vi.mocked(authApi.fetchMe).mockResolvedValue(USER);
    render(
      <AuthProvider>
        <LogoutButton />
      </AuthProvider>,
    );
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /sign out|log out/i }),
      ).toBeInTheDocument(),
    );
    expect(screen.getByText(/ada@example.com/)).toBeInTheDocument();
  });

  it("should clear the token and route to /login on click (state change)", async () => {
    authApi.writeToken("tok");
    vi.mocked(authApi.fetchMe).mockResolvedValue(USER);
    const user = userEvent.setup();
    render(
      <AuthProvider>
        <LogoutButton />
      </AuthProvider>,
    );
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /sign out|log out/i }),
      ).toBeInTheDocument(),
    );

    await user.click(screen.getByRole("button", { name: /sign out|log out/i }));
    await waitFor(() => expect(authApi.readToken()).toBeNull());
    expect(push).toHaveBeenCalledWith("/login");
    expect(authApi.logoutRequest).toHaveBeenCalled();
  });
});
