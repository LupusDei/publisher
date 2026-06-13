import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import OnboardingPage from "@/app/onboarding/page";
import { AuthProvider } from "@/app/auth/AuthContext";
import { createPersona, type Persona } from "@/app/personas/persona-api";
import * as authApi from "@/app/auth/auth-api";
import type { AuthUser } from "@/app/auth/auth-api";

vi.mock("@/app/personas/persona-api", async () => {
  const actual = await vi.importActual<
    typeof import("@/app/personas/persona-api")
  >("@/app/personas/persona-api");
  return { ...actual, createPersona: vi.fn() };
});

vi.mock("@/app/auth/auth-api", async () => {
  const actual =
    await vi.importActual<typeof import("@/app/auth/auth-api")>(
      "@/app/auth/auth-api",
    );
  return {
    ...actual,
    registerRequest: vi.fn(),
    loginRequest: vi.fn(),
    fetchMe: vi.fn(),
    logoutRequest: vi.fn().mockResolvedValue(undefined),
  };
});

const mockCreate = vi.mocked(createPersona);

const USER: AuthUser = {
  id: "u_1",
  email: "ada@example.com",
  role: "user",
  createdAt: "2026-06-13T00:00:00.000Z",
};

const PERSONA: Persona = {
  id: "p_1",
  name: "The Essayist",
  voice: "Measured, first-person.",
  voiceSample: "Emergence is not magic.",
  stylePoints: [],
  keyLearnings: [],
  designElements: {},
};

function renderOnboarding(): ReturnType<typeof userEvent.setup> {
  const user = userEvent.setup();
  render(
    <AuthProvider>
      <OnboardingPage />
    </AuthProvider>,
  );
  return user;
}

async function fillRequired(
  user: ReturnType<typeof userEvent.setup>,
): Promise<void> {
  await user.type(screen.getByLabelText(/persona name/i), "The Essayist");
  await user.type(screen.getByLabelText("Voice"), "Measured, first-person.");
  await user.type(
    screen.getByLabelText(/voice sample/i),
    "Emergence is not magic — only attention paid closely.",
  );
}

describe("OnboardingPage — password / account (unauthenticated)", () => {
  beforeEach(() => {
    window.localStorage.clear();
    mockCreate.mockReset();
    vi.mocked(authApi.registerRequest).mockReset();
    vi.mocked(authApi.fetchMe).mockReset();
  });

  it("should show account email + password fields when no session exists (initial state)", async () => {
    renderOnboarding();
    await waitFor(() =>
      expect(screen.getByLabelText(/email/i)).toBeInTheDocument(),
    );
    const password = screen.getByLabelText(/^password/i);
    expect(password).toHaveAttribute("type", "password");
  });

  it("should register the account, then create the persona on submit (state change)", async () => {
    const user = renderOnboarding();
    vi.mocked(authApi.registerRequest).mockResolvedValue({
      token: "tok_reg",
      user: USER,
    });
    mockCreate.mockResolvedValue(PERSONA);

    await waitFor(() =>
      expect(screen.getByLabelText(/email/i)).toBeInTheDocument(),
    );
    await user.type(screen.getByLabelText(/email/i), "ada@example.com");
    await user.type(screen.getByLabelText(/^password/i), "hunter2");
    await fillRequired(user);
    await user.click(screen.getByRole("button", { name: /create persona/i }));

    await waitFor(() =>
      expect(authApi.registerRequest).toHaveBeenCalledWith({
        email: "ada@example.com",
        password: "hunter2",
      }),
    );
    await waitFor(() => expect(mockCreate).toHaveBeenCalled());
    // The session token is persisted by the auth context.
    expect(authApi.readToken()).toBe("tok_reg");
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(/created/i),
    );
  });

  it("should not call the persona API and should surface the error if registration fails (error handling)", async () => {
    const user = renderOnboarding();
    vi.mocked(authApi.registerRequest).mockRejectedValue(
      new Error("Email already registered"),
    );

    await waitFor(() =>
      expect(screen.getByLabelText(/email/i)).toBeInTheDocument(),
    );
    await user.type(screen.getByLabelText(/email/i), "dupe@example.com");
    await user.type(screen.getByLabelText(/^password/i), "hunter2");
    await fillRequired(user);
    await user.click(screen.getByRole("button", { name: /create persona/i }));

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(/already registered/i),
    );
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("should keep the submit disabled until account + required persona fields are present (validation)", async () => {
    const user = renderOnboarding();
    await waitFor(() =>
      expect(screen.getByLabelText(/email/i)).toBeInTheDocument(),
    );
    // Fill only the persona fields, leave the account empty → still disabled.
    await fillRequired(user);
    expect(
      screen.getByRole("button", { name: /create persona/i }),
    ).toBeDisabled();
  });
});

describe("OnboardingPage — authenticated (no account step)", () => {
  beforeEach(() => {
    window.localStorage.clear();
    mockCreate.mockReset();
    vi.mocked(authApi.registerRequest).mockReset();
    vi.mocked(authApi.fetchMe).mockReset();
  });

  it("should skip the account step and only create a persona when already signed in", async () => {
    authApi.writeToken("tok_existing");
    vi.mocked(authApi.fetchMe).mockResolvedValue(USER);
    mockCreate.mockResolvedValue(PERSONA);
    const user = renderOnboarding();

    // Once the session rehydrates, no email/password fields are shown.
    await waitFor(() =>
      expect(screen.queryByLabelText(/email/i)).not.toBeInTheDocument(),
    );
    await fillRequired(user);
    await user.click(screen.getByRole("button", { name: /create persona/i }));

    await waitFor(() => expect(mockCreate).toHaveBeenCalled());
    expect(authApi.registerRequest).not.toHaveBeenCalled();
  });
});
