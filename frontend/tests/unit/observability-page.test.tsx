import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

// next/link → plain anchor so the nav affordance is assertable.
vi.mock("next/link", () => ({
  default: ({
    href,
    children,
  }: {
    href: string;
    children: React.ReactNode;
  }) => <a href={href}>{children}</a>,
}));

// Stub the auth gate to a pass-through so we test the page body, not the gate
// (RequireAuth has its own dedicated tests).
vi.mock("@/app/auth/RequireAuth", () => ({
  RequireAuth: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@/app/observability/observability-api", async () => {
  const actual = await vi.importActual<
    typeof import("@/app/observability/observability-api")
  >("@/app/observability/observability-api");
  return { ...actual, fetchUserObservability: vi.fn() };
});

import { fetchUserObservability } from "@/app/observability/observability-api";
import type { UserObservability } from "@/app/observability/observability-api";
import ObservabilityPage from "@/app/observability/page";

const mockFetch = vi.mocked(fetchUserObservability);

const SNAPSHOT: UserObservability = {
  totalTokensPublished: 1234567,
  perArticle: [
    { runId: "r_1", title: "On Quiet Software", tokens: 80000, status: "published" },
    { runId: "r_2", title: "A Failed Draft", tokens: 12000, status: "failed" },
  ],
  researchLoopCount: 7,
  publishedCount: 1,
  failedCount: 1,
};

describe("ObservabilityPage (user)", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it("should show a loading state before data resolves (initial state)", () => {
    mockFetch.mockReturnValue(new Promise(() => {}));
    render(<ObservabilityPage />);
    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.getByText(/loading your usage/i)).toBeInTheDocument();
  });

  it("should render totals, per-article rows, loops and outcomes (happy path)", async () => {
    mockFetch.mockResolvedValue(SNAPSHOT);
    render(<ObservabilityPage />);

    // Total tokens, formatted with separators.
    expect(await screen.findByText("1,234,567")).toBeInTheDocument();

    // Per-article table rows.
    expect(screen.getByText("On Quiet Software")).toBeInTheDocument();
    expect(screen.getByText("A Failed Draft")).toBeInTheDocument();
    expect(screen.getByText("80,000")).toBeInTheDocument();

    // Research-loop count and outcomes are surfaced.
    expect(screen.getByText("7")).toBeInTheDocument();

    // Accessible table for the per-article cost view.
    expect(
      screen.getByRole("table", { name: /per-article token cost/i }),
    ).toBeInTheDocument();
  });

  it("should show an empty state when no articles exist (empty state)", async () => {
    mockFetch.mockResolvedValue({
      totalTokensPublished: 0,
      perArticle: [],
      researchLoopCount: 0,
      publishedCount: 0,
      failedCount: 0,
    });
    render(<ObservabilityPage />);
    expect(
      await screen.findByText(/no articles yet/i),
    ).toBeInTheDocument();
    // The cost table is not rendered when there's nothing to show.
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("should surface a load error (error handling)", async () => {
    mockFetch.mockRejectedValue(new Error("usage service down"));
    render(<ObservabilityPage />);
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("usage service down");
  });
});
