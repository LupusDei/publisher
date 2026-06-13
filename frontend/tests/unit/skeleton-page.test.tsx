import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import SkeletonPage from "@/app/skeleton/page";
import { startRun, fetchRunEvents } from "@/lib/api";

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return {
    ...actual,
    startRun: vi.fn(),
    fetchRunEvents: vi.fn(),
  };
});

const mockStartRun = vi.mocked(startRun);
const mockFetchRunEvents = vi.mocked(fetchRunEvents);

describe("SkeletonPage", () => {
  beforeEach(() => {
    mockStartRun.mockReset();
    mockFetchRunEvents.mockReset();
  });

  it("should disable Run until a persona id is entered (initial state)", () => {
    render(<SkeletonPage />);
    expect(screen.getByRole("button", { name: /run/i })).toBeDisabled();
  });

  it("should publish and render the page + event list on success (state change)", async () => {
    mockStartRun.mockResolvedValue({
      runId: "run_1",
      receipt: {
        id: "run_1",
        url: "/published/run_1",
        bytes: 100,
        publishedAt: "t",
        workerId: "mock",
      },
    });
    mockFetchRunEvents.mockResolvedValue([
      { runId: "run_1", seq: 0, ts: "t", t: "phase" },
      { runId: "run_1", seq: 1, ts: "t", t: "published", pillar: "material" },
    ]);

    render(<SkeletonPage />);
    await userEvent.type(screen.getByLabelText(/persona id/i), "p_1");
    await userEvent.click(screen.getByRole("button", { name: /run/i }));

    await waitFor(() =>
      expect(screen.getByText(/run journal/i)).toBeInTheDocument(),
    );
    expect(screen.getByTitle("published page")).toBeInTheDocument();
    expect(screen.getByText(/#1 published/i)).toBeInTheDocument();
  });

  it("should render an error state when the run fails (error handling)", async () => {
    mockStartRun.mockRejectedValue(new Error("Failed to start run (HTTP 404)"));
    render(<SkeletonPage />);
    await userEvent.type(screen.getByLabelText(/persona id/i), "nope");
    await userEvent.click(screen.getByRole("button", { name: /run/i }));
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(/HTTP 404/),
    );
  });
});
