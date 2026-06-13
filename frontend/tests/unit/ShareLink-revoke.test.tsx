import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

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

import { createShare, fetchShare, revokeShare } from "@/app/runs/run-api";
import { ShareLink } from "@/components/ShareLink";

const mockCreate = vi.mocked(createShare);
const mockFetch = vi.mocked(fetchShare);
const mockRevoke = vi.mocked(revokeShare);

const LINK = {
  slug: "abcDEF1234567890zz",
  url: "http://api.test/p/abcDEF1234567890zz",
};

beforeEach(() => {
  vi.clearAllMocks();
  mockFetch.mockResolvedValue(null);
});

afterEach(() => vi.unstubAllGlobals());

describe("ShareLink revoke toggle (US3)", () => {
  it("should show a 'Revoke link' action when a share is active (active state)", async () => {
    mockFetch.mockResolvedValue(LINK);
    render(<ShareLink runId="run_1" />);

    expect(await screen.findByText(LINK.url)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /revoke link/i }),
    ).toBeInTheDocument();
    // While a share is active, the mint action is not offered.
    expect(
      screen.queryByRole("button", { name: /get share link/i }),
    ).not.toBeInTheDocument();
  });

  it("should call revokeShare and revert to 'Get share link' on revoke (state change)", async () => {
    const user = userEvent.setup();
    mockFetch.mockResolvedValue(LINK);
    mockRevoke.mockResolvedValue(undefined);
    render(<ShareLink runId="run_1" />);

    await user.click(
      await screen.findByRole("button", { name: /revoke link/i }),
    );

    expect(mockRevoke).toHaveBeenCalledWith("run_1");
    // Reverts to the mint affordance; the URL is gone.
    expect(
      await screen.findByRole("button", { name: /get share link/i }),
    ).toBeInTheDocument();
    expect(screen.queryByText(LINK.url)).not.toBeInTheDocument();
  });

  it("should surface an error and keep the link when revoke fails (error handling)", async () => {
    const user = userEvent.setup();
    mockFetch.mockResolvedValue(LINK);
    mockRevoke.mockRejectedValue(new Error("Not your run"));
    render(<ShareLink runId="run_1" />);

    await user.click(
      await screen.findByRole("button", { name: /revoke link/i }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent("Not your run");
    // The link stays visible since revoke did not succeed.
    expect(screen.getByText(LINK.url)).toBeInTheDocument();
  });

  it("should let a freshly minted link be revoked in the same session (round-trip)", async () => {
    const user = userEvent.setup();
    mockCreate.mockResolvedValue(LINK);
    mockRevoke.mockResolvedValue(undefined);
    render(<ShareLink runId="run_1" />);

    // Mint, then the revoke toggle appears.
    await user.click(
      await screen.findByRole("button", { name: /get share link/i }),
    );
    await user.click(
      await screen.findByRole("button", { name: /revoke link/i }),
    );

    expect(mockRevoke).toHaveBeenCalledWith("run_1");
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /get share link/i }),
      ).toBeInTheDocument(),
    );
  });
});
