import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

vi.mock("next/navigation", () => ({
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

// Stub the live panel + compiled panel — this test covers the page wrapper's
// data-loading + wiring, not the (separately-tested) stream internals.
vi.mock("@/components/LiveRunPanel", () => ({
  LiveRunPanel: ({ runId, workerId }: { runId: string; workerId?: string }) => (
    <div data-testid="live-panel">
      panel:{runId}:{workerId ?? "?"}
    </div>
  ),
}));
vi.mock("@/components/CompiledGuardrailPanel", () => ({
  CompiledGuardrailPanel: ({ personaId }: { personaId: string }) => (
    <div data-testid="compiled-panel">compiled:{personaId}</div>
  ),
}));

// The page is gated by RequireAuth (covered by require-auth.test.tsx and
// auth-gated-routes.test.tsx); stub it as a pass-through so this test exercises
// the page's own data-loading + wiring.
vi.mock("@/app/auth/RequireAuth", () => ({
  RequireAuth: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@/app/runs/run-api", async () => {
  const actual =
    await vi.importActual<typeof import("@/app/runs/run-api")>(
      "@/app/runs/run-api",
    );
  return { ...actual, fetchRun: vi.fn(), resumeRun: vi.fn() };
});

import { fetchRun, resumeRun } from "@/app/runs/run-api";
import RunDetailPage from "@/app/runs/[id]/page";
import userEvent from "@testing-library/user-event";

const mockFetchRun = vi.mocked(fetchRun);
const mockResumeRun = vi.mocked(resumeRun);

describe("RunDetailPage", () => {
  it("should render the live panel and compiled-guardrail panel from the run header (happy path)", async () => {
    mockFetchRun.mockResolvedValue({
      id: "run_1",
      personaId: "p_from_header",
      concept: "c",
      workerId: "sonnet",
      status: "building",
      createdAt: "t",
      updatedAt: "t",
    });
    render(<RunDetailPage />);
    expect(await screen.findByTestId("compiled-panel")).toHaveTextContent(
      "compiled:p_from_header",
    );
    expect(screen.getByTestId("live-panel")).toHaveTextContent("panel:run_1");
  });

  it("should offer Resume for an interrupted run and POST resume on click (publisher-kgv)", async () => {
    const user = userEvent.setup();
    mockResumeRun.mockReset();
    mockFetchRun.mockReset();
    // First load → interrupted; after resume the header refetch → researching.
    mockFetchRun
      .mockResolvedValueOnce({
        id: "run_1",
        personaId: "p_1",
        concept: "Orbits",
        workerId: "sonnet",
        status: "interrupted",
        createdAt: "t",
        updatedAt: "t",
      })
      .mockResolvedValue({
        id: "run_1",
        personaId: "p_1",
        concept: "Orbits",
        workerId: "sonnet",
        status: "researching",
        createdAt: "t",
        updatedAt: "t",
      });
    mockResumeRun.mockResolvedValue(undefined);

    render(<RunDetailPage />);
    const btn = await screen.findByRole("button", { name: /Resume run/ });
    await user.click(btn);

    expect(mockResumeRun).toHaveBeenCalledWith("run_1");
    // After resume + header refetch, the interrupted banner is gone.
    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: /Resume run/ }),
      ).not.toBeInTheDocument(),
    );
  });

  it("should fall back to the query-param persona/worker hints when the header fails (error path)", async () => {
    mockFetchRun.mockRejectedValue(new Error("no header"));
    render(<RunDetailPage />);
    // The error banner is set asynchronously after fetchRun rejects, so wait
    // for it explicitly. The compiled panel renders immediately from the
    // query-string hint, so a synchronous getByText for the banner can race
    // ahead of the rejection microtask under full-suite concurrency.
    expect(
      await screen.findByText(/Could not load run header/),
    ).toBeInTheDocument();
    // Compiled panel uses the persona hint from the query string.
    expect(screen.getByTestId("compiled-panel")).toHaveTextContent(
      "compiled:p_1",
    );
  });
});
