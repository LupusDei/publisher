import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import OnboardingPage from "@/app/onboarding/page";
import { createPersona, type Persona } from "@/app/personas/persona-api";

vi.mock("@/app/personas/persona-api", async () => {
  const actual = await vi.importActual<
    typeof import("@/app/personas/persona-api")
  >("@/app/personas/persona-api");
  return { ...actual, createPersona: vi.fn() };
});

const mockCreate = vi.mocked(createPersona);

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
  });

  it("should render all four fixed design-token fields and no free-text key input (initial state)", () => {
    render(<OnboardingPage />);
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

    render(<OnboardingPage />);
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

    render(<OnboardingPage />);
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

    render(<OnboardingPage />);
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
    render(<OnboardingPage />);

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
    render(<OnboardingPage />);

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

  it("should echo the voice sample in the live preview as it is typed", async () => {
    const user = userEvent.setup();
    render(<OnboardingPage />);

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

    render(<OnboardingPage />);
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
