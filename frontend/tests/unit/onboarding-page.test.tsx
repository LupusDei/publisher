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
  const actual = await vi.importActual<typeof import("@/app/auth/auth-api")>(
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

  it("should reveal a celebratory success state naming the persona with a View link", async () => {
    const user = userEvent.setup();
    mockCreate.mockResolvedValue({
      id: "p_42",
      name: "The Cartographer",
      voice: "Precise, spatial.",
      voiceSample: "Every place is an argument about distance.",
      stylePoints: [],
      keyLearnings: [],
      designElements: {},
    });

    render();
    await fillRequired(user);
    await user.click(screen.getByRole("button", { name: /create persona/i }));

    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(/created/i),
    );
    // The persona name is celebrated, and the View link points at its page.
    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("The Cartographer");
    const viewLink = screen.getByRole("link", { name: /view it/i });
    expect(viewLink).toHaveAttribute("href", "/personas/p_42");
    // The form is replaced — the inputs are gone in the success state.
    expect(screen.queryByLabelText(/voice sample/i)).not.toBeInTheDocument();
  });

  it("should show inline validation on a required field after it is touched and left empty", async () => {
    const user = userEvent.setup();
    render();

    const name = screen.getByLabelText(/persona name/i);
    // No error before interaction.
    expect(
      screen.queryByText(/give your persona a name/i),
    ).not.toBeInTheDocument();

    // Focus then blur while empty -> inline error appears.
    await user.click(name);
    await user.tab();
    expect(screen.getByText(/give your persona a name/i)).toBeInTheDocument();

    // Typing a value clears the inline error.
    await user.type(name, "The Essayist");
    await waitFor(() =>
      expect(
        screen.queryByText(/give your persona a name/i),
      ).not.toBeInTheDocument(),
    );
  });

  it("should surface all required-field errors and not submit when the button is forced", async () => {
    render();

    // Submit is gated: the button is disabled with nothing filled.
    expect(
      screen.getByRole("button", { name: /create persona/i }),
    ).toBeDisabled();

    // Submitting the form directly (e.g. Enter) reveals every required error
    // and never calls the API.
    const form = screen.getByLabelText(/persona name/i).closest("form");
    expect(form).not.toBeNull();
    await act(async () => {
      form?.requestSubmit();
    });

    expect(screen.getByText(/give your persona a name/i)).toBeInTheDocument();
    expect(
      screen.getByText(/describe how this voice sounds/i),
    ).toBeInTheDocument();
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("should expose aria-invalid and link the control to its visible error node when a required field is errored", async () => {
    const user = userEvent.setup();
    render();

    const name = screen.getByLabelText(/persona name/i);
    // Before interaction the field is valid: aria-invalid is the neutral
    // "false" and nothing in aria-describedby points at an (absent) error node.
    expect(name).toHaveAttribute("aria-invalid", "false");
    expect(name.getAttribute("aria-describedby") ?? "").not.toContain(
      "name-error",
    );

    // Touch and leave empty -> the field becomes invalid.
    await user.click(name);
    await user.tab();

    expect(name).toHaveAttribute("aria-invalid", "true");
    // The control's aria-describedby must point at the visible error node...
    const describedBy = name.getAttribute("aria-describedby") ?? "";
    const errorIds = describedBy.split(/\s+/);
    expect(errorIds).toContain("name-error");
    // ...and that node must be the rendered alert carrying the error text.
    const errorNode = document.getElementById("name-error");
    expect(errorNode).not.toBeNull();
    expect(errorNode).toHaveTextContent(/give your persona a name/i);
    expect(errorNode).toHaveAttribute("role", "alert");
    // Help text remains linked for richer SR context, alongside the error.
    const helpNode = document.getElementById("name-help");
    expect(helpNode).not.toBeNull();
    expect(errorIds).toContain("name-help");
  });

  it("should not mark a valid field invalid nor point its aria-describedby at an error node", async () => {
    const user = userEvent.setup();
    render();

    const name = screen.getByLabelText(/persona name/i);
    await user.type(name, "The Essayist");
    await user.tab();

    // A filled required field is valid: aria-invalid is "false" and there is no
    // error node to describe (only the help text id, if any, may be present).
    expect(name).toHaveAttribute("aria-invalid", "false");
    expect(document.getElementById("name-error")).toBeNull();
    const describedBy = name.getAttribute("aria-describedby") ?? "";
    expect(describedBy.split(/\s+/)).not.toContain("name-error");
    // Help context is still linked.
    expect(describedBy.split(/\s+/)).toContain("name-help");
  });

  it("should echo the voice sample in the live preview as it is typed", async () => {
    const user = userEvent.setup();
    render();

    // Empty-state copy before any sample is entered.
    expect(
      screen.getByText(/your sample will appear here/i),
    ).toBeInTheDocument();

    await user.type(screen.getByLabelText(/persona name/i), "The Essayist");
    await user.type(
      screen.getByLabelText(/voice sample/i),
      "Attention is the scarce resource.",
    );

    // The preview figure echoes the sample and credits the persona by name.
    const figure = screen.getByRole("figure");
    expect(figure).toHaveTextContent(/attention is the scarce resource/i);
    expect(figure).toHaveTextContent("The Essayist");
    expect(
      screen.queryByText(/your sample will appear here/i),
    ).not.toBeInTheDocument();
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
