import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import PersonaDetailPage from "@/app/personas/[id]/page";
import { fetchPersona, type Persona } from "@/app/personas/persona-api";

vi.mock("@/app/personas/persona-api", async () => {
  const actual = await vi.importActual<
    typeof import("@/app/personas/persona-api")
  >("@/app/personas/persona-api");
  return { ...actual, fetchPersona: vi.fn(), updatePersona: vi.fn() };
});

// The route is gated by RequireAuth (covered by require-auth.test.tsx and
// auth-gated-routes.test.tsx); stub it as a pass-through so this test exercises
// the route wrapper's param threading.
vi.mock("@/app/auth/RequireAuth", () => ({
  RequireAuth: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const mockFetch = vi.mocked(fetchPersona);

const persona: Persona = {
  id: "p_9",
  name: "Routed Persona",
  voice: "v",
  voiceSample: "s",
  stylePoints: [],
  keyLearnings: [],
  designElements: {},
};

describe("PersonaDetailPage (route wrapper)", () => {
  it("should pass the route param id through to PersonaDetail", async () => {
    mockFetch.mockResolvedValue(persona);
    render(<PersonaDetailPage params={{ id: "p_9" }} />);
    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: "Routed Persona" }),
      ).toBeInTheDocument(),
    );
    expect(mockFetch).toHaveBeenCalledWith("p_9");
  });
});
