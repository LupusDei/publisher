import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Mock the share API client: ShareLink owns presentation only (Constitution §4
// — network logic stays in run-api.ts), so we stub the client and assert the
// component wires clicks → calls → rendered URL / error.
vi.mock("@/app/runs/run-api", async () => {
  const actual =
    await vi.importActual<typeof import("@/app/runs/run-api")>(
      "@/app/runs/run-api",
    );
  return {
    ...actual,
    createShare: vi.fn(),
    fetchShare: vi.fn(),
    revokeShare: vi.fn(),
  };
});

import { createShare, fetchShare } from "@/app/runs/run-api";
import { ShareLink } from "@/components/ShareLink";

const mockCreate = vi.mocked(createShare);
const mockFetch = vi.mocked(fetchShare);

const LINK = {
  slug: "abcDEF1234567890zz",
  url: "http://api.test/p/abcDEF1234567890zz",
};

beforeEach(() => {
  vi.clearAllMocks();
  // Default: no existing share on load (idempotent-fetch resolves null).
  mockFetch.mockResolvedValue(null);
});

afterEach(() => vi.unstubAllGlobals());

describe("ShareLink", () => {
  it("should render the 'Get share link' action initially (initial state)", async () => {
    render(<ShareLink runId="run_1" />);
    expect(
      await screen.findByRole("button", { name: /get share link/i }),
    ).toBeInTheDocument();
    // The URL is not shown until a share exists.
    expect(screen.queryByText(LINK.url)).not.toBeInTheDocument();
  });

  it("should call createShare and render the URL with copy + open actions on success (state change)", async () => {
    const user = userEvent.setup();
    mockCreate.mockResolvedValue(LINK);
    render(<ShareLink runId="run_1" />);

    await user.click(
      await screen.findByRole("button", { name: /get share link/i }),
    );

    expect(mockCreate).toHaveBeenCalledWith("run_1");
    // The minted URL is surfaced.
    expect(await screen.findByText(LINK.url)).toBeInTheDocument();
    // Copy + Open affordances exist and are labelled.
    expect(
      screen.getByRole("button", { name: /copy/i }),
    ).toBeInTheDocument();
    const open = screen.getByRole("link", { name: /open/i });
    expect(open).toHaveAttribute("href", LINK.url);
    expect(open).toHaveAttribute("target", "_blank");
  });

  it("should copy the URL to the clipboard when Copy is clicked (clipboard)", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn(async () => {});
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    mockCreate.mockResolvedValue(LINK);
    render(<ShareLink runId="run_1" />);

    await user.click(
      await screen.findByRole("button", { name: /get share link/i }),
    );
    await user.click(await screen.findByRole("button", { name: /copy/i }));

    expect(writeText).toHaveBeenCalledWith(LINK.url);
    expect(await screen.findByText(/copied/i)).toBeInTheDocument();
  });

  it("should surface an error message when createShare fails (error handling)", async () => {
    const user = userEvent.setup();
    mockCreate.mockRejectedValue(new Error("Not your run"));
    render(<ShareLink runId="run_1" />);

    await user.click(
      await screen.findByRole("button", { name: /get share link/i }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent("Not your run");
  });

  it("should show an existing share link on load without minting (idempotent UI)", async () => {
    mockFetch.mockResolvedValue(LINK);
    render(<ShareLink runId="run_1" />);

    // The pre-existing link renders; createShare is never called on mount.
    expect(await screen.findByText(LINK.url)).toBeInTheDocument();
    await waitFor(() => expect(mockCreate).not.toHaveBeenCalled());
  });
});
