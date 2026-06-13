import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { AuthProvider } from "@/app/auth/AuthContext";
import * as authApi from "@/app/auth/auth-api";

/**
 * publisher-ask — auth gating of run/persona sub-routes. These tests mount the
 * real RequireAuth (not stubbed) with no stored session and assert that each
 * protected page redirects to /login rather than rendering its content. The
 * gate's internals are covered by require-auth.test.tsx; here we only prove the
 * wiring — that the page is wrapped at all.
 */

const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: replace, replace }),
  usePathname: () => "/protected",
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

// Keep heavy panels / data fetches inert — gating is independent of them.
vi.mock("@/components/LiveRunPanel", () => ({
  LiveRunPanel: () => <div data-testid="live-panel" />,
}));
vi.mock("@/components/CompiledGuardrailPanel", () => ({
  CompiledGuardrailPanel: () => <div data-testid="compiled-panel" />,
}));
vi.mock("@/app/runs/run-api", async () => {
  const actual =
    await vi.importActual<typeof import("@/app/runs/run-api")>(
      "@/app/runs/run-api",
    );
  return {
    ...actual,
    fetchRun: vi.fn().mockResolvedValue(undefined),
    fetchRuns: vi.fn().mockResolvedValue([]),
    publishedUrl: (p: string) => p,
  };
});
vi.mock("@/app/personas/persona-api", async () => {
  const actual = await vi.importActual<
    typeof import("@/app/personas/persona-api")
  >("@/app/personas/persona-api");
  return { ...actual, fetchPersona: vi.fn(), updatePersona: vi.fn() };
});

vi.mock("@/app/auth/auth-api", async () => {
  const actual = await vi.importActual<typeof import("@/app/auth/auth-api")>(
    "@/app/auth/auth-api",
  );
  return { ...actual, fetchMe: vi.fn() };
});

import RunDetailPage from "@/app/runs/[id]/page";
import GalleryPage from "@/app/runs/gallery/page";
import PersonaDetailPage from "@/app/personas/[id]/page";

function renderUnauthenticated(node: React.ReactElement) {
  return render(<AuthProvider>{node}</AuthProvider>);
}

describe("auth-gated routes (publisher-ask)", () => {
  beforeEach(() => {
    window.localStorage.clear();
    replace.mockReset();
    vi.mocked(authApi.fetchMe).mockReset();
  });

  it("should gate /runs/[id] behind RequireAuth and redirect to /login when signed out", async () => {
    renderUnauthenticated(<RunDetailPage />);
    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith(
        expect.stringContaining("/login"),
      ),
    );
    expect(screen.queryByTestId("live-panel")).not.toBeInTheDocument();
  });

  it("should gate /runs/gallery behind RequireAuth and redirect to /login when signed out", async () => {
    renderUnauthenticated(<GalleryPage />);
    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith(
        expect.stringContaining("/login"),
      ),
    );
    expect(
      screen.queryByRole("heading", { name: /Published gallery/ }),
    ).not.toBeInTheDocument();
  });

  it("should gate /personas/[id] behind RequireAuth and redirect to /login when signed out", async () => {
    renderUnauthenticated(<PersonaDetailPage params={{ id: "p_1" }} />);
    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith(
        expect.stringContaining("/login"),
      ),
    );
  });
});
