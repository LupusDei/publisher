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
});
