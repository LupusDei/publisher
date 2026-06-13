import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import type { AuthUser } from "@/app/auth/auth-api";

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
  }: {
    href: string;
    children: React.ReactNode;
  }) => <a href={href}>{children}</a>,
}));

// RequireAuth is a pass-through here; the role gate is what we're testing.
vi.mock("@/app/auth/RequireAuth", () => ({
  RequireAuth: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// Control the current user/role via useAuth.
const useAuthMock = vi.fn();
vi.mock("@/app/auth/AuthContext", () => ({
  useAuth: () => useAuthMock(),
}));

vi.mock("@/app/observability/observability-api", async () => {
  const actual = await vi.importActual<
    typeof import("@/app/observability/observability-api")
  >("@/app/observability/observability-api");
  return { ...actual, fetchAdminObservability: vi.fn() };
});

import { fetchAdminObservability } from "@/app/observability/observability-api";
import type { AdminObservability } from "@/app/observability/observability-api";
import AdminObservabilityPage from "@/app/admin/observability/page";

const mockFetch = vi.mocked(fetchAdminObservability);

const ADMIN: AuthUser = {
  id: "u_admin",
  email: "ops@example.com",
  role: "admin",
  createdAt: "2026-06-13T00:00:00.000Z",
};
const REGULAR: AuthUser = { ...ADMIN, id: "u_1", email: "ada@example.com", role: "user" };

const SNAPSHOT: AdminObservability = {
  tokenTotals: 9876543,
  publishedCount: 120,
  rejectedCount: 30,
  rejectedRatio: 0.2,
  latency: { avgMs: 820, p95Ms: 2400 },
  phaseDurations: { research: 1500, build: 3200, refine: 900 },
  errorsByType: {
    GuardrailViolation: 12,
    ResearchTimeout: 4,
    RenderError: 1,
  },
};

function asAdmin() {
  useAuthMock.mockReturnValue({ status: "authenticated", user: ADMIN });
}
function asUser() {
  useAuthMock.mockReturnValue({ status: "authenticated", user: REGULAR });
}

describe("AdminObservabilityPage", () => {
  beforeEach(() => {
    mockFetch.mockReset();
    useAuthMock.mockReset();
  });

  it("should deny a non-admin and not fetch admin data (role gate)", () => {
    asUser();
    render(<AdminObservabilityPage />);
    expect(screen.getByRole("alert")).toHaveTextContent(/admin/i);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("should show a loading state for an admin before data resolves (initial state)", () => {
    asAdmin();
    mockFetch.mockReturnValue(new Promise(() => {}));
    render(<AdminObservabilityPage />);
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("should render aggregate token totals, latency, phases and ratio (happy path)", async () => {
    asAdmin();
    mockFetch.mockResolvedValue(SNAPSHOT);
    render(<AdminObservabilityPage />);

    expect(await screen.findByText("9,876,543")).toBeInTheDocument();
    // Latency avg + p95 surfaced.
    expect(screen.getByText("820 ms")).toBeInTheDocument();
    expect(screen.getByText("2.40 s")).toBeInTheDocument();
    // Rejected/published ratio as a percentage.
    expect(screen.getByText("20.0%")).toBeInTheDocument();
    // Phase durations present, each as an accessible labelled bar.
    expect(
      screen.getByRole("img", { name: /research:.*average/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: /build:.*average/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: /refine:.*average/i }),
    ).toBeInTheDocument();
  });

  it("should render an accessible, severity-bucketed error-tracking panel (error tracking)", async () => {
    asAdmin();
    mockFetch.mockResolvedValue(SNAPSHOT);
    render(<AdminObservabilityPage />);

    const panel = await screen.findByRole("region", {
      name: /error tracking/i,
    });
    expect(panel).toBeInTheDocument();
    // Error types + counts shown.
    expect(screen.getByText("GuardrailViolation")).toBeInTheDocument();
    expect(screen.getByText("12")).toBeInTheDocument();
    // Severity surfaced as TEXT, not color alone (12 -> High, 4 -> Elevated, 1 -> Low).
    expect(screen.getByText(/high/i)).toBeInTheDocument();
    expect(screen.getByText(/elevated/i)).toBeInTheDocument();
    expect(screen.getByText(/low/i)).toBeInTheDocument();
  });

  it("should show an empty error state when there are no errors (empty state)", async () => {
    asAdmin();
    mockFetch.mockResolvedValue({ ...SNAPSHOT, errorsByType: {} });
    render(<AdminObservabilityPage />);
    expect(await screen.findByText(/no errors recorded/i)).toBeInTheDocument();
  });

  it("should surface a load error (error handling)", async () => {
    asAdmin();
    mockFetch.mockRejectedValue(new Error("telemetry unavailable"));
    render(<AdminObservabilityPage />);
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("telemetry unavailable");
  });
});
