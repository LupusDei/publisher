import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  useParams: () => ({ id: "run_1" }),
  useSearchParams: () => new URLSearchParams("persona=p_1&worker=opus"),
}));
vi.mock("next/link", () => ({
  default: ({
    href,
    children,
  }: {
    href: string;
    children: React.ReactNode;
  }) => <a href={href}>{children}</a>,
}));

// The page is gated by RequireAuth (covered by require-auth.test.tsx). Stub it
// to a pass-through so these tests stay focused on the run control plane.
vi.mock("@/app/auth/RequireAuth", () => ({
  RequireAuth: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@/app/runs/run-api", async () => {
  const actual =
    await vi.importActual<typeof import("@/app/runs/run-api")>(
      "@/app/runs/run-api",
    );
  return {
    ...actual,
    startRun: vi.fn(),
    fetchRuns: vi.fn(),
    fetchPersonaSummaries: vi.fn(),
    fetchRun: vi.fn(),
  };
});

import { startRun, fetchRuns, fetchPersonaSummaries } from "@/app/runs/run-api";
import RunsPage from "@/app/runs/page";

const mockStart = vi.mocked(startRun);
const mockRuns = vi.mocked(fetchRuns);
const mockPersonas = vi.mocked(fetchPersonaSummaries);

describe("RunsPage", () => {
  // Only the router spy is reset between tests; the api mocks are given fresh
  // values per test. Resetting the api mocks in beforeEach races with pending
  // effects from the prior test and triggers spurious unhandled-rejection
  // reports, so we avoid it.
  beforeEach(() => {
    push.mockReset();
  });

  it("should load personas and recent runs (happy path)", async () => {
    mockPersonas.mockResolvedValue([{ id: "p_1", name: "The Essayist" }]);
    mockRuns.mockResolvedValue([
      {
        id: "run_9",
        personaId: "p_1",
        concept: "On Emergence",
        workerId: "opus",
        status: "published",
        createdAt: "2026-06-13T11:59:30.000Z",
        updatedAt: "2026-06-13T11:59:30.000Z",
      },
    ]);
    render(<RunsPage />);
    expect(await screen.findByText("The Essayist")).toBeInTheDocument();
    // New design: the CONCEPT is the prominent, eye-catching item (not the
    // UUID), the whole row links to the run, and the status renders.
    const concept = await screen.findByText("On Emergence");
    expect(concept).toBeInTheDocument();
    expect(concept.closest("a")).toHaveAttribute("href", "/runs/run_9");
    expect(screen.getByText("published")).toBeInTheDocument();
    // The raw run id/UUID is intentionally no longer surfaced in the list.
    expect(screen.queryByText("run_9")).not.toBeInTheDocument();
  });

  it("should start a run and route to the live view (state change)", async () => {
    const user = userEvent.setup();
    mockPersonas.mockResolvedValue([{ id: "p_1", name: "The Essayist" }]);
    mockRuns.mockResolvedValue([]);
    mockStart.mockResolvedValue({ runId: "run_new" });
    render(<RunsPage />);
    await screen.findByText("The Essayist");
    await user.selectOptions(screen.getByLabelText("Persona"), "p_1");
    await user.type(screen.getByLabelText("Concept"), "On Emergence");
    await user.click(screen.getByRole("button", { name: "Start run" }));
    await waitFor(() =>
      expect(push).toHaveBeenCalledWith(
        expect.stringContaining("/runs/run_new"),
      ),
    );
  });

  it("should surface a personas load error (error handling)", async () => {
    mockPersonas.mockRejectedValue(new Error("personas down"));
    mockRuns.mockResolvedValue([]);
    render(<RunsPage />);
    expect(await screen.findByText("personas down")).toBeInTheDocument();
  });

  it("should show an empty note when there are no runs (empty state)", async () => {
    mockPersonas.mockResolvedValue([]);
    mockRuns.mockResolvedValue([]);
    render(<RunsPage />);
    expect(await screen.findByText(/No runs yet/)).toBeInTheDocument();
  });
});
