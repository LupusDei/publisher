import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import HomePage from "@/app/page";
import { fetchHealth } from "@/lib/api";

vi.mock("@/lib/api", () => ({
  fetchHealth: vi.fn(),
}));

const mockFetchHealth = vi.mocked(fetchHealth);

describe("HomePage (landing hero)", () => {
  beforeEach(() => {
    mockFetchHealth.mockReset();
    // Default: never resolves, so the hero must stand on its own without the
    // health check — the page is finished before/without it resolving.
    mockFetchHealth.mockReturnValue(new Promise<never>(() => {}));
  });

  it("should render a single confident serif headline as the page h1", () => {
    render(<HomePage />);
    const headings = screen.getAllByRole("heading", { level: 1 });
    expect(headings).toHaveLength(1);
    expect(headings[0]).toHaveTextContent(/publish beautiful ideas/i);
  });

  it("should sell the promise in the lead copy", () => {
    render(<HomePage />);
    expect(
      screen.getByText(/persona-voiced, beautiful single-page site/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/governed by a harness/i)).toBeInTheDocument();
  });

  it("should link the primary CTA to /onboarding and the secondary to /runs/demo", () => {
    render(<HomePage />);
    const author = screen.getByRole("link", { name: /author your persona/i });
    expect(author).toHaveAttribute("href", "/onboarding");

    const seeItRun = screen.getByRole("link", { name: /see it run/i });
    expect(seeItRun).toHaveAttribute("href", "/runs/demo");
  });

  it("should reveal the four capability beats", () => {
    render(<HomePage />);
    const beats = screen.getByRole("list", { name: /what the harness does/i });
    const items = within(beats).getAllByRole("listitem");
    expect(items).toHaveLength(4);
    expect(
      within(beats).getByText(/persona voice/i),
    ).toBeInTheDocument();
    expect(within(beats).getByText(/live guardrails/i)).toBeInTheDocument();
    expect(
      within(beats).getByText(/self-correcting drafts/i),
    ).toBeInTheDocument();
    expect(within(beats).getByText(/final sign-off/i)).toBeInTheDocument();
  });

  it("should show the hero without waiting on the health check", () => {
    // health is pending (default mock) — headline + CTA must already be present.
    render(<HomePage />);
    expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /author your persona/i }),
    ).toBeInTheDocument();
  });

  it("should surface the backend health chip on success without blocking the hero", async () => {
    mockFetchHealth.mockResolvedValue({
      status: "ok",
      version: "2.0.1",
      uptimeSeconds: 12,
    });
    render(<HomePage />);
    // Hero is present immediately.
    expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
    // Chip settles in afterwards via the polite live region.
    await waitFor(() =>
      expect(screen.getByText(/backend healthy/i)).toBeInTheDocument(),
    );
    const status = screen.getByRole("status");
    expect(status).toHaveAttribute("aria-live", "polite");
  });

  it("should surface an error chip when the health check fails", async () => {
    mockFetchHealth.mockRejectedValue(
      new Error("Backend health check failed (HTTP 503)"),
    );
    render(<HomePage />);
    // Hero still rendered despite the failing dependency.
    expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByText(/backend unreachable/i)).toBeInTheDocument(),
    );
    expect(screen.getByText(/HTTP 503/i)).toBeInTheDocument();
  });
});
