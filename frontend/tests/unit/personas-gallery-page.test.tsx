import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import PersonasPage from "@/app/personas/page";
import { fetchPersonas, type Persona } from "@/app/personas/persona-api";

// The page is gated by RequireAuth (the auth gate has its own dedicated tests
// in require-auth.test.tsx). Here we stub it to a pass-through so these tests
// stay focused on the gallery's loading / ready / empty / error behavior.
vi.mock("@/app/auth/RequireAuth", () => ({
  RequireAuth: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@/app/personas/persona-api", async () => {
  const actual = await vi.importActual<
    typeof import("@/app/personas/persona-api")
  >("@/app/personas/persona-api");
  return { ...actual, fetchPersonas: vi.fn() };
});

const mockFetch = vi.mocked(fetchPersonas);

const persona: Persona = {
  id: "p_1",
  name: "The Essayist",
  voice: "Measured, first-person.",
  voiceSample: "Emergence is not magic.",
  stylePoints: ["short paragraphs"],
  keyLearnings: ["emergence is not magic"],
  designElements: { palette: "warm neutrals" },
};

describe("PersonasPage (gallery)", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it("should show a loading state initially (initial state)", () => {
    mockFetch.mockReturnValue(new Promise(() => {}));
    render(<PersonasPage />);
    expect(screen.getByRole("status")).toHaveTextContent(/loading/i);
  });

  it("should render a card per persona on success (state change)", async () => {
    mockFetch.mockResolvedValue([
      persona,
      { ...persona, id: "p_2", name: "The Analyst" },
    ]);
    render(<PersonasPage />);
    await waitFor(() =>
      expect(screen.getByText("The Essayist")).toBeInTheDocument(),
    );
    expect(screen.getByText("The Analyst")).toBeInTheDocument();
  });

  it("should render the persona name, voice and sample on each card (state change)", async () => {
    mockFetch.mockResolvedValue([persona]);
    render(<PersonasPage />);
    await waitFor(() =>
      expect(screen.getByText("The Essayist")).toBeInTheDocument(),
    );
    expect(screen.getByText("Measured, first-person.")).toBeInTheDocument();
    // The sample is rendered with typographic quotes around it.
    expect(
      screen.getByText(/Emergence is not magic\./),
    ).toBeInTheDocument();
  });

  it("should render the voice text off the vermillion accent (Atelier one-accent rule)", async () => {
    mockFetch.mockResolvedValue([persona]);
    render(<PersonasPage />);
    const voice = await screen.findByText("Measured, first-person.");
    // The voice copy must NOT carry the accent class — the single vermillion
    // accent is reserved for the primary action (pdp.2).
    expect(voice).toHaveClass("persona-card-voice");
    expect(voice.className).not.toMatch(/accent/);
  });

  it("should render an empty state inviting the first persona (edge case)", async () => {
    mockFetch.mockResolvedValue([]);
    render(<PersonasPage />);
    await waitFor(() =>
      expect(
        screen.getByText(/create your first persona/i),
      ).toBeInTheDocument(),
    );
  });

  it("should render an error state when the fetch fails (error handling)", async () => {
    mockFetch.mockRejectedValue(
      new Error("Failed to load personas (HTTP 500)"),
    );
    render(<PersonasPage />);
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(/HTTP 500/),
    );
  });

  it("should always offer a header CTA linking to onboarding (new persona)", () => {
    mockFetch.mockReturnValue(new Promise(() => {}));
    render(<PersonasPage />);
    const cta = screen.getByRole("link", { name: /new persona/i });
    expect(cta).toHaveAttribute("href", "/onboarding");
  });

  it("should render compact inline design tags with their key and value (state change)", async () => {
    mockFetch.mockResolvedValue([
      {
        ...persona,
        designElements: { palette: "warm neutrals", tone: "calm" },
      },
    ]);
    render(<PersonasPage />);
    await waitFor(() =>
      expect(screen.getByText("palette")).toBeInTheDocument(),
    );
    expect(screen.getByText("tone")).toBeInTheDocument();
    // The key has its own emphasized span; the value sits beside it in the tag.
    const paletteTag = screen.getByText("palette").closest(".persona-tag");
    expect(paletteTag).not.toBeNull();
    expect(paletteTag).toHaveTextContent("palette: warm neutrals");
  });

  it("should omit the tag row entirely when a persona has no design tokens (edge case)", async () => {
    mockFetch.mockResolvedValue([{ ...persona, designElements: {} }]);
    render(<PersonasPage />);
    await waitFor(() =>
      expect(screen.getByText("The Essayist")).toBeInTheDocument(),
    );
    // The voice sample still renders; no token key from the fixed vocabulary leaks in.
    expect(screen.queryByText("palette")).not.toBeInTheDocument();
    expect(screen.queryByText("typography")).not.toBeInTheDocument();
  });

  it("should offer a 'Draft a Post' CTA per card linking to /runs with the persona preselected (pdp.2)", async () => {
    mockFetch.mockResolvedValue([persona]);
    render(<PersonasPage />);
    const cta = await screen.findByRole("link", { name: /draft a post/i });
    expect(cta).toHaveAttribute("href", "/runs?persona=p_1");
  });

  it("should keep a link to the persona detail for the card body (pdp.2 no nested links)", async () => {
    mockFetch.mockResolvedValue([persona]);
    render(<PersonasPage />);
    const detailLink = await screen.findByRole("link", {
      name: /the essayist/i,
    });
    expect(detailLink).toHaveAttribute("href", "/personas/p_1");
  });
});
