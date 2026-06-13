import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import LoginPage from "@/app/login/page";
import { AuthProvider } from "@/app/auth/AuthContext";
import * as authApi from "@/app/auth/auth-api";
import type { AuthUser } from "@/app/auth/auth-api";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: push }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/app/auth/auth-api", async () => {
  const actual = await vi.importActual<typeof import("@/app/auth/auth-api")>(
    "@/app/auth/auth-api",
  );
  return {
    ...actual,
    loginRequest: vi.fn(),
    registerRequest: vi.fn(),
    fetchMe: vi.fn(),
    logoutRequest: vi.fn().mockResolvedValue(undefined),
  };
});

const USER: AuthUser = {
  id: "u_1",
  email: "ada@example.com",
  role: "user",
  createdAt: "2026-06-13T00:00:00.000Z",
};

function renderLogin(): ReturnType<typeof userEvent.setup> {
  const user = userEvent.setup();
  render(
    <AuthProvider>
      <LoginPage />
    </AuthProvider>,
  );
  return user;
}

describe("LoginPage", () => {
  beforeEach(() => {
    window.localStorage.clear();
    push.mockReset();
    vi.mocked(authApi.loginRequest).mockReset();
    vi.mocked(authApi.registerRequest).mockReset();
    vi.mocked(authApi.fetchMe).mockReset();
  });

  it("should render accessible email + password fields and a submit button (initial state)", () => {
    renderLogin();
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    const password = screen.getByLabelText("Password");
    expect(password).toHaveAttribute("type", "password");
    expect(
      screen.getByRole("button", { name: /sign in|log in/i }),
    ).toBeInTheDocument();
  });

  it("should log in and route onward on success (state change)", async () => {
    const user = renderLogin();
    vi.mocked(authApi.loginRequest).mockResolvedValue({
      token: "tok_login",
      user: USER,
    });

    await user.type(screen.getByLabelText(/email/i), "ada@example.com");
    await user.type(screen.getByLabelText("Password"), "hunter2");
    await user.click(screen.getByRole("button", { name: /sign in|log in/i }));

    await waitFor(() =>
      expect(authApi.loginRequest).toHaveBeenCalledWith({
        email: "ada@example.com",
        password: "hunter2",
      }),
    );
    await waitFor(() => expect(push).toHaveBeenCalled());
    expect(authApi.readToken()).toBe("tok_login");
  });

  it("should announce an error via aria-live when login fails (error handling)", async () => {
    const user = renderLogin();
    vi.mocked(authApi.loginRequest).mockRejectedValue(
      new Error("Invalid email or password"),
    );

    await user.type(screen.getByLabelText(/email/i), "ada@example.com");
    await user.type(screen.getByLabelText("Password"), "wrong");
    await user.click(screen.getByRole("button", { name: /sign in|log in/i }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/invalid email or password/i);
    expect(push).not.toHaveBeenCalled();
  });

  it("should toggle to the register form and create an account (register path)", async () => {
    const user = renderLogin();
    vi.mocked(authApi.registerRequest).mockResolvedValue({
      token: "tok_reg",
      user: USER,
    });

    await user.click(
      screen.getByRole("button", {
        name: /create an account|register|sign up/i,
      }),
    );
    // Now in register mode — submit should call registerRequest.
    await user.type(screen.getByLabelText(/email/i), "new@example.com");
    await user.type(screen.getByLabelText("Password"), "hunter2");
    await user.click(
      screen.getByRole("button", { name: /create account|register|sign up/i }),
    );

    await waitFor(() =>
      expect(authApi.registerRequest).toHaveBeenCalledWith({
        email: "new@example.com",
        password: "hunter2",
      }),
    );
    await waitFor(() => expect(push).toHaveBeenCalled());
  });

  it("should show a loading state while the request is in flight (intentional loading)", async () => {
    const user = renderLogin();
    let resolve!: (v: { token: string; user: AuthUser }) => void;
    vi.mocked(authApi.loginRequest).mockReturnValue(
      new Promise((r) => {
        resolve = r;
      }),
    );

    await user.type(screen.getByLabelText(/email/i), "ada@example.com");
    await user.type(screen.getByLabelText("Password"), "hunter2");
    await user.click(screen.getByRole("button", { name: /sign in|log in/i }));

    expect(screen.getByRole("status")).toHaveTextContent(
      /signing in|please wait|loading/i,
    );
    // The submit control is disabled while in flight.
    expect(
      screen.getByRole("button", { name: /signing in|sign in|log in/i }),
    ).toBeDisabled();

    await act(async () => {
      resolve({ token: "tok_login", user: USER });
    });
  });

  it("should require both fields before submitting (validation)", async () => {
    const user = renderLogin();
    // Submit with empty fields — the API must not be called.
    await user.click(screen.getByRole("button", { name: /sign in|log in/i }));
    expect(authApi.loginRequest).not.toHaveBeenCalled();
  });
});
