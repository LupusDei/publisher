import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

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

vi.mock("@/app/runs/run-api", async () => {
  const actual =
    await vi.importActual<typeof import("@/app/runs/run-api")>(
      "@/app/runs/run-api",
    );
  return { ...actual, fetchRun: vi.fn() };
});

import { fetchRun } from "@/app/runs/run-api";
import RunDetailPage from "@/app/runs/[id]/page";

const mockFetchRun = vi.mocked(fetchRun);

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

  it("should fall back to the query-param persona/worker hints when the header fails (error path)", async () => {
    mockFetchRun.mockRejectedValue(new Error("no header"));
    render(<RunDetailPage />);
    // Compiled panel uses the persona hint from the query string.
    expect(await screen.findByTestId("compiled-panel")).toHaveTextContent(
      "compiled:p_1",
    );
    expect(screen.getByText(/Could not load run header/)).toBeInTheDocument();
  });
});
