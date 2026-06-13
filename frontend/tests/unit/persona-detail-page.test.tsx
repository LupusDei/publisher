import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import PersonaDetail from "@/app/personas/[id]/persona-detail";
import {
  fetchPersona,
  updatePersona,
  type Persona,
} from "@/app/personas/persona-api";

vi.mock("@/app/personas/persona-api", async () => {
  const actual = await vi.importActual<
    typeof import("@/app/personas/persona-api")
  >("@/app/personas/persona-api");
  return { ...actual, fetchPersona: vi.fn(), updatePersona: vi.fn() };
});

const mockFetch = vi.mocked(fetchPersona);
const mockUpdate = vi.mocked(updatePersona);

const persona: Persona = {
  id: "p_1",
  name: "The Essayist",
  voice: "Measured, first-person.",
  voiceSample: "Emergence is not magic — only attention paid closely.",
  stylePoints: ["short paragraphs", "one image per section"],
  keyLearnings: ["emergence is not magic"],
  designElements: { palette: "warm neutrals", typography: "serif" },
};

describe("PersonaDetail", () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockUpdate.mockReset();
  });

  it("should render all declared fields incl. voiceSample + design tokens (state change)", async () => {
    mockFetch.mockResolvedValue(persona);
    render(<PersonaDetail id="p_1" />);
    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: "The Essayist" }),
      ).toBeInTheDocument(),
    );
    expect(screen.getByText(persona.voiceSample)).toBeInTheDocument();
    expect(screen.getByText("short paragraphs")).toBeInTheDocument();
    expect(screen.getByText("emergence is not magic")).toBeInTheDocument();
    // Design tokens rendered as key/value.
    expect(screen.getByText(/palette/i)).toBeInTheDocument();
    expect(screen.getByText("warm neutrals")).toBeInTheDocument();
  });

  it("should offer a 'Draft a Post' CTA linking to /runs with the persona preselected (pdp.2)", async () => {
    mockFetch.mockResolvedValue(persona);
    render(<PersonaDetail id="p_1" />);
    const cta = await screen.findByRole("link", { name: /draft a post/i });
    expect(cta).toHaveAttribute("href", "/runs?persona=p_1");
  });

  it("should show an error state when the persona cannot be loaded (error handling)", async () => {
    mockFetch.mockRejectedValue(new Error("Failed to load persona (HTTP 404)"));
    render(<PersonaDetail id="missing" />);
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(/HTTP 404/),
    );
  });

  it("should let a user edit the voice and save the patch (edit — D19)", async () => {
    const user = userEvent.setup();
    mockFetch.mockResolvedValue(persona);
    mockUpdate.mockResolvedValue({
      ...persona,
      voice: "Sharper, more direct.",
    });

    render(<PersonaDetail id="p_1" />);
    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: "The Essayist" }),
      ).toBeInTheDocument(),
    );

    await user.click(screen.getByRole("button", { name: /edit/i }));
    const voiceField = screen.getByLabelText("Voice");
    await user.clear(voiceField);
    await user.type(voiceField, "Sharper, more direct.");
    await user.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(/saved/i),
    );
    expect(mockUpdate).toHaveBeenCalledWith(
      "p_1",
      expect.objectContaining({ voice: "Sharper, more direct." }),
    );
    expect(screen.getByText("Sharper, more direct.")).toBeInTheDocument();
  });

  it("should discard edits and return to the read view on Cancel (edge case)", async () => {
    const user = userEvent.setup();
    mockFetch.mockResolvedValue(persona);

    render(<PersonaDetail id="p_1" />);
    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: "The Essayist" }),
      ).toBeInTheDocument(),
    );

    await user.click(screen.getByRole("button", { name: /edit/i }));
    const voiceField = screen.getByLabelText("Voice");
    await user.clear(voiceField);
    await user.type(voiceField, "Throwaway edit.");
    await user.click(screen.getByRole("button", { name: /cancel/i }));

    // The form is gone (no editable Voice field) and the original voice shows.
    expect(screen.queryByLabelText("Voice")).not.toBeInTheDocument();
    expect(screen.getByText(persona.voice)).toBeInTheDocument();
    expect(screen.queryByText("Throwaway edit.")).not.toBeInTheDocument();
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("should expose helper placeholders on the design-token inputs (a11y affordance)", async () => {
    const user = userEvent.setup();
    mockFetch.mockResolvedValue(persona);

    render(<PersonaDetail id="p_1" />);
    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: "The Essayist" }),
      ).toBeInTheDocument(),
    );

    await user.click(screen.getByRole("button", { name: /edit/i }));
    const paletteInput = screen.getByLabelText("Palette");
    expect(paletteInput).toHaveAttribute("placeholder");
    expect(paletteInput.getAttribute("placeholder")).toMatch(/warm neutrals/i);
  });
});
