import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import HomePage from "@/app/page";
import { fetchHealth } from "@/lib/api";

vi.mock("@/lib/api", () => ({
  fetchHealth: vi.fn(),
}));

const mockFetchHealth = vi.mocked(fetchHealth);

describe("HomePage (health shell)", () => {
  beforeEach(() => {
    mockFetchHealth.mockReset();
  });

  it("should show the loading state before the health check resolves", () => {
    // Never resolves → stays in loading.
    mockFetchHealth.mockReturnValue(new Promise<never>(() => {}));
    render(<HomePage />);
    expect(screen.getByText(/checking backend/i)).toBeInTheDocument();
  });

  it("should render the healthy state with version and uptime on success", async () => {
    mockFetchHealth.mockResolvedValue({
      status: "ok",
      version: "1.4.2",
      uptimeSeconds: 73,
    });
    render(<HomePage />);
    await waitFor(() =>
      expect(screen.getByText(/backend healthy/i)).toBeInTheDocument(),
    );
    expect(screen.getByText(/version 1\.4\.2/i)).toBeInTheDocument();
    expect(screen.getByText(/up 73s/i)).toBeInTheDocument();
  });

  it("should render the error state when the health check rejects", async () => {
    mockFetchHealth.mockRejectedValue(
      new Error("Backend health check failed (HTTP 500)"),
    );
    render(<HomePage />);
    await waitFor(() =>
      expect(screen.getByText(/backend unreachable/i)).toBeInTheDocument(),
    );
    expect(screen.getByText(/HTTP 500/i)).toBeInTheDocument();
  });
});
