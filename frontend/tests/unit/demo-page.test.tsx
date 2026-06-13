import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

import { DemoRunner as DemoPage } from "@/components/DemoRunner";

describe("DemoRunner", () => {
  it("should render the three narrative controls and the run surface (happy path)", () => {
    render(<DemoPage streamIntervalMs={1} />);
    expect(
      screen.getByRole("button", { name: /Redraft → publish/ }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Escalation/ })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Refused to publish/ }),
    ).toBeInTheDocument();
    // The four pillar lanes render immediately (mock stream wires on mount).
    expect(screen.getByText("Material")).toBeInTheDocument();
    expect(screen.getByText("Checkpoints")).toBeInTheDocument();
  });

  it("should stream the happy-path mock into the lanes and publish (R2 end-to-end)", async () => {
    render(<DemoPage streamIntervalMs={1} />);
    // The mock plays on a 700ms timer; wait for the terminal published state.
    expect(
      await screen.findByText("published", {}, { timeout: 10000 }),
    ).toBeInTheDocument();
    // The draft timeline shows both attempts (R2).
    expect(screen.getByText("Attempt 1")).toBeInTheDocument();
    expect(screen.getByText("Attempt 2")).toBeInTheDocument();
  });

  it("should switch to the escalation narrative on control click (state change)", async () => {
    const user = userEvent.setup();
    render(<DemoPage streamIntervalMs={1} />);
    await user.click(screen.getByRole("button", { name: /Escalation/ }));
    expect(
      await screen.findByText(/Run paused/, {}, { timeout: 10000 }),
    ).toBeInTheDocument();
  });
});
