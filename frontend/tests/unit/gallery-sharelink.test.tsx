import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
  }: {
    href: string;
    children: React.ReactNode;
  }) => <a href={href}>{children}</a>,
}));

// Stub the share client so each rendered ShareLink resolves to "no existing
// share" (its mount-time fetchShare) without a network call; we only assert the
// ShareLink affordance is present per published card.
vi.mock("@/app/runs/run-api", async () => {
  const actual =
    await vi.importActual<typeof import("@/app/runs/run-api")>(
      "@/app/runs/run-api",
    );
  return {
    ...actual,
    fetchRuns: vi.fn(),
    fetchShare: vi.fn(async () => null),
    createShare: vi.fn(),
  };
});

vi.mock("@/app/auth/RequireAuth", () => ({
  RequireAuth: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

import { fetchRuns } from "@/app/runs/run-api";
import GalleryPage from "@/app/runs/gallery/page";

const mockRuns = vi.mocked(fetchRuns);

function run(id: string, status: string) {
  return {
    id,
    personaId: "p_1",
    concept: `concept ${id}`,
    workerId: "opus",
    status: status as never,
    createdAt: "t",
    updatedAt: "t",
  };
}

beforeEach(() => vi.clearAllMocks());

describe("gallery ShareLink wiring", () => {
  it("should render a ShareLink 'Get share link' action on each published card (happy path)", async () => {
    mockRuns.mockResolvedValue([
      run("a", "published"),
      run("b", "published"),
    ]);
    render(<GalleryPage />);

    // Both published cards render and each exposes a share affordance.
    expect(await screen.findByText("concept a")).toBeInTheDocument();
    const shareButtons = await screen.findAllByRole("button", {
      name: /get share link/i,
    });
    expect(shareButtons).toHaveLength(2);
  });

  it("should not render a ShareLink for non-published runs (edge case)", async () => {
    mockRuns.mockResolvedValue([run("a", "published"), run("b", "failed")]);
    render(<GalleryPage />);

    await screen.findByText("concept a");
    // Only the single published card gets a ShareLink.
    const shareButtons = await screen.findAllByRole("button", {
      name: /get share link/i,
    });
    expect(shareButtons).toHaveLength(1);
  });
});

// Run-detail wiring (same US2 task): the detail view exposes ShareLink only once
// the run is published. The page is dynamically imported per-test so its own
// next/navigation + panel mocks can be scoped without colliding with the
// gallery's next/link mock above.
describe("run-detail ShareLink wiring", () => {
  it("should render a ShareLink when the run is published (happy path)", async () => {
    vi.resetModules();
    vi.doMock("next/navigation", () => ({
      useParams: () => ({ id: "run_1" }),
      useSearchParams: () => new URLSearchParams(""),
    }));
    vi.doMock("@/components/LiveRunPanel", () => ({
      LiveRunPanel: () => <div data-testid="live-panel" />,
    }));
    vi.doMock("@/components/CompiledGuardrailPanel", () => ({
      CompiledGuardrailPanel: () => <div data-testid="compiled-panel" />,
    }));
    vi.doMock("@/app/auth/RequireAuth", () => ({
      RequireAuth: ({ children }: { children: React.ReactNode }) => (
        <>{children}</>
      ),
    }));
    vi.doMock("@/app/runs/run-api", async () => {
      const actual =
        await vi.importActual<typeof import("@/app/runs/run-api")>(
          "@/app/runs/run-api",
        );
      return {
        ...actual,
        fetchRun: vi.fn(async () => ({
          id: "run_1",
          personaId: "p_1",
          concept: "c",
          workerId: "opus",
          status: "published" as never,
          createdAt: "t",
          updatedAt: "t",
        })),
        fetchShare: vi.fn(async () => null),
        createShare: vi.fn(),
      };
    });
    const { default: RunDetailPage } = await import("@/app/runs/[id]/page");
    render(<RunDetailPage />);
    expect(
      await screen.findByRole("button", { name: /get share link/i }),
    ).toBeInTheDocument();
  });

  it("should NOT render a ShareLink while the run is not yet published (edge case)", async () => {
    vi.resetModules();
    vi.doMock("next/navigation", () => ({
      useParams: () => ({ id: "run_1" }),
      useSearchParams: () => new URLSearchParams(""),
    }));
    vi.doMock("@/components/LiveRunPanel", () => ({
      LiveRunPanel: () => <div data-testid="live-panel" />,
    }));
    vi.doMock("@/components/CompiledGuardrailPanel", () => ({
      CompiledGuardrailPanel: () => <div data-testid="compiled-panel" />,
    }));
    vi.doMock("@/app/auth/RequireAuth", () => ({
      RequireAuth: ({ children }: { children: React.ReactNode }) => (
        <>{children}</>
      ),
    }));
    vi.doMock("@/app/runs/run-api", async () => {
      const actual =
        await vi.importActual<typeof import("@/app/runs/run-api")>(
          "@/app/runs/run-api",
        );
      return {
        ...actual,
        fetchRun: vi.fn(async () => ({
          id: "run_1",
          personaId: "p_1",
          concept: "c",
          workerId: "opus",
          status: "building" as never,
          createdAt: "t",
          updatedAt: "t",
        })),
        fetchShare: vi.fn(async () => null),
        createShare: vi.fn(),
      };
    });
    const { default: RunDetailPage } = await import("@/app/runs/[id]/page");
    render(<RunDetailPage />);
    // The live panel renders; no share affordance until published.
    expect(await screen.findByTestId("live-panel")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /get share link/i }),
    ).not.toBeInTheDocument();
  });
});
