import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  render as renderRTL,
  screen,
  waitFor,
  act,
  type RenderResult,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import OnboardingPage from "@/app/onboarding/page";
import { AuthProvider } from "@/app/auth/AuthContext";
import { createPersona, type Persona } from "@/app/personas/persona-api";
import * as authApi from "@/app/auth/auth-api";

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
    // Hang /auth/me so the provider stays in its "loading" state for the whole
    // test — the account/password step only shows once status is
    // "unauthenticated", so these persona-authoring tests never see it.
    fetchMe: vi.fn().mockReturnValue(new Promise(() => {})),
    registerRequest: vi.fn(),
    loginRequest: vi.fn(),
    logoutRequest: vi.fn().mockResolvedValue(undefined),
  };
});

const mockCreate = vi.mocked(createPersona);

/** Render the onboarding page inside an AuthProvider (session resolving). */
function render(): RenderResult {
  return renderRTL(
    <AuthProvider>
      <OnboardingPage />
    </AuthProvider>,
  );
}

/** Fills the minimum required fields for a valid submission. */
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

describe("OnboardingPage", () => {
  beforeEach(() => {
    mockCreate.mockReset();
    // Seed a token so the provider starts in "loading" (fetchMe hangs),
    // keeping the account/password step hidden for these persona tests.
    window.localStorage.clear();
    authApi.writeToken("tok_seeded");
  });

  it("should render all four fixed design-token fields and no free-text key input (initial state)", () => {
    render();
    expect(screen.getByLabelText(/palette/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/typography/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/layout/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^tone/i)).toBeInTheDocument();
    // The submit button starts disabled until required fields are filled.
    expect(
      screen.getByRole("button", { name: /create persona/i }),
    ).toBeDisabled();
  });

  it("should post the captured persona and show a success message (state change)", async () => {
    const user = userEvent.setup();
    mockCreate.mockResolvedValue({
      id: "p_1",
      name: "The Essayist",
      voice: "Measured, first-person.",
      voiceSample: "Emergence is not magic — only attention paid closely.",
      stylePoints: ["short paragraphs"],
      keyLearnings: [],
      designElements: { palette: "warm neutrals" },
    });

    render();
    await fillRequired(user);
    await user.type(screen.getByLabelText(/style points/i), "short paragraphs");
    await user.type(screen.getByLabelText(/palette/i), "warm neutrals");
    await user.click(screen.getByRole("button", { name: /create persona/i }));

    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(/created/i),
    );
    // Verify the captured payload: arrays split, only non-empty design tokens.
    const payload = mockCreate.mock.calls[0]?.[0];
    expect(payload?.name).toBe("The Essayist");
    expect(payload?.stylePoints).toEqual(["short paragraphs"]);
    expect(payload?.designElements).toEqual({ palette: "warm neutrals" });
    expect(payload?.designElements).not.toHaveProperty("typography");
  });

  it("should show an error message when creation fails (error handling)", async () => {
    const user = userEvent.setup();
    mockCreate.mockRejectedValue(
      new Error("voiceSample: voiceSample is required"),
    );

    render();
    await fillRequired(user);
    await user.click(screen.getByRole("button", { name: /create persona/i }));

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(/voiceSample/i),
    );
  });

  it("should show a loading state while the request is in flight (intentional loading)", async () => {
    const user = userEvent.setup();
    let resolve!: (p: Persona) => void;
    mockCreate.mockReturnValue(
      new Promise<Persona>((r) => {
        resolve = r;
      }),
    );

    render();
    await fillRequired(user);
    await user.click(screen.getByRole("button", { name: /create persona/i }));

    expect(screen.getByRole("status")).toHaveTextContent(/saving|creating/i);

    // Resolve with a valid persona, then let React settle (avoids act warnings).
    await act(async () => {
      resolve({
        id: "p_1",
        name: "The Essayist",
        voice: "Measured.",
        voiceSample: "A sample.",
        stylePoints: [],
        keyLearnings: [],
        designElements: {},
      });
    });
  });
});
